/* Сервер ИИ-стилиста «Проекции» — Cloudflare Worker.
 * Принимает POST /chat { lang, profile, messages } и спрашивает модель Claude (Anthropic API).
 * Ключ ANTHROPIC_API_KEY хранится в секретах Worker'а и никогда не попадает в приложение.
 * Инструкции стилиста — здесь, на сервере: из приложения их не подменить. */

const MODEL_DEFAULT = 'claude-haiku-5-5';
const LANG_NAMES = { ru: 'Russian', en: 'English', nl: 'Dutch', fr: 'French', de: 'German', pl: 'Polish' };
const MAX_MSG = 12, MAX_CHARS = 800;

const SYSTEM = (lang, profile) => `You are the personal AI stylist inside the clothing-size app "Proekciya".
You talk with the app's user about clothes, outfits, colours, fit and sizes.

Always reply in ${LANG_NAMES[lang] || 'Russian'}. Be warm, concrete and brief: usually 2–6 short sentences or a short list. Use **bold** sparingly. No emoji.

What you know about the user (from the app, measured or entered by them):
${JSON.stringify(profile)}
Use it: name exact sizes from "sizes" when you recommend items, pick colours from "palette", respect "bodyShape" and "season".
Size charts are European; remind that fit differs between brands only when sizes matter.

Rules:
- Talk only about style, clothing, shoes, accessories, colours, fit, sizes and shopping for clothes. Politely steer other topics back to style.
- Be kind about the body. Never shame, never suggest losing or gaining weight, dieting or changing the body. Clothes adapt to the person, not the other way round.
- Don't invent shop names, prices or links. If asked where to buy, describe what to search for (item, colour, size, fabric).
- Don't ask for or comment on photos; the app never sends them.
- If the user asks something unsafe or unrelated to style, decline in one sentence.

When you suggest one concrete outfit the user could try on the 3D model, end your reply with exactly one tag on its own line:
<look>{"title":"short outfit name in the reply language","top":"#hex","bot":"#hex","out":"#hex or null","sh":"#hex","bt":"p|j|sh|sk|d","sl":"s|l","ol":"j|c"}</look>
top = top colour, bot = bottom colour (for a dress use the dress colour for both), out = jacket/coat colour or null, sh = shoes colour,
bt = bottom type (p trousers, j jeans, sh shorts, sk skirt, d dress), sl = sleeves (s short, l long), ol = outerwear length (j jacket, c coat).
Use only 6-digit hex colours. Do not mention the tag in the text. Skip the tag when you don't suggest a specific outfit.`;

const REGION_LANG = { BE: 'Dutch (or French if the user writes French)', NL: 'Dutch', DE: 'German', FR: 'French', PL: 'Polish', UK: 'English', RU: 'Russian' };
const SEARCH_SYSTEM = (lang, region, profile, category) => `You turn a shopper's request into search queries for online clothing marketplaces.
The shopper's profile: ${JSON.stringify(profile)}. Marketplace country: ${region}.
Return ONLY JSON, no other text: {"items":[{"title":"...","query":"...","kind":"...","note":"..."}]}
- 1 to 4 items. One item per piece of clothing the shopper needs (an outfit request becomes several items).
- "query": 2–6 words for the marketplace search box, written in ${REGION_LANG[region] || 'English'}, including the gender word
  (men's/women's in that language), colour and key style words. Do NOT put the size in the query — the app adds it.
- "kind": one of top, bottom, jeans, dress, outer, shoes, hat, bra, acc.${category && category !== 'auto' ? ' The shopper chose the category "' + category + '".' : ''}
- "title" and "note" in ${LANG_NAMES[lang] || 'Russian'}: title = short name of the item; note = one short tip on fit or colour for this person (optional).
- Only clothing, shoes and accessories. If the request is not about clothes, return {"items":[]}.`;

