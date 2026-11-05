/* Языки интерфейса. Логика приложения работает на русском, а этот модуль переводит то,
 * что видно и слышно: текст страницы, подписи для TalkBack, сообщения и озвучку.
 * Словари — www/i18n/<код>.txt, строка в строку с ru.txt (# — число, % — текст в «кавычках»).
 * Чтобы добавить язык: скопируйте en.txt, переведите строки и допишите язык в LANGS. */
(function (root) {
'use strict';
const LANGS = [
  ['ru', 'Русский', 'ru-RU'], ['en', 'English', 'en-GB'], ['nl', 'Nederlands', 'nl-BE'],
  ['fr', 'Français', 'fr-BE'], ['de', 'Deutsch', 'de-DE'], ['pl', 'Polski', 'pl-PL']
];
const KEY = 'pr-lang';
const ATTRS = ['aria-label', 'placeholder', 'title', 'alt', 'aria-roledescription'];
const CY = /[А-Яа-яЁё]/;
const SEPS = ['\n', '. ', ': ', ' · ', ', ', ' — ', ' / ', ' → '];

let lang = 'ru', map = null, cache = new Map(), keysP = null, listeners = [];
const saved = (() => { try { return localStorage.getItem(KEY); } catch (e) { return null; } })();
const known = c => LANGS.some(l => l[0] === c);
if (saved && known(saved)) lang = saved;
else { const nav = (navigator.language || 'ru').slice(0, 2).toLowerCase(); lang = known(nav) ? nav : 'ru'; }

const lines = async code => { const r = await fetch('i18n/' + code + '.txt', { cache: 'no-cache' }); if (!r.ok) throw new Error(code); return (await r.text()).split(/\r?\n/); };

const dicts = {};
function dict(code) { // словарь ru → code (Map), загружается один раз
  if (!dicts[code]) dicts[code] = (async () => {
    keysP = keysP || lines('ru');
    const [K, V] = await Promise.all([keysP, lines(code)]);
    const m = new Map();
    for (let i = 0; i < K.length; i++) { const k = K[i].trim(), v = (V[i] || '').trim(); if (k && v && !k.startsWith('## ')) m.set(k, v); }
    return m;
  })().catch(e => { delete dicts[code]; throw e; });
  return dicts[code];
}
async function load(code) {
  if (code === 'ru') { map = null; cache = new Map(); return; }
  map = await dict(code); cache = new Map();
}

/* ---------- перевод строки ---------- */
function look(x) {
  if (!x) return null;
  x = x.replace(/[\u00a0\u202f]/g, ' ');
  let v = map.get(x); if (v != null) return v;
  const nums = [], xn = x.replace(/\d+(?:[.,]\d+)?/g, n => { nums.push(n); return '#'; });
  if (xn !== x && (v = map.get(xn)) != null) return v.replace(/#/g, () => nums.shift() ?? '');
  if (x.includes('«')) {
    const inner = [], xq = x.replace(/«([^»]*)»/g, (m, a) => { inner.push(a); return '«%»'; });
    const qn = [], xqn = xq.replace(/\d+(?:[.,]\d+)?/g, n => { qn.push(n); return '#'; });
    v = map.get(xq) ?? map.get(xqn);
    if (v != null) return v.replace(/#/g, () => qn.shift() ?? '').replace(/%/g, () => tr(inner.shift() ?? ''));
  }
  return null;
}
function trCore(s) {
  let v = look(s); if (v != null) return v;
  const m = s.match(/^(.*?)([.:!?…]+)$/);
  if (m && m[1]) { v = look(m[1]); if (v != null) return v + m[2]; }
  for (const sep of SEPS) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep), out = parts.map(p => tr(p));
    if (out.some((o, i) => o !== parts[i])) return out.join(sep);
  }
  // «вещь (цвет)»
  const pm = s.match(/^(.+?) \(([^()]+)\)([.:!?…]*)$/);
  if (pm) { const a = tr(pm[1]), b = tr(pm[2]); if (a !== pm[1] || b !== pm[2]) return a + ' (' + b + ')' + pm[3]; }
  // известное начало + остаток («Размер M», «Сейчас мужчина», «Отметьте макушку»)
  const w = s.split(' ');
  for (let k = w.length - 1; k >= 1; k--) {
    const head = w.slice(0, k).join(' '), h = look(head);
    if (h != null) { const tail = w.slice(k).join(' '); return h + ' ' + (CY.test(tail) ? tr(tail) : tail); }
  }
  if (m && m[1]) { const inner = trCore(m[1]); if (inner !== m[1]) return inner + m[2]; }
  return s;
}
function tr(s) {
  if (!map || s == null) return s;
  s = String(s); if (!CY.test(s)) return s;
  const hit = cache.get(s); if (hit != null) return hit;
  const a = s.match(/^\s*/)[0], b = s.match(/\s*$/)[0], core = s.trim();
  const out = a + trCore(core) + b;
  if (cache.size > 4000) cache.clear();
  cache.set(s, out); return out;
}

/* ---------- перевод страницы ---------- */
const textRec = new WeakMap(), attrRec = new WeakMap();
const skip = el => !el || el.closest && el.closest('script,style,[data-noi18n]');
function doText(n) {
  if (skip(n.parentElement)) return;
  const cur = n.nodeValue, r = textRec.get(n);
  const src = r && cur === r.out ? r.src : cur;
  if (!CY.test(src) && !r) return;
  const out = tr(src);
  textRec.set(n, { src, out });
  if (out !== cur) n.nodeValue = out;
}
function doAttrs(el) {
  if (skip(el)) return;
  let rec = attrRec.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a); if (cur == null) continue;
    const r = rec && rec[a], src = r && cur === r.out ? r.src : cur;
    if (!r && !CY.test(src)) continue;
    const out = tr(src); rec = rec || {}; rec[a] = { src, out }; attrRec.set(el, rec);
    if (out !== cur) el.setAttribute(a, out);
  }
}
function walk(rootEl) {
  if (rootEl.nodeType === 3) { doText(rootEl); return; }
  if (rootEl.nodeType !== 1) return;
  doAttrs(rootEl);
  const it = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while ((n = it.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}
let titleSrc = null;
function applyAll() {
  document.documentElement.lang = lang;
  if (titleSrc == null) titleSrc = document.title;
  document.title = tr(titleSrc);
  walk(document.body);
}
let pending = new Set(), scheduled = false;
const obs = new MutationObserver(list => {
  for (const m of list) {
    if (m.type === 'characterData') pending.add(m.target);
    else if (m.type === 'attributes') pending.add(m.target);
    else for (const n of m.addedNodes) pending.add(n);
  }
  if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; const p = pending; pending = new Set(); obs.disconnect(); for (const n of p) if (n.isConnected) walk(n); observe(); }); }
});
const observe = () => obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

