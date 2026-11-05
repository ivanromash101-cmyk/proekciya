/* Поиск одежды на маркетплейсах: запрос клиента + его размер → ссылки на поиск в магазинах страны.
 * С ИИ-сервером (config.chatUrl) запрос разбирает ИИ-стилист и пишет его на языке магазинов;
 * без сервера — разбор по ключевым словам прямо в приложении.
 * Подключается после app.js: пользуется gender, M, sizes(), jeans(), shapeName(), store. */
(function () {
'use strict';
const CFG = window.PROEKCIYA_CONFIG || {};
const API = (CFG.chatUrl || '').replace(/\/$/, '');
const el = id => document.getElementById(id);
const form = el('shopForm'); if (!form) return;
const q = el('shopQ'), regionSel = el('shopRegion'), catSel = el('shopCat'), out = el('shopResults'), status = el('shopStatus');
const enc = encodeURIComponent;
const I18N_T = t => (window.I18N ? I18N.tr(t) : t);

/* ---------- магазины по странам ---------- */
// параметры ссылки; запятые не кодируем — Zalando понимает список размеров «50,M»
const qs = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => k + '=' + enc(v).replace(/%2C/gi, ',')).join('&');
// третий элемент — какие фильтры магазин принимает прямо в ссылке: s — размер, c — цвет, p — цена
const G = ['Google Shopping', s => 'https://www.google.com/search?tbm=shop&q=' + enc(s), ''];
// у Zalando путь поиска на языке сайта; /catalog/ без перевода уводит на «браузер не поддерживается»
// проверено на zalando.be: size=M / 50,M / 33x32 / 42 / 75B, colors=BLACK…, price_from / price_to
const ZAL = (d, path) => ['Zalando', (s, o = {}) => `https://www.zalando.${d}/${path}/?` + qs({ q: o.zq || s, size: o.zSize, colors: o.zColor, price_from: o.pmin, price_to: o.pmax }), 'scp'];
const AMZ = d => ['Amazon', (s, o = {}) => `https://www.amazon.${d}/s?` + qs({ k: s, 'low-price': o.pmin, 'high-price': o.pmax }), 'p'];
const VIN = d => ['Vinted', (s, o = {}) => `https://www.vinted.${d}/catalog?` + qs({ search_text: s, price_from: o.pmin, price_to: o.pmax }), 'p'];
const ASOS = p => ['ASOS', s => `https://www.asos.com/${p}search/?q=` + enc(s), ''];
const SHOPS = {
  BE: [ZAL('be', 'catalogus'), AMZ('com.be'), ['bol.com', s => 'https://www.bol.com/be/nl/s/?searchtext=' + enc(s)], VIN('be'), ASOS(''), G],
  NL: [ZAL('nl', 'catalogus'), AMZ('nl'), ['bol.com', s => 'https://www.bol.com/nl/nl/s/?searchtext=' + enc(s)], VIN('nl'), ASOS(''), G],
  DE: [ZAL('de', 'katalog'), AMZ('de'), ['About You', s => 'https://www.aboutyou.de/suche?term=' + enc(s)], VIN('de'), ASOS('de/'), G],
  FR: [ZAL('fr', 'catalogue'), AMZ('fr'), VIN('fr'), ASOS('fr/'), G],
  PL: [ZAL('pl', 'katalog'), ['Allegro', s => 'https://allegro.pl/listing?string=' + enc(s)], AMZ('pl'), VIN('pl'), G],
  UK: [ASOS(''), AMZ('co.uk'), VIN('co.uk'), G],
  // другие страны: поиск там, где формат ссылки известен (Amazon, Vinted, ASOS) + Google Shopping; сайты магазинов — в блоке «по местоположению»
  ES: [AMZ('es'), VIN('es'), ASOS('es/'), G], IT: [AMZ('it'), VIN('it'), ASOS(''), G], PT: [AMZ('es'), VIN('pt'), ASOS(''), G],
  AT: [AMZ('de'), VIN('at'), ASOS('de/'), G], CH: [['Galaxus', s => 'https://www.galaxus.ch/de/search?q=' + enc(s), ''], ASOS('de/'), G],
  IE: [ASOS(''), VIN('ie'), AMZ('co.uk'), G], SE: [AMZ('se'), VIN('se'), ASOS(''), G], DK: [VIN('dk'), ASOS(''), G],
  CZ: [VIN('cz'), ASOS(''), G], LT: [VIN('lt'), ['Pigu', s => 'https://pigu.lt/lt/search?q=' + enc(s), ''], G], LV: [VIN('lv'), G], EE: [VIN('ee'), G],
  RU: [['Wildberries', s => 'https://www.wildberries.ru/catalog/0/search.aspx?search=' + enc(s)], ['Ozon', s => 'https://www.ozon.ru/search/?text=' + enc(s)],
       ['Lamoda', s => 'https://www.lamoda.ru/catalogsearch/result/?q=' + enc(s)], G]
};
const regionGuess = () => { const r = (navigator.language || '').split('-')[1]; return r && SHOPS[r.toUpperCase()] ? r.toUpperCase() : r === 'GB' ? 'UK' : 'BE'; };
regionSel.value = store.get('pr-shop-region', regionGuess());
regionSel.onchange = () => { store.set('pr-shop-region', regionSel.value); syncFilters(); if (lastOutfit && last && !last[0]?.ai && !q.value) window.ProShop.showOutfit(lastOutfit); else if (last) show(last); };

/* ---------- вид вещи и размер ---------- */
const KINDS = [
  ['jeans', /джинс|jean|dżins|jeans/i],
  ['dress', /плать|сарафан|dress|jurk|robe|kleid|sukien/i],
  ['bra', /бюстг|лифчик|bra\b|beha|soutien|\bbh\b|biustonos/i],
  ['shoes', /обув|кроссов|кед|туфл|ботин|сапог|лофер|сандал|shoe|sneaker|trainer|boot|schoen|chaussur|basket|schuh|stiefel|but[yó]|trampk|sneakers/i],
  ['hat', /шапк|кепк|шляп|панам|\bhat\b|beanie|\bcap\b|muts|pet\b|bonnet|chapeau|mütze|hut\b|czapk|kapelusz/i],
  ['outer', /куртк|пальто|пуховик|парк|плащ|тренч|ветровк|jacket|coat|parka|jas\b|jack|veste|manteau|blouson|jacke|mantel|kurtk|płaszcz/i],
  ['bottom', /брюк|штан|шорт|юбк|леггинс|чинос|trouser|pants|shorts|skirt|leggings|chino|broek|rok\b|pantalon|jupe|hose|rock\b|spodn|spódnic|szort/i],
  ['top', /.*/]
];
const kindOf = text => (catSel.value !== 'auto' ? catSel.value : KINDS.find(([, re]) => re.test(text))[0]);
function sizeFor(kind) {
  const r = sizes(), ru = regionSel.value === 'RU';
  switch (kind) {
    case 'jeans': return jeans();
    case 'bottom': return ru ? String(r.bottomRu) : 'EU ' + r.bottom;
    case 'shoes': return ru ? String(r.shoe - 1) : 'EU ' + r.shoe;
    case 'hat': return String(r.hat);
    case 'bra': return r.bra || r.letter;
    case 'acc': return '';
    default: return ru ? String(r.ru) : r.letter;
  }
}
/* ---------- фильтры: цена, цвет, бренд, размер на сайте ---------- */
const LANGS = ['ru', 'en', 'nl', 'fr', 'de', 'pl'];
const COLORS = { // слово на языках поиска + код цвета Zalando
  black: ['чёрный', 'black', 'zwart', 'noir', 'schwarz', 'czarny', 'BLACK'], white: ['белый', 'white', 'wit', 'blanc', 'weiß', 'biały', 'WHITE'],
  gray: ['серый', 'grey', 'grijs', 'gris', 'grau', 'szary', 'GRAY'], blue: ['синий', 'blue', 'blauw', 'bleu', 'blau', 'niebieski', 'BLUE'],
  beige: ['бежевый', 'beige', 'beige', 'beige', 'beige', 'beżowy', 'BEIGE'], brown: ['коричневый', 'brown', 'bruin', 'marron', 'braun', 'brązowy', 'BROWN'],
  green: ['зелёный', 'green', 'groen', 'vert', 'grün', 'zielony', 'GREEN'], red: ['красный', 'red', 'rood', 'rouge', 'rot', 'czerwony', 'RED'],
  pink: ['розовый', 'pink', 'roze', 'rose', 'rosa', 'różowy', 'PINK'], yellow: ['жёлтый', 'yellow', 'geel', 'jaune', 'gelb', 'żółty', 'YELLOW'],
  purple: ['фиолетовый', 'purple', 'paars', 'violet', 'lila', 'fioletowy', 'PURPLE'], orange: ['оранжевый', 'orange', 'oranje', 'orange', 'orange', 'pomarańczowy', 'ORANGE']
};
const F = { pmin: el('shopPmin'), pmax: el('shopPmax'), color: el('shopColor'), brand: el('shopBrand'), sizeF: el('shopSizeF') };
function filt() {
  const n = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) && x > 0 ? Math.round(x) : ''; };
  let pmin = n(F.pmin.value), pmax = n(F.pmax.value);
  if (pmin && pmax && pmin > pmax) [pmin, pmax] = [pmax, pmin];
  return { pmin, pmax, color: F.color.value, brand: F.brand.value.trim(), sizeF: F.sizeF.checked };
}
/* размер в формате фильтра Zalando: несколько вариантов через запятую */
function zSize(kind) {
  const r = sizes();
  switch (kind) {
    case 'jeans': return `${Math.round(M.waist/2.54)}x${Math.round(M.inseam/2.54)}`;
    case 'bottom': return `${r.bottom},${r.letter}`;
    case 'shoes': return String(r.shoe);
    case 'bra': return r.bra || '';
    case 'hat': case 'acc': return '';
    default: return gender === 'f' ? `${r.eu},${r.letter}` : `${r.letter},${r.eu}`;
  }
}
const CUR = { RU: '₽', UK: '£', PL: 'zł', SE: 'kr', DK: 'kr', CZ: 'Kč', CH: 'CHF' };
function syncFilters() {
  for (const c of form.querySelectorAll('.cur')) c.textContent = CUR[regionSel.value] || '€';
  const f = filt(), n = [f.pmin || f.pmax, f.color, f.brand].filter(Boolean).length, sum = el('shopFilters').querySelector('summary');
  let b = sum.querySelector('.fcount'); if (!b) { b = document.createElement('span'); b.className = 'fcount'; b.setAttribute('data-noi18n', ''); sum.appendChild(b); }
  b.textContent = n; b.hidden = !n;
  store.set('pr-shop-f', { pmin: F.pmin.value, pmax: F.pmax.value, color: F.color.value, brand: F.brand.value, sizeF: F.sizeF.checked });
}
{ const v = store.get('pr-shop-f', null);
  if (v) { F.pmin.value = v.pmin || ''; F.pmax.value = v.pmax || ''; F.color.value = v.color || ''; F.brand.value = v.brand || ''; F.sizeF.checked = v.sizeF !== false; } }
