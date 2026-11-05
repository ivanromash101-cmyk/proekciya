/* ИИ-стилист: чат на вкладке «Стиль».
 * Сообщения и мерки уходят на сервер (server/worker.js), он спрашивает языковую модель.
 * Фото никогда не отправляются. Пока сервер не настроен — демо-режим на встроенном стилисте.
 * Подключается после app.js и пользуется его состоянием: gender, M, look, sizes(), shapeName(), stylePrefs. */
(function () {
'use strict';
const CFG = window.PROEKCIYA_CONFIG || {};
const URL_ = (CFG.chatUrl || '').replace(/\/$/, '');
const DEMO = !URL_;
const KEY_LOG = 'pr-chat', KEY_OK = 'pr-chat-consent';
const MAX_KEEP = 30;

const el = id => document.getElementById(id);
const log = el('chatLog'), form = el('chatForm'), input = el('chatInput'), sendBtn = el('chatSend');
const consent = el('chatConsent'), chips = el('chatChips');
if (!log || !form) return;

let history = store.get(KEY_LOG, []);   // [{ role: 'user'|'assistant', content, look? }]
let busy = false, pendingText = null;

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

/* ---------- профиль клиента для стилиста ---------- */
function profile() {
  const r = sizes(), rec = Stylist.recommend({ gender, M, shape: shapeName(), look, style: stylePrefs.style, season: stylePrefs.season, typeOverride: stylePrefs.ct, sizes: r, jeans: jeans() });
  return {
    gender: gender === 'f' ? 'female' : 'male',
    measurementsCm: { ...M },
    sizes: { letter: r.letter, top: r.top, bottom: r.bottomTxt, jeans: jeans(), shirt: r.shirtTxt, bra: r.bra || null, shoes: r.shoeTxt, hat: r.hatTxt },
    bodyShape: shapeName(),
    colorType: rec.typeName, palette: rec.palette.map(p => p[1]), avoidColors: rec.avoidColors,
    style: stylePrefs.style, season: stylePrefs.season,
    look: { skin: look.skin, hair: look.hair, eyes: look.eyes }
  };
}

/* ---------- образ из ответа: <look>{...}</look> ---------- */
const HEX = /^#[0-9a-f]{6}$/i;
function parseLook(text) {
  const m = text.match(/<look>([\s\S]*?)<\/look>/i);
  if (!m) return { text: text.trim(), look: null };
  let lk = null;
  try {
    const o = JSON.parse(m[1]);
    if (HEX.test(o.top) && HEX.test(o.bot) && HEX.test(o.sh)) lk = {
      title: String(o.title || '').slice(0, 60),
      model: { top: o.top, bot: o.bot, out: HEX.test(o.out || '') ? o.out : null, sh: o.sh,
        bt: ['p', 'j', 'sh', 'sk', 'd'].includes(o.bt) ? o.bt : 'p', sl: o.sl === 's' ? 's' : 'l', ol: o.ol === 'c' ? 'c' : 'j' }
    };
  } catch (e) {}
  return { text: text.replace(m[0], '').trim(), look: lk };
}
function tryLook(lk) {
  outfit = lk.model; outfitTitle = lk.title || 'ИИ-стилист';
  store.set('pr-outfit', outfit); store.set('pr-outfit-title', outfitTitle);
  setView('clothes', true); renderStyle();
  if (!isWide()) setSheet(false);
  notify(`Образ «${outfitTitle}» на модели.`, 'Стилист');
}

/* ---------- отрисовка ---------- */
function render() {
  log.innerHTML = history.map((h, i) => {
    const me = h.role === 'user';
    const btn = h.look ? `<div class="row"><button type="button" class="small" data-shop="${i}">Найти в магазинах</button></div>` : '';
    return `<div class="msg ${me ? 'me' : 'ai'}"><div class="bubble"${h.demo ? '' : ' data-noi18n'}>${fmt(h.content)}</div>${btn}</div>`;
  }).join('') + (busy ? '<div class="msg ai"><div class="bubble typing" aria-label="Стилист печатает"><i></i><i></i><i></i></div></div>' : '');
  el('chatEmpty').hidden = history.length > 0 || busy;
  el('chatClear').hidden = !history.length;
  log.scrollTop = log.scrollHeight;
}
log.addEventListener('click', e => {
  const b = e.target.closest('[data-look]'); if (b) { tryLook(history[+b.dataset.look].look); return; }
  const s = e.target.closest('[data-shop]'); if (!s || !window.ProShop) return;
  const h = history[+s.dataset.shop];
  if (h.look && h.look.items) ProShop.showOutfit(h.look.items);
  else ProShop.search((h.look && h.look.title ? h.look.title + ': ' : '') + h.content.slice(0, 400));
});

/* ---------- демо-ответ из встроенного стилиста ---------- */
function demoReply(q) {
  const r = sizes(), rec = Stylist.recommend({ gender, M, shape: shapeName(), look, style: stylePrefs.style, season: stylePrefs.season, typeOverride: stylePrefs.ct, sizes: r, jeans: jeans() });
  const o = rec.outfits[Math.floor(Math.random()*rec.outfits.length)] || rec.outfits[0];
  const lines = [
    'Демо-режим: ИИ-стилист ещё не подключён, отвечает встроенный стилист.',
    `Ваш размер ${r.letter}, фигура «${shapeName()}», цветотип «${rec.typeName}».`,
    rec.focus,
    o ? `Образ «${o.title}»: ` + o.items.map(i => `${i.name} (${i.colorName})`).join(', ') + '.' : ''
  ].filter(Boolean);
  return { content: lines.join('\n'), look: o ? { title: o.title, model: o.model, items: o.items.map(i => ({ slot: i.slot, name: i.name, colorName: i.colorName, color: i.color })) } : null, demo: true };
}

/* ---------- отправка ---------- */
async function send(text) {
  text = text.trim().slice(0, 800); if (!text || busy) return;
  if (!DEMO && !store.get(KEY_OK, false)) { pendingText = text; consent.hidden = false; el('chatAgree').focus(); return; }
  history.push({ role: 'user', content: text }); input.value = ''; busy = true; sendBtn.disabled = true; render();
  try {
    let msg;
    if (DEMO) { await new Promise(r => setTimeout(r, 600)); msg = demoReply(text); }
    else {
      const res = await fetch(URL_ + '/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lang: window.I18N ? I18N.lang : 'ru', profile: profile(), messages: history.slice(-12).map(h => ({ role: h.role, content: h.content })) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) throw new Error(data.error || res.status);
      const p = parseLook(data.text); msg = { content: p.text, look: p.look };
    }
    history.push({ role: 'assistant', ...msg });
    announce(msg.content); say(msg.content);
  } catch (e) {
    console.warn('chat', e);
    history.pop(); input.value = text;
    notify('Стилист сейчас недоступен. Проверьте интернет и попробуйте ещё раз.', 'Стилист');
  }
  busy = false; sendBtn.disabled = false;
  history = history.slice(-MAX_KEEP); store.set(KEY_LOG, history); render();
}
form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
chips.addEventListener('click', e => { const b = e.target.closest('button'); if (b) send(b.textContent); });
el('chatAgree').onclick = () => { store.set(KEY_OK, true); consent.hidden = true; const t = pendingText; pendingText = null; if (t) send(t); };
el('chatDecline').onclick = () => { consent.hidden = true; pendingText = null; input.focus(); };
el('chatClear').onclick = () => { history = []; store.del(KEY_LOG); render(); input.focus(); };
el('chatMode').textContent = DEMO ? 'демо-режим' : 'онлайн';
el('chatMode').classList.toggle('demo', DEMO);
render();
})();
