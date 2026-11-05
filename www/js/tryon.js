/* Примерка вещи на 3D-модели: вид вещи + цвет + крой → одежда на манекене поверх текущего образа.
 * Цвет — из названия («синие джинсы»), из образа стилиста или с фото товара (клиент касается вещи на фото).
 * С ИИ-сервером фото товара может разобрать ИИ: вид, цвет, рукав, длина. Фото человека сюда не грузят.
 * Подключается после app.js: outfit, outfitTitle, BASIC_OUTFIT, store, setView, renderStyle, notify. */
(function () {
'use strict';
const CFG = window.PROEKCIYA_CONFIG || {};
const API = (CFG.chatUrl || '').replace(/\/$/, '');
const $t = id => document.getElementById(id);
const dlg = $t('tryDlg'); if (!dlg) return;

/* ---------- цвета из слов (все языки приложения) ---------- */
const COLORS = [
  [/тёмно-син|темно-син|navy|marine|marineblau|granat|donkerblauw/i, '#1f2a44'],
  [/голуб|light blue|lichtblauw|bleu clair|hellblau|błękit/i, '#8fb8de'],
  [/деним|denim|джинсов/i, '#3e506b'],
  [/син|blue|blauw|bleu|blau|niebiesk/i, '#2f56a6'],
  [/чёрн|черн|black|zwart|noir|schwarz|czarn/i, '#17181b'],
  [/бел|white|wit\b|witte|blanc|blanche|weiß|weis|biał/i, '#f3f3f0'],
  [/сер|grey|gray|grijs|gris|grau|szar/i, '#8a8e96'],
  [/бордов|burgund|bordeaux|bordo/i, '#6e2232'],
  [/красн|red\b|rood|rouge|rot\b|rote|czerwon/i, '#c3172b'],
  [/розов|pink|roze|rose\b|rosa|róż/i, '#e6a3b8'],
  [/оливк|olive|olijf|oliv/i, '#6b7139'],
  [/хаки|khaki|kaki|khaki/i, '#8b7d55'],
  [/зел|green|groen|vert|grün|zielon/i, '#2f7a4a'],
  [/беж|песоч|beige|zand|sable|sand/i, '#d6c2a0'],
  [/корич|шоколад|brown|bruin|marron|braun|brąz/i, '#5a3b28'],
  [/кремов|молочн|cream|crème|creme|ecru|kremow/i, '#eee6d4'],
  [/жёлт|желт|горчич|yellow|mustard|geel|mosterd|jaune|moutarde|gelb|senf|żółt|musztard/i, '#d9a92c'],
  [/оранж|orange|oranje|pomarańcz/i, '#e07a2e'],
  [/фиолет|лаванд|purple|violet|paars|lila|fiolet/i, '#7a5aa6']
];
const colorFromText = t => { for (const [re, hex] of COLORS) if (re.test(t || '')) return hex; return null; };
const DEFAULT_HEX = { top: '#eceae4', bottom: '#3a4a68', jeans: '#3e506b', dress: '#2f56a6', outer: '#4a4f5a', shoes: '#f2f2f2' };
const WEARABLE = ['top', 'bottom', 'jeans', 'dress', 'outer', 'shoes'];

/* ---------- надеть ---------- */
function apply(g) {
  if (!WEARABLE.includes(g.kind)) { notify('Эту вещь пока нельзя показать на модели — только верх, низ, платья, верхнюю одежду и обувь.', 'Примерка'); return false; }
  let hex = g.hex || DEFAULT_HEX[g.kind];
  if (g.kind === 'jeans' && hex === '#2f56a6') hex = '#3e506b'; // «синие джинсы» — цвет денима
  const o = { ...BASIC_OUTFIT, ...(outfit || {}) };
  const wasDress = o.bt === 'd';
  switch (g.kind) {
    case 'top': o.top = hex; o.sl = g.sl || o.sl; if (wasDress) { o.bt = 't'; o.bot = BASIC_OUTFIT.bot; } break;
    case 'bottom': o.bot = hex; o.bt = ['t', 'sh', 'sk'].includes(g.cut) ? g.cut : 't'; if (wasDress) o.top = BASIC_OUTFIT.top; break;
    case 'jeans': o.bot = hex; o.bt = g.cut === 'sh' ? 'sh' : 't'; if (wasDress) o.top = BASIC_OUTFIT.top; break;
    case 'dress': o.top = o.bot = hex; o.bt = 'd'; o.sl = g.sl || 's'; break;
    case 'outer': o.out = hex; o.ol = g.ol === 'c' ? 'c' : 'j'; break;
    case 'shoes': o.sh = hex; break;
  }
  outfit = o; outfitTitle = g.title || 'Примерка';
  store.set('pr-outfit', outfit); store.set('pr-outfit-title', outfitTitle);
  setView('clothes', true); renderStyle();
  if (!isWide()) setSheet(false);
  notify(`«${outfitTitle}» на модели.`, 'Примерка');
  return true;
}

/* ---------- окно примерки ---------- */
const kindSel = $t('tryKind'), color = $t('tryColor'), sw = $t('trySwatch'), sl = $t('trySleeve'), cut = $t('tryCut'), ol = $t('tryLen');
const cv = $t('tryCanvas'), ctx = cv.getContext('2d', { willReadFrequently: true }), msg = $t('tryMsg');
let title = '', hasPhoto = false, photoData = null, lastFocus = null;
const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
function syncFields() {
  const k = kindSel.value;
  $t('tryRowSleeve').hidden = !(k === 'top' || k === 'dress');
  $t('tryRowCut').hidden = !(k === 'bottom' || k === 'jeans');
  $t('tryRowLen').hidden = k !== 'outer';
  sw.style.background = color.value;
}
function open(pre = {}) {
  lastFocus = document.activeElement;
  title = pre.title || '';
  kindSel.value = WEARABLE.includes(pre.kind) ? pre.kind : 'top';
  color.value = pre.hex || colorFromText((pre.title || '') + ' ' + (pre.query || '')) || DEFAULT_HEX[kindSel.value];
  sl.value = pre.sl || 'l'; cut.value = pre.cut || 't'; ol.value = pre.ol || 'j';
  $t('tryTitle2').textContent = title || 'Вещь с сайта магазина';
  clearPhoto(); msg.textContent = ''; $t('tryUrl').value = pre.url || '';
  syncFields(); dlg.hidden = false;
  setTimeout(() => $t('tryHead').focus(), 30);
}
function close() { dlg.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
function clearPhoto() { hasPhoto = false; photoData = null; cv.hidden = true; $t('tryPick').hidden = true; $t('tryFile').value = ''; }

/* фото товара: авто-цвет + цвет по касанию */
function dominant() {
  const W = cv.width, H = cv.height, d = ctx.getImageData(0, 0, W, H).data;
  const corner = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]].map(([x, y]) => { const i = (y*W + x)*4; return [d[i], d[i+1], d[i+2]]; });
  const bg = corner.reduce((a, c) => a.map((v, k) => v + c[k]/4), [0, 0, 0]);
  const bins = new Map();
  for (let y = Math.floor(H*0.2); y < H*0.85; y += 2) for (let x = Math.floor(W*0.2); x < W*0.8; x += 2) {
    const i = (y*W + x)*4, r = d[i], g = d[i+1], b = d[i+2];
    if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 38) continue;               // фон
    if (r > g && g > b && r - b > 30 && r - b < 110 && r > 140 && g > 90) continue; // кожа
    const key = (r >> 4) + '|' + (g >> 4) + '|' + (b >> 4), e = bins.get(key) || [0, 0, 0, 0];
    e[0] += r; e[1] += g; e[2] += b; e[3]++; bins.set(key, e);
  }
  let best = null; for (const e of bins.values()) if (!best || e[3] > best[3]) best = e;
  return best ? toHex(best[0]/best[3], best[1]/best[3], best[2]/best[3]) : null;
}
$t('tryFile').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  let img; try { img = await createImageBitmap(f); } catch (err) { msg.textContent = 'Не удалось открыть фото. Формат HEIC не поддерживается — выберите JPG.'; return; }
  const k = Math.min(1, 900/Math.max(img.width, img.height));
  cv.width = Math.round(img.width*k); cv.height = Math.round(img.height*k);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  hasPhoto = true; cv.hidden = false; $t('tryPick').hidden = false;
  photoData = cv.toDataURL('image/jpeg', 0.82);
  const c = dominant(); if (c) { color.value = c; syncFields(); }
  msg.textContent = 'Цвет взят с фото. Коснитесь вещи на фото, чтобы уточнить.';
  if (API && store.get('pr-chat-consent', false)) aiRead(); // фото товара уходит ИИ только после согласия в чате
});
cv.addEventListener('click', e => {
  if (!hasPhoto) return;
  const r = cv.getBoundingClientRect(), x = Math.round((e.clientX - r.left)*cv.width/r.width), y = Math.round((e.clientY - r.top)*cv.height/r.height);
  const d = ctx.getImageData(Math.max(0, x - 3), Math.max(0, y - 3), 7, 7).data; let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i+1]; B += d[i+2]; n++; }
  color.value = toHex(R/n, G/n, B/n); syncFields();
  msg.textContent = 'Цвет выбран.';
});