const TRYON_SYSTEM = lang => `You look at a product photo from an online clothing shop and describe the main garment so an app can show it on a 3D mannequin.
Return ONLY JSON: {"kind":"top|bottom|jeans|dress|outer|shoes|other","color":"#hex","sl":"s|l","cut":"t|sh|sk","ol":"j|c","title":"..."}
kind: top (shirt, T-shirt, sweater, blouse), bottom (trousers, shorts, skirt), jeans, dress (also jumpsuit), outer (jacket, coat), shoes, other.
color: the garment's main colour as a 6-digit hex (not the background, not the skin).
sl: sleeve length for top/dress (s short or sleeveless, l long). cut for bottom/jeans: t trousers, sh shorts, sk skirt. ol for outer: j jacket (to hips), c coat (to knee or longer).
title: short garment name in ${LANG_NAMES[lang] || 'Russian'}, 2–4 words. If the photo shows no clothing, return {"kind":"other"}.`;

async function askClaude(env, system, messages, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': env.ANTHROPIC_VERSION || '2023-06-01' },
    body: JSON.stringify({ model: env.MODEL || MODEL_DEFAULT, max_tokens: maxTokens, system, messages })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { console.log('anthropic error', r.status, JSON.stringify(data).slice(0, 500)); throw new Error('model error ' + r.status); }
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

/* Скидки: ИИ ищет в интернете (инструмент web_search) новости о распродажах в магазинах страны */
const DEALS_SYSTEM = (lang, country, city, shops, today) => `You help a shopper find clothing sales. Today is ${today}. The shopper is in ${city ? city + ', ' : ''}${country}.
Use web search to find CURRENT and UPCOMING discounts, sales and promo codes for clothing and shoes at these shops in that country: ${shops.join(', ')}.
Also include big national sale periods (for example seasonal sales, Black Friday) if they start within the next 30 days.
Rules: only report deals you actually found in search results; never invent dates, percentages or codes. Prefer official shop pages and well-known news sites.
Answer ONLY with JSON (no other text), in ${LANG_NAMES[lang] || 'Russian'}:
{"summary":"2-3 sentences: when and where it is best to buy now","deals":[{"shop":"...","what":"what is discounted","discount":"e.g. up to 50 %","when":"dates or 'now'","url":"https://..."}]}
At most 8 deals, most useful first. If nothing is found, return {"summary":"...","deals":[]}.`;

async function askClaudeSearch(env, system, user, maxTokens, location) {
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, ...(location ? { user_location: location } : {}) }];
  let messages = [{ role: 'user', content: user }], data = null, all = [];
  for (let turn = 0; turn < 4; turn++) { // длинный поиск сервер может прервать (pause_turn) — тогда продолжаем
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': env.ANTHROPIC_VERSION || '2023-06-01' },
      body: JSON.stringify({ model: env.MODEL || MODEL_DEFAULT, max_tokens: maxTokens, system, messages, tools })
    });
    data = await r.json().catch(() => ({}));
    if (!r.ok) { console.log('anthropic error', r.status, JSON.stringify(data).slice(0, 500)); throw new Error('model error ' + r.status); }
    all = all.concat(data.content || []);
    if (data.stop_reason !== 'pause_turn') break;
    messages = [...messages, { role: 'assistant', content: data.content }];
  }
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const sources = []; const seen = new Set();
  for (const b of all) for (const c of (b.citations || [])) if (c.url && !seen.has(c.url)) { seen.add(c.url); sources.push({ url: c.url, title: c.title || c.url }); }
  return { text, sources: sources.slice(0, 10) };
}

const cors = origin => ({
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400'
});
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors() } });

/* профиль — только ожидаемые поля и разумной длины */
function cleanProfile(p) {
  if (!p || typeof p !== 'object') return {};
  const s = JSON.stringify(p);
  return s.length > 4000 ? {} : p;
}

/* ИИ-примерка (FASHN через fal.ai): ключ FAL_KEY — в секретах Worker'а. Фото не сохраняются. */
async function vton(req, env) {
  if (!env.FAL_KEY) return json({ error: 'no-key' }, 501);
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  if (!IMG.test(b.model_image || '') || !IMG.test(b.garment_image || '') || b.model_image.length + b.garment_image.length > 20e6) return json({ error: 'bad image' }, 400);
  const cat = ['tops', 'bottoms', 'one-pieces'].includes(b.category) ? b.category : 'auto';
  const r = await fetch('https://fal.run/' + (env.FAL_MODEL || 'fal-ai/fashn/tryon/v1.6'), { method: 'POST',
    headers: { Authorization: 'Key ' + env.FAL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_image: b.model_image, garment_image: b.garment_image, category: cat, garment_photo_type: 'auto', mode: 'balanced', num_samples: 1, output_format: 'png' }) });
  const j = await r.json().catch(() => ({}));
  const u = j.images && j.images[0] && j.images[0].url;
  if (!r.ok || !u) return json({ error: j.detail ? JSON.stringify(j.detail) : 'fal ' + r.status }, 502);
  const img = await fetch(u);
  return new Response(img.body, { headers: { ...cors(), 'Content-Type': img.headers.get('content-type') || 'image/png' } });
}