for (const i of Object.values(F)) i.addEventListener('change', () => { syncFilters(); if (last) show(last, true); });
/* ---------- ваш размер в брендах ---------- */
function renderBrands() {
  const box = el('shopBrands'); if (!box || !window.Brands) return;
  const rows = Brands.list().map(k => Brands.sizes(k)).filter(Boolean);
  const dash = '—';
  box.querySelector('tbody').innerHTML = rows.map(r => `<tr><th scope="row"><button type="button" class="link" data-brand="${esc(r.name)}" data-noi18n>${esc(r.name)}</button></th>
    <td data-noi18n>${esc(r.top || dash)}</td><td data-noi18n>${esc(r.bottom || dash)}</td><td data-noi18n>${esc(r.jeans || dash)}</td></tr>`).join('');
}
{ const box = el('shopBrands');
  if (box) {
    box.addEventListener('toggle', renderBrands);
    box.addEventListener('click', e => { const b = e.target.closest('[data-brand]'); if (!b) return;
      F.brand.value = b.dataset.brand; el('shopFilters').open = true; syncFilters(); if (last) show(last, true); q.focus(); });
    let sig = ''; setInterval(() => { if (!box.open) return; const s2 = JSON.stringify([M, gender]); if (s2 !== sig) { sig = s2; renderBrands(); } }, 500);
  } }