/* ИИ смотрит на фото товара и подсказывает вид, цвет и крой */
async function aiRead() {
  msg.textContent = 'ИИ-стилист рассматривает товар…';
  try {
    const res = await fetch(API + '/tryon', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: window.I18N ? I18N.lang : 'ru', image: photoData }) });
    const g = await res.json().catch(() => ({}));
    if (!res.ok || !g.kind) throw new Error(g.error || res.status);
    if (WEARABLE.includes(g.kind)) kindSel.value = g.kind;
    if (/^#[0-9a-f]{6}$/i.test(g.color || '')) color.value = g.color;
    if (g.sl) sl.value = g.sl === 's' ? 's' : 'l';
    if (g.cut) cut.value = ['t', 'sh', 'sk'].includes(g.cut) ? g.cut : 't';
    if (g.ol) ol.value = g.ol === 'c' ? 'c' : 'j';
    if (g.title) { title = String(g.title).slice(0, 60); $t('tryTitle2').textContent = title; }
    syncFields();
    msg.textContent = 'ИИ определил вещь. Проверьте и нажмите «Надеть».';
  } catch (e) { console.warn('tryon', e); msg.textContent = 'Цвет взят с фото. Вид вещи выберите сами.'; }
}

kindSel.onchange = () => { if (!hasPhoto && !title) color.value = DEFAULT_HEX[kindSel.value]; syncFields(); };
color.oninput = syncFields;
const current = () => ({ kind: kindSel.value, hex: color.value, sl: sl.value, cut: cut.value, ol: ol.value, title: title || $t('tryTitle2').textContent });
$t('tryWear').onclick = async () => {
  if (window.PhotoFit && PhotoFit.active) { // примерочная по фото: нужна картинка товара
    if (!hasPhoto) { msg.textContent = 'Загрузите фото или скриншот товара — его вещь появится на вашем фото.'; $t('tryFile').focus(); return; }
    if (!PhotoFit.hasPerson) { msg.textContent = 'Сначала загрузите своё фото в полный рост на главном экране.'; return; }
    const g = current(); close();
    if (window.AITryOn && await AITryOn.run({ garment: photoData, kind: g.kind, title: g.title })) return; // реалистичная ИИ-примерка
    await PhotoFit.addGarment({ src: photoData, kind: g.kind, title: g.title });
    if (!isWide()) setSheet(false);
    return;
  }
  if (apply(current())) close();
};
$t('tryCart').onclick = async () => {
  if (!window.Cart) return;
  const u = $t('tryUrl').value.trim();
  if (u && !/^https?:\/\/\S+$/i.test(u)) { msg.textContent = 'Ссылка должна начинаться с https://'; $t('tryUrl').focus(); return; }
  const g = current();
  if (!title && u) { try { g.title = 'Вещь с ' + new URL(u).hostname.replace(/^www\./, ''); } catch (e) {} }
  await Cart.add({ ...g, url: u, photo: hasPhoto ? photoData : null, query: title });
  close();
};
$t('tryCancel').onclick = close; $t('tryX').onclick = close;
dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
dlg.addEventListener('click', e => { if (e.target === dlg) close(); });

window.TryOn = { open, apply, colorFromText, WEARABLE };
})();