/* Магазины одежды рядом: Google Places (ключ GOOGLE_PLACES_KEY) — самые полные данные;
 * без ключа — OpenStreetMap (Overpass), с сервера нет ограничений браузера, пробуем несколько зеркал. */
const PLACE_TYPES = ['clothing_store', 'shoe_store', 'department_store', 'shopping_mall', 'sporting_goods_store'];
async function places(req, env) {
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const lat = +b.lat, lon = +b.lon, radius = Math.min(Math.max(+b.radius || 3000, 500), 20000), lang = String(b.lang || 'ru').slice(0, 5);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'bad location' }, 400);
  if (env.GOOGLE_PLACES_KEY) {
    try { return json({ source: 'google', places: await googlePlaces(env.GOOGLE_PLACES_KEY, lat, lon, radius, lang) }); }
    catch (e) { console.log('google places', e.message); }
  }
  try { return json({ source: 'osm', places: await osmPlaces(lat, lon, radius) }); }
  catch (e) { return json({ error: 'maps unavailable' }, 502); }
}
async function googlePlaces(key, lat, lon, radius, lang) {
  const H = { 'content-type': 'application/json', 'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.googleMapsUri,nextPageToken' };
  const circle = { circle: { center: { latitude: lat, longitude: lon }, radius } };
  const out = new Map(), add = list => { for (const p of list || []) { const o = out.get(p.id); if (!o) out.set(p.id, p); else if (p.kids) o.kids = true; } };
  // поиск рядом даёт до 20 мест за запрос — спрашиваем по каждому виду магазинов отдельно
  const near = PLACE_TYPES.map(t => fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: H,
    body: JSON.stringify({ includedTypes: [t], maxResultCount: 20, languageCode: lang, rankPreference: 'DISTANCE', locationRestriction: circle }) })
    .then(r => r.json()).then(j => { if (j.error) throw new Error(j.error.message); add(j.places); }));
  // и текстовый поиск по страницам: одежда (до 60), детская одежда (до 40), обувь, товары для малышей
  const textSearch = async (textQuery, pages, includedType) => { let token = '';
    for (let i = 0; i < pages; i++) {
      const j = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: H,
        body: JSON.stringify({ textQuery, ...(includedType ? { includedType } : {}), languageCode: lang, pageSize: 20, locationBias: circle, ...(token ? { pageToken: token } : {}) }) }).then(r => r.json());
      if (j.error) throw new Error(j.error.message); add((j.places || []).map(p => textQuery.includes('child') || textQuery.includes('baby') ? { ...p, kids: true } : p));
      token = j.nextPageToken; if (!token) break;
    } };
  const res = await Promise.allSettled([...near, textSearch('clothing store', 3, 'clothing_store'), textSearch("children's clothing store", 2), textSearch('baby store', 1), textSearch('shoe store', 1, 'shoe_store')]);
  if (!out.size && res.every(r => r.status === 'rejected')) throw new Error(res[0].reason && res[0].reason.message);
  return [...out.values()].map(p => ({ name: p.displayName && p.displayName.text || '', address: p.formattedAddress || '',
    lat: p.location && p.location.latitude, lon: p.location && p.location.longitude, kind: p.kids ? 'kids' : p.primaryType || (p.types || [])[0] || '', types: p.types || [], map: p.googleMapsUri || '' }))
    .filter(p => p.name && isFinite(p.lat));
}
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function osmPlaces(lat, lon, radius) {
  const q = `[out:json][timeout:25];nwr(around:${radius},${lat},${lon})[shop~"^(clothes|shoes|boutique|fashion|department_store|sports|fashion_accessories|second_hand|baby_goods|bag|mall)$"];out center tags 300;`;
  const one = u => Promise.race([fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 30000))]);
  const j = await Promise.any(OVERPASS.map(one));
  return (j.elements || []).map(e => { const t = e.tags || {};
    return { name: t.name || t.brand || '', address: [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean).join(' '),
      lat: e.lat != null ? e.lat : e.center && e.center.lat, lon: e.lon != null ? e.lon : e.center && e.center.lon, kind: /child|baby|kid/.test(t.clothes || '') ? 'kids' : t.shop, map: '' }; })
    .filter(p => p.name && isFinite(p.lat));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
    if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'proekciya-stylist' });
    if (req.method === 'GET' && url.pathname === '/vton') return json({ ok: !!env.FAL_KEY });
    if (req.method === 'POST' && url.pathname === '/vton') return vton(req, env);
    if (req.method === 'POST' && url.pathname === '/places') return places(req, env);
    if (req.method !== 'POST' || !['/chat', '/search', '/tryon', '/deals'].includes(url.pathname)) return json({ error: 'not found' }, 404);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server is not configured' }, 500);

    let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const lang = LANG_NAMES[body.lang] ? body.lang : 'ru';

    if (url.pathname === '/tryon') {
      const m = String(body.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m || m[2].length > 1500000) return json({ error: 'bad image' }, 400);
      try {
        const text = await askClaude(env, TRYON_SYSTEM(lang), [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: 'Describe the main garment.' }] }], 200);
        const j = text.match(/\{[\s\S]*\}/);
        return json(j ? JSON.parse(j[0]) : { kind: 'other' });
      } catch (e) { return json({ error: String(e.message || e) }, 502); }
    }

    if (url.pathname === '/deals') {
      const country = String(body.country || '').slice(0, 60) || 'Belgium', cc = String(body.cc || '').toUpperCase().slice(0, 2);
      const city = String(body.city || '').slice(0, 60);
      const shops = (Array.isArray(body.shops) ? body.shops : []).map(x => String(x).slice(0, 40)).slice(0, 14);
      const loc = /^[A-Z]{2}$/.test(cc) ? { type: 'approximate', country: cc, ...(city ? { city } : {}) } : null;
      try {
        const r = await askClaudeSearch(env, DEALS_SYSTEM(lang, country, city, shops.length ? shops : ['popular clothing shops'], new Date().toISOString().slice(0, 10)),
          'Find clothing and shoe sales for me.', 1800, loc);
        const m = r.text.match(/\{[\s\S]*\}/); let parsed = { summary: '', deals: [] };
        try { parsed = m ? JSON.parse(m[0]) : parsed; } catch (e) {}
        const deals = (Array.isArray(parsed.deals) ? parsed.deals : []).slice(0, 8).map(d => ({ shop: String(d.shop || '').slice(0, 60), what: String(d.what || '').slice(0, 200),
          discount: String(d.discount || '').slice(0, 40), when: String(d.when || '').slice(0, 80), url: /^https:\/\//.test(d.url || '') ? String(d.url).slice(0, 400) : '' }));
        return json({ summary: String(parsed.summary || '').slice(0, 600), deals, sources: r.sources });
      } catch (e) { return json({ error: String(e.message || e) }, 502); }
    }

    if (url.pathname === '/search') {
      const request = String(body.request || '').trim().slice(0, 500);
      if (!request) return json({ error: 'no request' }, 400);
      const region = REGION_LANG[body.region] ? body.region : 'BE';
      try {
        const text = await askClaude(env, SEARCH_SYSTEM(lang, region, cleanProfile(body.profile), String(body.category || 'auto').slice(0, 20)), [{ role: 'user', content: request }], 600);
        const m = text.match(/\{[\s\S]*\}/);
        const parsed = m ? JSON.parse(m[0]) : { items: [] };
        return json({ items: Array.isArray(parsed.items) ? parsed.items.slice(0, 4) : [] });
      } catch (e) { return json({ error: String(e.message || e) }, 502); }
    }

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_MSG)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    while (messages.length && messages[0].role !== 'user') messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'no question' }, 400);

    let text;
    try { text = await askClaude(env, SYSTEM(lang, cleanProfile(body.profile)), messages, 700); }
    catch (e) { return json({ error: String(e.message || e) }, 502); }
    return json({ text });
  }
};