el('shopFReset').onclick = () => { F.pmin.value = F.pmax.value = F.brand.value = ''; F.color.value = ''; F.sizeF.checked = true; syncFilters(); if (last) show(last, true); };

/* язык поисковых запросов — язык магазинов страны */
const REGION_LANG = { BE: 'nl', NL: 'nl', DE: 'de', AT: 'de', CH: 'de', FR: 'fr', PL: 'pl', UK: 'en', IE: 'en', RU: 'ru' }; // остальные страны — запрос по-английски
const qLang = () => { const r = regionSel.value, app = window.I18N ? I18N.lang : 'ru'; return r === 'BE' && app === 'fr' ? 'fr' : REGION_LANG[r] || 'en'; };
const GW = { ru: ['мужские', 'женские'], en: ["men's", "women's"], nl: ['heren', 'dames'], fr: ['homme', 'femme'], de: ['Herren', 'Damen'], pl: ['męskie', 'damskie'] };
const SW = { ru: 'размер', en: 'size', nl: 'maat', fr: 'taille', de: 'Größe', pl: 'rozmiar' };
const genderWord = () => (GW[qLang()] || GW.en)[gender === 'f' ? 1 : 0];
const sizeWord = kind => kind === 'jeans' ? '' : (SW[qLang()] || SW.en) + ' ';
const W = s => (window.I18N ? I18N.word(qLang(), s) : Promise.resolve(s));