async function setLang(code) {
  if (!known(code)) code = 'ru';
  try { await load(code); } catch (e) { console.warn('i18n', e); code = 'ru'; map = null; }
  lang = code; try { localStorage.setItem(KEY, code); } catch (e) {}
  obs.disconnect(); applyAll(); observe();
  for (const f of listeners) try { f(code); } catch (e) {}
}

/* меню выбора языка: <select id="langSel"> */
function bindMenu() {
  const sel = document.getElementById('langSel'); if (!sel) return;
  sel.innerHTML = LANGS.map(([c, name]) => `<option value="${c}" lang="${c}">${name}</option>`).join('');
  sel.value = lang;
  sel.addEventListener('change', () => setLang(sel.value));
  listeners.push(c => { sel.value = c; });
}

const ready = (async () => {
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  bindMenu();
  await setLang(lang);
})();

root.I18N = {
  tr, setLang, ready, langs: LANGS,
  /* перевод одной фразы словаря на любой язык (для запросов в магазины) */
  async word(code, s) { if (code === 'ru' || !known(code)) return s; try { return (await dict(code)).get(s) ?? s; } catch (e) { return s; } },
  get lang() { return lang; },
  voice() { return (LANGS.find(l => l[0] === lang) || LANGS[0])[2]; },
  onChange(f) { listeners.push(f); }
};
})(typeof self !== 'undefined' ? self : this);