/* ---------- результат ---------- */
let last = null, lastOutfit = null;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function show(items, quiet) {
  last = items;
  const shops = SHOPS[regionSel.value] || SHOPS.BE, f = filt(), li = Math.max(0, LANGS.indexOf(qLang()));
  const cw = f.color ? COLORS[f.color][li] : '';
  out.innerHTML = items.map((it, n) => {
    const bs = window.Brands ? Brands.forKind(`${f.brand} ${it.query} ${it.title}`, it.kind) : null; // размер по таблице бренда
    const size = it.size || (bs ? bs.label : sizeFor(it.kind));
    let base = it.query; const low = () => base.toLowerCase();
    if (f.brand && !low().includes(f.brand.toLowerCase())) base = f.brand + ' ' + base;
    const noColor = base.replace(/\s+/g, ' ').trim(); // Zalando: цвет только фильтром — бренд + слово цвета в запросе сбрасывают фильтры
    if (cw && !low().includes(cw.toLowerCase())) base = base + ' ' + cw;
    base = base.replace(/\s+/g, ' ').trim();
    const sizeTxt = !size ? '' : it.kind === 'jeans' ? size : sizeWord(it.kind) + size;
    const query = `${base} ${sizeTxt}`.replace(/\s+/g, ' ').trim();
    const o = { zSize: f.sizeF && size ? (bs ? bs.z : zSize(it.kind)) : '', zColor: f.color ? COLORS[f.color][6] : '', pmin: f.pmin, pmax: f.pmax };
    o.zq = `${o.zColor ? noColor : base} ${o.zSize ? '' : sizeTxt}`.replace(/\s+/g, ' ').trim();
    const applied = fl => { const a = []; if (fl.includes('s') && o.zSize) a.push(I18N_T('размер')); if (fl.includes('c') && o.zColor) a.push(I18N_T('цвет')); if (fl.includes('p') && (o.pmin || o.pmax)) a.push(I18N_T('цена')); return a; };
    const flt = shops.map(([name, , fl]) => [name, applied(fl || '')]).filter(([, a]) => a.length);
    return `<article class="shop-item">
      <div class="si-head"><h3${it.ai || it.own ? ' data-noi18n' : ''}>${esc(it.title)}</h3>${size ? `<span class="si-size" title="Ваш размер">${esc(size)}</span>` : ''}</div>
      ${it.note ? `<p class="note"${it.ai ? ' data-noi18n' : ''}>${esc(it.note)}</p>` : ''}
      ${bs ? `<p class="si-flt">${esc(I18N_T('Размер по таблице бренда'))} <b data-noi18n>${esc(bs.brand)}</b></p>` : ''}
      <p class="si-q"><span>Запрос:</span> <code data-noi18n>${esc(query)}</code></p>
      <div class="si-shops">${shops.map(([name, url, fl]) => { const a = applied(fl || '');
        return `<a class="shop-btn" href="${esc(url(query, o))}" target="_blank" rel="noopener noreferrer" data-noi18n${a.length ? ` title="${esc(a.join(', '))}"` : ''}>${esc(name)}${a.length ? '<span class="ok" aria-hidden="true">✓</span>' : ''}</a>`; }).join('')}</div>
      ${flt.length ? `<p class="si-flt" data-noi18n>✓ ${esc(I18N_T('Сразу с фильтрами'))}: ${esc(flt.map(([nm, a]) => `${nm} (${a.join(', ')})`).join('; '))}</p>` : ''}
      <div class="si-try"><button type="button" class="small cart-add" data-cart="${n}">В корзину</button></div>
    </article>`;
  }).join('');
  out.hidden = !items.length;
  if (items.length && !quiet) out.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---------- разбор запроса ---------- */
/* без ИИ: русский запрос для магазинов другой страны переводим по словарю вещей и цветов */
const T5 = (en, nl, fr, de, pl) => ({ en, nl, fr, de, pl });
const ITEM_WORDS = [ // основа русского слова → вещь на языках магазинов (порядок: от точного к общему)
  [/кроссов|кед/i, T5('sneakers', 'sneakers', 'baskets', 'Sneaker', 'sneakersy')], [/ботин|сапог/i, T5('boots', 'laarzen', 'bottes', 'Stiefel', 'buty za kostkę')],
  [/туфл|лофер/i, T5('shoes', 'schoenen', 'chaussures', 'Schuhe', 'półbuty')], [/сандал|шлёп|шлеп/i, T5('sandals', 'sandalen', 'sandales', 'Sandalen', 'sandały')],
  [/джинс/i, T5('jeans', 'jeans', 'jean', 'Jeans', 'jeansy')], [/шорт/i, T5('shorts', 'shorts', 'short', 'Shorts', 'szorty')],
  [/юбк/i, T5('skirt', 'rok', 'jupe', 'Rock', 'spódnica')], [/брюк|штан|чинос/i, T5('trousers', 'broek', 'pantalon', 'Hose', 'spodnie')],
  [/плать|сарафан/i, T5('dress', 'jurk', 'robe', 'Kleid', 'sukienka')], [/костюм/i, T5('suit', 'pak', 'costume', 'Anzug', 'garnitur')],
  [/пиджак|жакет|блейзер/i, T5('blazer', 'blazer', 'blazer', 'Blazer', 'marynarka')], [/пуховик/i, T5('puffer jacket', 'pufferjas', 'doudoune', 'Daunenjacke', 'kurtka puchowa')],
  [/пальто/i, T5('coat', 'mantel', 'manteau', 'Mantel', 'płaszcz')], [/куртк|ветровк|парк/i, T5('jacket', 'jas', 'veste', 'Jacke', 'kurtka')],
  [/худи|толстовк/i, T5('hoodie', 'hoodie', 'sweat à capuche', 'Hoodie', 'bluza z kapturem')], [/свитер|джемпер|кардиган/i, T5('jumper', 'trui', 'pull', 'Pullover', 'sweter')],
  [/рубашк/i, T5('shirt', 'overhemd', 'chemise', 'Hemd', 'koszula')], [/футболк|майк/i, T5('t-shirt', 't-shirt', 't-shirt', 'T-Shirt', 't-shirt')],
  [/блузк/i, T5('blouse', 'blouse', 'chemisier', 'Bluse', 'bluzka')], [/поло/i, T5('polo shirt', 'polo', 'polo', 'Poloshirt', 'koszulka polo')],
  [/шапк/i, T5('beanie', 'muts', 'bonnet', 'Mütze', 'czapka')], [/кепк|бейсболк/i, T5('cap', 'pet', 'casquette', 'Cap', 'czapka z daszkiem')],
  [/бюстг|лифчик/i, T5('bra', 'beha', 'soutien-gorge', 'BH', 'biustonosz')], [/купальн/i, T5('swimsuit', 'badpak', 'maillot de bain', 'Badeanzug', 'strój kąpielowy')],
  [/обув/i, T5('shoes', 'schoenen', 'chaussures', 'Schuhe', 'buty')]
];
const ADJ_WORDS = [ // уточнения
  [/зимн/i, T5('winter', 'winter', 'hiver', 'Winter', 'zimowa')], [/лётн|летн/i, T5('summer', 'zomer', 'été', 'Sommer', 'letnia')],
  [/кожан/i, T5('leather', 'leren', 'cuir', 'Leder', 'skórzana')], [/спортивн|для бега|беговы/i, T5('sport', 'sport', 'sport', 'Sport', 'sportowe')],
  [/офис|делов|классич/i, T5('business', 'zakelijk', 'business', 'Business', 'biznesowy')], [/свадьб|вечерн|праздн/i, T5('evening', 'gala', 'soirée', 'Abend', 'wieczorowa')],
  [/льнян/i, T5('linen', 'linnen', 'lin', 'Leinen', 'lniana')], [/шерст/i, T5('wool', 'wol', 'laine', 'Wolle', 'wełniany')]
];
const RU_COLOR = [['black', /чёрн|черн/i], ['white', /бел(ый|ая|ое|ые|ого|ую|ым)/i], ['gray', /сер(ый|ая|ое|ые|ого)/i], ['blue', /син|голуб/i], ['beige', /бежев/i],
  ['brown', /коричн/i], ['green', /зелён|зелен|хаки/i], ['red', /красн|бордов/i], ['pink', /розов/i], ['yellow', /жёлт|желт/i], ['purple', /фиолет|сирен/i], ['orange', /оранж/i]];
function translateQuery(text) {
  const lang = qLang();
  if (lang === 'ru' || !/[а-яё]/i.test(text)) return null;
  const pick = list => list.filter(([re]) => re.test(text)).map(([, w]) => w[lang] || w.en);
  const items = pick(ITEM_WORDS); if (!items.length) return null;
  const li = LANGS.indexOf(lang), cols = RU_COLOR.filter(([, re]) => re.test(text)).map(([k]) => COLORS[k][li]);
  const latin = (text.match(/[A-Za-z][A-Za-z0-9'&.-]*/g) || []).join(' '); // бренды и модели латиницей
  return [latin, ...pick(ADJ_WORDS), items[0], ...cols].filter(Boolean).join(' ');
}
function localItems(text) {
  const kind = kindOf(text), tq = translateQuery(text);
  return [{ title: text, query: `${tq || text} ${genderWord()}`, kind, own: true, translated: !!tq }];
}
async function aiItems(text) {
  const r = sizes();
  const res = await fetch(API + '/search', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lang: window.I18N ? I18N.lang : 'ru', region: regionSel.value, request: text, category: catSel.value,
      profile: { gender: gender === 'f' ? 'female' : 'male', sizes: { letter: r.letter, top: r.top, bottom: r.bottomTxt, jeans: jeans(), shoes: r.shoeTxt }, bodyShape: shapeName() } }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.items)) throw new Error(data.error || res.status);
  const ok = ['top', 'bottom', 'jeans', 'dress', 'outer', 'shoes', 'hat', 'bra', 'acc'];
  return data.items.slice(0, 5).filter(i => i && i.query).map(i => ({ title: String(i.title || i.query).slice(0, 80), query: String(i.query).slice(0, 120),
    kind: ok.includes(i.kind) ? i.kind : kindOf(i.query), note: i.note ? String(i.note).slice(0, 200) : '', ai: true }));
}
async function search(text) {
  text = (text || '').trim(); if (!text) { q.focus(); return; }
  store.set('pr-shop-q', text); lastOutfit = null;
  status.textContent = API ? 'ИИ-стилист составляет запрос…' : '';
  el('shopGo').disabled = true;
  let items;
  try { items = API ? await aiItems(text) : localItems(text); }
  catch (e) { console.warn('shop', e); items = localItems(text); status.textContent = 'ИИ недоступен — ищем по вашему тексту.'; }
  if (API && items[0] && items[0].ai) status.textContent = '';
  el('shopGo').disabled = false;
  if (!API && items[0] && items[0].own && /[а-яё]/i.test(text) && qLang() !== 'ru') status.textContent = items[0].translated ? 'Запрос переведён на язык магазинов.' : 'Пишите запрос на языке магазинов страны — так поиск будет точнее.';
  show(items);
  announce('Найдено вариантов запроса: ' + items.length);
}
form.addEventListener('submit', e => { e.preventDefault(); search(q.value); });
out.addEventListener('click', e => {
  const c = e.target.closest('[data-cart]');
  if (c && last && window.Cart) { const it = last[+c.dataset.cart]; Cart.add({ title: it.title, kind: it.kind, hex: it.hex || (window.TryOn && TryOn.colorFromText(it.title + ' ' + it.query)), sl: it.sl, query: it.query, size: it.size || sizeFor(it.kind), own: !!(it.own || it.ai) }); return; }
  const t = e.target.closest('[data-try],[data-photo]'); if (!t || !last || !window.TryOn) return;
  const it = last[+(t.dataset.try ?? t.dataset.photo)];
  const hex = it.hex || TryOn.colorFromText(it.title + ' ' + it.query);
  const g = { kind: it.kind, hex, title: it.title, query: it.query, sl: it.sl };
  if (t.dataset.try !== undefined && hex && !(window.PhotoFit && PhotoFit.active)) TryOn.apply(g); else TryOn.open(g); // на фото нужна картинка товара
});
if (el('shopPhoto')) el('shopPhoto').onclick = () => window.TryOn && TryOn.open({ kind: catSel.value !== 'auto' ? catSel.value : 'top' });
el('shopChips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { q.value = b.textContent; search(b.textContent); } });
el('shopMode').textContent = API ? 'ИИ-стилист составит запрос на языке магазинов выбранной страны.' : 'Без ИИ-стилиста запрос переводится по словарю вещей и цветов. Сложные запросы лучше писать на языке магазинов страны.';
q.value = store.get('pr-shop-q', '');

/* для чата и готовых образов: открыть вкладку и показать вещи */
const KIND_OF_SLOT = (slot, name) => slot === 'bottom' ? (/джинс/i.test(name) ? 'jeans' : 'bottom')
  : slot === 'acc' ? (/шапк|бини|кепк|повязк|шляп/i.test(name) ? 'hat' : 'acc') : slot;
window.ProShop = {
  sizeFor,
  /* вещи готового образа встроенного стилиста: [{ slot, name, colorName }] */
  async showOutfit(items) {
    selectTab('t-shop'); setSheet(true); status.textContent = ''; q.value = '';
    lastOutfit = items;
    const list = await Promise.all(items.map(async i => ({ title: `${i.name} (${i.colorName})`, hex: i.color || null,
      sl: /футболк|поло|шорт|коротк|топ\b|майк/i.test(i.name) ? 's' : 'l',
      query: `${(await W(i.name)).toLowerCase()} ${(await W(i.colorName)).toLowerCase()} ${genderWord()}`, kind: KIND_OF_SLOT(i.slot, i.name) })));
    show(list);
  },
  showItems(list) { selectTab('t-shop'); setSheet(true); status.textContent = ''; q.value = ''; show(list.map(i => ({ title: i.title, query: `${i.query} ${genderWord()}`, kind: i.kind || kindOf(i.query) }))); },
  search(text) { selectTab('t-shop'); setSheet(true); q.value = text; search(text); }
};
syncFilters();
})();
