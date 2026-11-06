/* Фото-примерочная «Проекции»: своё фото в полный рост + вещи с фото товара поверх.
 * - фон фото товара убирается сам (заливка от краёв по похожему цвету), остальное — ластиком;
 * - вещь ставится по плечам/бёдрам/щиколоткам (MediaPipe Pose из scan.js), если он доступен;
 * - всё правится вручную: перетащить, растянуть, повернуть (пальцами или ручкой), ширина, длина,
 *   прозрачность, ластик и «вернуть», порядок слоёв;
 * - фото и слои хранятся только на устройстве (IndexedDB), результат сохраняется картинкой.
 * Подключается после app.js (idb, store, notify, announce, Cam, Scan). */
(function () {
'use strict';
const room = document.getElementById('fitRoom'); if (!room) return;
const $f = id => document.getElementById(id);
const cv = $f('fitCanvas'), ctx = cv.getContext('2d');
const MAXP = 1400, MAXG = 900;
let person = null, marks = null, layers = [], sel = null, mode = 'move', brush = 26, saveT = null;
let personOrig = null, personCut = false, pbox = null, pmode = null;
let fx = null, lastDet = null; // ИИ-сканер: анимация и последняя распознанная фигура // фото с фоном, вырезано ли, рамка фигуры, правка фона
const CFG = window.PROEKCIYA_CONFIG || {};

/* ---------- картинки ---------- */
const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('img')); im.src = src; });
function toCanvas(im, max) {
  const k = Math.min(1, max/Math.max(im.width, im.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.width*k)); c.height = Math.max(1, Math.round(im.height*k));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c;
}
async function fileToCanvas(file, max) {
  let bmp; try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('Не удалось открыть фото. Формат HEIC не поддерживается — выберите JPG.'); }
  return toCanvas(bmp, max);
}

/* фон товара: заливка от краёв по похожему цвету + обрезка по содержимому */
function removeBg(src) {
  const W = src.width, H = src.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data, seen = new Uint8Array(W*H), q = new Int32Array(W*H);
  const TOL = 34, TOL2 = TOL*TOL;
  let qh = 0, qt = 0;
  const push = (i, r, gg, b) => { if (seen[i]) return; const o = i*4, dr = d[o] - r, dg = d[o+1] - gg, db = d[o+2] - b; if (dr*dr + dg*dg + db*db > TOL2) return; seen[i] = 1; q[qt++] = i; };
  for (let x = 0; x < W; x++) { for (const y of [0, H - 1]) { const i = y*W + x, o = i*4; push(i, d[o], d[o+1], d[o+2]); } }
  for (let y = 0; y < H; y++) { for (const x of [0, W - 1]) { const i = y*W + x, o = i*4; push(i, d[o], d[o+1], d[o+2]); } }
  while (qh < qt) {
    const i = q[qh++], o = i*4, x = i % W, y = (i/W) | 0, r = d[o], gg = d[o+1], b = d[o+2];
    d[o+3] = 0;
    if (x > 0) push(i - 1, r, gg, b); if (x < W - 1) push(i + 1, r, gg, b);
    if (y > 0) push(i - W, r, gg, b); if (y < H - 1) push(i + W, r, gg, b);
  }
  // мягкий край: полупрозрачные пиксели рядом с вырезанным фоном
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y*W + x; if (seen[i]) continue; if (seen[i-1] || seen[i+1] || seen[i-W] || seen[i+W]) d[i*4+3] = 150; }
  g.putImageData(id, 0, 0);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y*W + x)*4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0 || (x1 - x0) < 10) return { cut: src, orig: src, cleared: 0 };            // фон не нашёлся — оставляем как есть
  const crop = (s) => { const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(s, -x0, -y0); return o; };
  return { cut: crop(c), orig: crop(src), cleared: qt/(W*H) };
}

/* ---------- фон своего фото: модуль BiRefNet на ноутбуке, иначе MediaPipe ---------- */
async function cutPerson(c) {
  const url = (CFG.bgUrl || '').trim();
  if (url) {
    try {
      status('Убираю фон с фото… Это может занять до минуты.');
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 180000);
      const res = await fetch(url, { method: 'POST', body: blob, signal: ctrl.signal, headers: { 'content-type': 'image/jpeg' } });
      clearTimeout(t);
      if (res.ok && /image\/png/.test(res.headers.get('content-type') || '')) {
        const u = URL.createObjectURL(await res.blob()), im = await loadImg(u); URL.revokeObjectURL(u);
        const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        return { cut: o, how: 'ai' };
      }
    } catch (e) { console.warn('bg_remover', e); }
  }
  if (window.Scan) {
    try {
      status('Убираю фон с фото…');
      const det = await Scan.detect(c); lastDet = det;
      const P = i => ({ x: det.landmarks[i].x*c.width, y: det.landmarks[i].y*c.height });
      marks = { ls: P(11), rs: P(12), lh: P(23), rh: P(24), lk: P(25), rk: P(26), la: P(27), ra: P(28), nose: P(0) };
      const m = document.createElement('canvas'); m.width = det.w; m.height = det.h;
      const mg = m.getContext('2d'), id = mg.createImageData(det.w, det.h);
      for (let i = 0; i < det.mask.length; i++) { const v = det.mask[i], a = Math.max(0, Math.min(1, (v - 0.35)/0.3)); id.data[i*4+3] = a*255; }
      mg.putImageData(id, 0, 0);
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const g = o.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, c.width, c.height);
      return { cut: o, how: 'mp' };
    } catch (e) { console.warn('mediapipe cut', e); }
  }
  return null;
}
function boxOf(c) { // рамка непрозрачной части
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y*w + x)*4 + 3] > 100) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
function rowEdges(y, cx) { // края фигуры на высоте y, от середины наружу
  const w = person.width, d = person.getContext('2d').getImageData(0, Math.round(y), w, 1).data;
  let a = Math.round(cx), b = Math.round(cx);
  if (d[a*4 + 3] < 100) return null;
  while (a > 0 && d[(a - 1)*4 + 3] > 100) a--;
  while (b < w - 1 && d[(b + 1)*4 + 3] > 100) b++;
  return [a, b];
}

/* ---------- вид: фото человека вписано в холст ---------- */
let view = { k: 1, ox: 0, oy: 0 };
function resize() {
  const r = room.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width*dpr)); cv.height = Math.max(1, Math.round(r.height*dpr));
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  fitView(); draw();
}
function fitView() {
  if (!person) return;
  const d = devicePixelRatio || 1, pv = document.body.classList.contains('photo-view'), pad = (pv ? 34 : 12)*d, bottom = (pv ? 112 : 70)*d;
  const k = Math.min((cv.width - 24*d)/person.width, (cv.height - pad - bottom)/person.height);
  view = { k, ox: (cv.width - person.width*k)/2, oy: pad + (cv.height - pad - bottom - person.height*k)/2 };
}
const toScreen = (x, y) => [view.ox + x*view.k, view.oy + y*view.k];
const toPhoto = (sx, sy) => [(sx - view.ox)/view.k, (sy - view.oy)/view.k];
function evPt(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left)*cv.width/r.width, (e.clientY - r.top)*cv.height/r.height]; }

/* слой: центр (x,y) в пикселях фото, масштаб s, растяжение sx/sy, поворот r */
const lw = L => L.cut.width*L.s*L.sx, lh = L => L.cut.height*L.s*L.sy;
function toLayer(L, px, py) { // точка фото → координаты картинки слоя
  const dx = px - L.x, dy = py - L.y, c = Math.cos(-L.r), s = Math.sin(-L.r);
  return [(dx*c - dy*s)/(L.s*L.sx) + L.cut.width/2, (dx*s + dy*c)/(L.s*L.sy) + L.cut.height/2];
}
function handlePos(L) { // ручка «растянуть/повернуть» — правый нижний угол
  const hx = lw(L)/2, hy = lh(L)/2, c = Math.cos(L.r), s = Math.sin(L.r);
  return toScreen(L.x + hx*c - hy*s, L.y + hx*s + hy*c);
}
function hit(px, py) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i], [u, v] = toLayer(L, px, py);
    if (u < 0 || v < 0 || u >= L.cut.width || v >= L.cut.height) continue;
    const a = L.cut.getContext('2d').getImageData(u | 0, v | 0, 1, 1).data[3];
    if (a > 30 || L === sel) return L;
  }
  return null;
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!person) return;
  const dpr = devicePixelRatio || 1, neon = document.documentElement.classList.contains('neon');
  if (personCut && pbox) { // светящееся кольцо под ногами, как у 3D-проекции
    const [fx, fy] = toScreen((pbox.x0 + pbox.x1)/2, pbox.y1), rw = (pbox.x1 - pbox.x0)*view.k*0.75;
    ctx.save(); ctx.strokeStyle = neon ? 'rgba(63,216,245,.85)' : 'rgba(11,143,176,.6)'; ctx.lineWidth = 2*dpr;
    ctx.shadowColor = '#3fd8f5'; ctx.shadowBlur = 18*dpr;
    for (const k of [1, 0.78]) { ctx.beginPath(); ctx.ellipse(fx, fy, rw*k, rw*k*0.16, 0, 0, Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }
  ctx.drawImage(person, view.ox, view.oy, person.width*view.k, person.height*view.k);
  if (fx && pbox) drawFx(dpr);
  else if (personCut && pbox && (!card || card.hidden) && (typeof prefs === 'undefined' || prefs.tapes) && !(typeof viewMode !== 'undefined' && viewMode === 'clothes')) drawTapes(dpr); // в «Одежде» — без линеек
  for (const L of layers) {
    ctx.save(); ctx.globalAlpha = L.op;
    const [sx, sy] = toScreen(L.x, L.y);
    ctx.translate(sx, sy); ctx.rotate(L.r); ctx.scale(L.s*L.sx*view.k, L.s*L.sy*view.k);
    ctx.drawImage(L.cut, -L.cut.width/2, -L.cut.height/2);
    ctx.restore();
  }
  if (sel) {
    const L = sel, [sx, sy] = toScreen(L.x, L.y), dpr = devicePixelRatio || 1;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(L.r);
    ctx.setLineDash([6*dpr, 5*dpr]); ctx.lineWidth = 1.5*dpr; ctx.strokeStyle = '#f5c842';
    ctx.strokeRect(-lw(L)*view.k/2, -lh(L)*view.k/2, lw(L)*view.k, lh(L)*view.k); ctx.restore();
    if (mode === 'move') {
      const [hx, hy] = handlePos(L);
      ctx.setLineDash([]); ctx.fillStyle = '#f5c842'; ctx.strokeStyle = '#16181d'; ctx.lineWidth = 2*dpr;
      ctx.beginPath(); ctx.arc(hx, hy, 13*dpr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - 5*dpr, hy - 5*dpr); ctx.lineTo(hx + 5*dpr, hy + 5*dpr); ctx.moveTo(hx + 1*dpr, hy + 5*dpr); ctx.lineTo(hx + 5*dpr, hy + 5*dpr); ctx.lineTo(hx + 5*dpr, hy + 1*dpr); ctx.stroke();
    }
  }
}

/* ленты мерок на фото: рост слева, грудь/талия/бёдра поперёк фигуры */
function pill(text, x, y, dpr, on) {
  ctx.font = `700 ${12*dpr}px Manrope, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 18*dpr, h = 22*dpr;
  ctx.save(); if (on) { ctx.shadowColor = 'rgba(255,200,58,.9)'; ctx.shadowBlur = 14*dpr; }
  ctx.fillStyle = on ? '#ffc83a' : 'rgba(10,16,24,.85)'; ctx.strokeStyle = '#ffc83a'; ctx.lineWidth = 1.5*dpr;
  ctx.beginPath(); ctx.roundRect(x, y - h/2, w, h, 9*dpr); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = on ? '#0a1018' : '#ffc83a'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 9*dpr, y + 1*dpr);
}
function segsAt(y) { // непрозрачные отрезки строки фото
  const w = person.width, yy = Math.max(0, Math.min(person.height - 1, Math.round(y)));
  const d = person.getContext('2d').getImageData(0, yy, w, 1).data, out = [];
  let a = -1;
  for (let x = 0; x <= w; x++) { const on = x < w && d[x*4 + 3] > 100; if (on && a < 0) a = x; if (!on && a >= 0) { if (x - a > 2) out.push([a, x - 1]); a = -1; } }
  return out;
}
function drawTapes(dpr) {
  const T = s => (window.I18N ? I18N.tr(s) : s), Mx = (typeof M !== 'undefined' && M) || {};
  const hi = typeof hiKey !== 'undefined' ? hiKey : null, fem = typeof gender !== 'undefined' && gender === 'f';
  const num = v => String(v).replace('.', ',');
  const H = pbox.y1 - pbox.y0, Y = f => pbox.y0 + H*f;
  let cx = (pbox.x0 + pbox.x1)/2;
  // уровни мерок: по суставам, если найдены, иначе по средним пропорциям тела
  const lv = { head: Y(0.065), neck: Y(0.135), shoulders: Y(0.19), chest: Y(0.27), underbust: Y(0.305), waist: Y(0.38), hips: Y(0.48), thigh: Y(0.56) };
  if (marks && marks.ls) {
    const shY = (marks.ls.y + marks.rs.y)/2, hipY = (marks.lh.y + marks.rh.y)/2, torso = hipY - shY;
    cx = (marks.lh.x + marks.rh.x)/2;
    Object.assign(lv, { neck: shY - torso*0.17, shoulders: shY, chest: shY + torso*0.3, underbust: shY + torso*0.42, waist: shY + torso*0.68, hips: hipY + torso*0.1 });
    if (marks.lk) lv.thigh = hipY + ((marks.lk.y + marks.rk.y)/2 - hipY)*0.25;
  }
  const tapeStyle = k => { const on = k === hi; ctx.strokeStyle = on ? '#fff3c4' : '#ffc83a'; ctx.shadowColor = 'rgba(255,200,58,.85)'; ctx.shadowBlur = (on ? 16 : 8)*dpr; ctx.lineWidth = (on ? 4.5 : 3)*dpr; };
  const labels = []; // {k, text, x, y, side}
  const add = (k, name, x, y, side) => { if (Mx[k] != null) labels.push({ k, text: `${T(name)} ${num(Mx[k])}`, x, y, side }); };
  ctx.save();
  ctx.globalAlpha = 0; // ленты и линейки не рисуем — только подписи с размерами (геометрия нужна для их мест)
  // рост — линейка слева
  const [hx, hy0] = toScreen(pbox.x0, pbox.y0), [, hy1] = toScreen(pbox.x0, pbox.y1), lx = hx - 22*dpr;
  tapeStyle('height');
  ctx.beginPath(); ctx.moveTo(lx, hy0); ctx.lineTo(lx, hy1); ctx.moveTo(lx - 6*dpr, hy0); ctx.lineTo(lx + 10*dpr, hy0); ctx.moveTo(lx - 6*dpr, hy1); ctx.lineTo(lx + 10*dpr, hy1); ctx.stroke();
  ctx.lineWidth = 2*dpr;
  for (let i = 1; i < 20; i++) { const y = hy0 + (hy1 - hy0)*i/20; ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + (i % 5 ? 5 : 9)*dpr, y); ctx.stroke(); }
  // обхваты — кольца
  const rings = [['head', 'Голова', 'r'], ['neck', 'Шея', 'l'], ['chest', 'Грудь', 'r'], ['waist', 'Талия', 'l'], ['hips', 'Бёдра', 'r']];
  if (fem) rings.splice(3, 0, ['underbust', 'Под грудью', 'r']);
  for (const [k, name, side] of rings) {
    const e = rowEdges(lv[k], cx); if (!e) continue;
    const [ax, ay] = toScreen(e[0], lv[k]), [bx] = toScreen(e[1], lv[k]);
    tapeStyle(k); ctx.beginPath(); ctx.ellipse((ax + bx)/2, ay, (bx - ax)/2, 4*dpr, 0, 0, Math.PI*2); ctx.stroke();
    add(k, name, side === 'r' ? bx : ax, ay, side);
  }
  // плечи — прямая между краями плеч
  { const e = rowEdges(lv.shoulders, cx);
    if (e) { const [ax, ay] = toScreen(e[0], lv.shoulders), [bx] = toScreen(e[1], lv.shoulders);
      tapeStyle('shoulders'); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, ay); ctx.moveTo(ax, ay - 5*dpr); ctx.lineTo(ax, ay + 5*dpr); ctx.moveTo(bx, ay - 5*dpr); ctx.lineTo(bx, ay + 5*dpr); ctx.stroke();
      add('shoulders', 'Плечи', ax, ay, 'l'); } }
  // бедро — кольцо на одной ноге (левой на экране)
  { const s = segsAt(lv.thigh).filter(g => (g[0] + g[1])/2 <= cx + 2);
    const g = s.length ? s.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
    if (g) { const [ax, ay] = toScreen(g[0], lv.thigh), [bx] = toScreen(g[1], lv.thigh);
      tapeStyle('thigh'); ctx.beginPath(); ctx.ellipse((ax + bx)/2, ay, (bx - ax)/2, 4*dpr, 0, 0, Math.PI*2); ctx.stroke();
      add('thigh', 'Бедро', ax, ay, 'l'); } }
  // рукав — вдоль внешнего края правой руки
  { const pts = [];
    for (let f = 0.19; f <= 0.465; f += 0.012) { const s = segsAt(Y(f)); if (s.length) pts.push(toScreen(s[s.length - 1][1], Y(f))); }
    if (pts.length > 4) { tapeStyle('sleeve'); ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + 5*dpr, y) : ctx.moveTo(x + 5*dpr, y)); ctx.stroke();
      const m = pts[Math.floor(pts.length*0.6)]; add('sleeve', 'Рукав', m[0] + 5*dpr, m[1], 'r'); } }
  // длина ноги — по внутреннему шву от паха до пола
  { let crotch = Y(0.53);
    for (let f = 0.45; f < 0.7; f += 0.005) { const s = segsAt(Y(f)); if (s.length >= 2 && !s.some(g => g[0] <= cx && g[1] >= cx)) { crotch = Y(f); break; } }
    const [ix, iy0] = toScreen(cx, crotch), [, iy1] = toScreen(cx, pbox.y1);
    tapeStyle('inseam'); ctx.setLineDash([7*dpr, 5*dpr]); ctx.beginPath(); ctx.moveTo(ix, iy0); ctx.lineTo(ix, iy1); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ix - 5*dpr, iy0); ctx.lineTo(ix + 5*dpr, iy0); ctx.stroke();
    add('inseam', 'Шаг', ix, iy0 + (iy1 - iy0)*0.45, 'r'); }
  // стопа — под правой ногой
  { const s = segsAt(pbox.y1 - H*0.012), g = s.length ? s[s.length - 1] : null;
    if (g) { const [ax, ay] = toScreen(g[0], pbox.y1), [bx] = toScreen(g[1], pbox.y1), yy = ay + 7*dpr;
      tapeStyle('foot'); ctx.beginPath(); ctx.moveTo(ax, yy); ctx.lineTo(bx, yy); ctx.moveTo(ax, yy - 4*dpr); ctx.lineTo(ax, yy + 4*dpr); ctx.moveTo(bx, yy - 4*dpr); ctx.lineTo(bx, yy + 4*dpr); ctx.stroke();
      add('foot', 'Стопа', bx, yy, 'r'); } }
  ctx.restore();
  // подписи: рост сверху, остальные — столбиками слева и справа, без наложений
  if (Mx.height) { ctx.font = `700 ${12*dpr}px Manrope, system-ui, sans-serif`; const t = `${T('Рост')} ${Mx.height}`, [mx] = toScreen((pbox.x0 + pbox.x1)/2, 0);
    pill(t, mx - (ctx.measureText(t).width + 18*dpr)/2, hy0 - 18*dpr, dpr, hi === 'height'); }
  const [rx0] = toScreen(pbox.x1, 0), [lx0] = toScreen(pbox.x0, 0);
  for (const side of ['l', 'r']) {
    const list = labels.filter(l => l.side === side).sort((a, b) => a.y - b.y); let last = -1e9;
    for (const l of list) {
      const ly = Math.max(l.y, last + 26*dpr); last = ly;
      ctx.font = `700 ${12*dpr}px Manrope, system-ui, sans-serif`;
      const w = ctx.measureText(l.text).width + 18*dpr;
      const px = side === 'r' ? Math.min(Math.max(l.x, rx0) + 14*dpr, cv.width - w - 4*dpr) : Math.max(4*dpr, Math.min(l.x, lx0) - 14*dpr - w);
      pill(l.text, px, ly, dpr, l.k === hi);
    }
  }
}
// перерисовать, когда меняются мерки, пол или выделенная мерка
{ let sig = '';
  setInterval(() => {
    if (!person || room.hidden) return;
    const s = JSON.stringify([typeof M !== 'undefined' ? M : 0, typeof hiKey !== 'undefined' ? hiKey : 0, typeof gender !== 'undefined' ? gender : 0, typeof viewMode !== 'undefined' ? viewMode : 0]);
    if (s !== sig) { sig = s; draw(); }
  }, 250); }

/* ---------- автоматическая постановка вещи ---------- */
async function findMarks() {
  if (marks !== null || !person || !window.Scan) return marks;
  try {
    const det = await Scan.detect(person, t => status(t));
    const P = i => ({ x: det.landmarks[i].x*person.width, y: det.landmarks[i].y*person.height });
    marks = { ls: P(11), rs: P(12), lh: P(23), rh: P(24), lk: P(25), rk: P(26), la: P(27), ra: P(28) };
    status('');
  } catch (e) { marks = false; status('Фигура не распознана — встаньте целиком в кадр.'); }
  return marks;
}
function place(L) {
  const m = marks, W = person.width, H = person.height, cw = L.cut.width, ch = L.cut.height;
  let w, cx, top;
  if (m) {
    const shW = Math.abs(m.ls.x - m.rs.x), shY = (m.ls.y + m.rs.y)/2, shX = (m.ls.x + m.rs.x)/2;
    const hipW = Math.abs(m.lh.x - m.rh.x), hipY = (m.lh.y + m.rh.y)/2, hipX = (m.lh.x + m.rh.x)/2, torso = Math.max(20, hipY - shY);
    const anY = (m.la.y + m.ra.y)/2, anX = (m.la.x + m.ra.x)/2, anW = Math.abs(m.la.x - m.ra.x);
    switch (L.kind) {
      case 'bottom': case 'jeans': w = hipW*2.15; cx = hipX; top = hipY - torso*0.16; break;
      case 'dress': w = shW*1.5; cx = shX; top = shY - torso*0.1; break;
      case 'outer': w = shW*1.75; cx = shX; top = shY - torso*0.14; break;
      case 'shoes': w = Math.max(anW*1.7, hipW*1.6); cx = anX; top = anY - torso*0.06; break;
      default: w = shW*1.6; cx = shX; top = shY - torso*0.12;
    }
  } else { w = W*0.45; cx = W/2; top = H*(L.kind === 'bottom' || L.kind === 'jeans' ? 0.48 : L.kind === 'shoes' ? 0.88 : 0.2); }
  L.s = w/cw; L.x = cx; L.y = top + ch*L.s/2; L.sx = L.sy = 1; L.r = 0;
}

/* ---------- слои ---------- */
const ORDER = { shoes: 0, bottom: 1, jeans: 1, dress: 2, top: 3, outer: 4 };
async function addGarment({ src, kind, title }) {
  if (!person) { status('Сначала загрузите своё фото в полный рост.'); notify('Сначала загрузите своё фото в полный рост.', 'Примерочная'); return false; }
  const im = typeof src === 'string' ? await loadImg(src) : src;
  const base = toCanvas(im, MAXG), r = removeBg(base);
  const L = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: kind || 'top', title: title || 'Вещь',
    orig: r.orig, cut: r.cut, x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, op: 1 };
  await findMarks(); place(L);
  // порядок: обувь под брюками, верхняя одежда сверху
  let at = layers.findIndex(o => (ORDER[o.kind] ?? 3) > (ORDER[L.kind] ?? 3)); if (at < 0) at = layers.length;
  layers.splice(at, 0, L); select(L); draw(); save();
  notify(`«${L.title}» на фото. Поправьте её пальцем или ручкой в углу.`, 'Примерочная');
  if (r.cleared < 0.08) status('Фон товара не однотонный — сотрите лишнее ластиком.');
  return true;
}
function select(L) { sel = L; if (!L) setMode('move'); if (L && matchMedia('(min-width: 900px), (orientation: landscape) and (min-width: 560px) and (max-height: 600px)').matches) $f('fitMore').open = true; panel(); draw(); }
function panel() {
  const p = $f('fitPanel'); p.hidden = !sel;
  if (!sel) return;
  $f('fitTitle').textContent = sel.title;
  $f('fitW').value = Math.round(sel.sx*100); $f('fitH').value = Math.round(sel.sy*100);
  $f('fitRot').value = Math.round(sel.r*180/Math.PI); $f('fitOp').value = Math.round(sel.op*100);
  for (const b of p.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', b.dataset.mode === mode);
}
function setMode(m) { mode = m; room.dataset.mode = m; panel(); draw(); }

/* ---------- жесты ---------- */
const pts = new Map(); let drag = null;
cv.addEventListener('pointerdown', e => {
  if (!person) return;
  cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, evPt(e));
  const [sx, sy] = evPt(e), [px, py] = toPhoto(sx, sy);
  if (pmode) { drag = { type: 'ppaint' }; paintPerson(px, py); draw(); return; }
  if (pts.size === 2 && sel) { const [a, b] = [...pts.values()]; drag = { type: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), a0: Math.atan2(b[1] - a[1], b[0] - a[0]), s0: sel.s, r0: sel.r }; return; }
  if (sel && mode !== 'move') { drag = { type: 'paint' }; paint(px, py); return; }
  if (sel) { const [hx, hy] = handlePos(sel); if (Math.hypot(sx - hx, sy - hy) < 26*(devicePixelRatio || 1)) {
    const [cx, cy] = toScreen(sel.x, sel.y); drag = { type: 'handle', d0: Math.hypot(sx - cx, sy - cy), a0: Math.atan2(sy - cy, sx - cx), s0: sel.s, r0: sel.r }; return; } }
  const L = hit(px, py);
  if (L !== sel) select(L);
  if (L) drag = { type: 'move', dx: L.x - px, dy: L.y - py };
});
cv.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId) || !drag) return;
  pts.set(e.pointerId, evPt(e));
  const [sx, sy] = evPt(e), [px, py] = toPhoto(sx, sy);
  if (drag.type === 'move' && sel) { sel.x = px + drag.dx; sel.y = py + drag.dy; }
  else if (drag.type === 'handle' && sel) { const [cx, cy] = toScreen(sel.x, sel.y); sel.s = Math.max(0.02, drag.s0*Math.hypot(sx - cx, sy - cy)/drag.d0); sel.r = drag.r0 + Math.atan2(sy - cy, sx - cx) - drag.a0; }
  else if (drag.type === 'pinch' && sel && pts.size >= 2) { const [a, b] = [...pts.values()]; sel.s = Math.max(0.02, drag.s0*Math.hypot(a[0] - b[0], a[1] - b[1])/drag.d0); sel.r = drag.r0 + Math.atan2(b[1] - a[1], b[0] - a[0]) - drag.a0; }
  else if (drag.type === 'paint') paint(px, py);
  else if (drag.type === 'ppaint') paintPerson(px, py);
  draw();
});
const up = e => { pts.delete(e.pointerId); if (!pts.size) { if (drag) { panel(); save(); } drag = null; } else if (drag && drag.type === 'pinch') drag = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', e => { if (!sel) return; e.preventDefault(); sel.s = Math.max(0.02, sel.s*(e.deltaY < 0 ? 1.05 : 0.95)); draw(); save(); }, { passive: false });

/* ластик и «вернуть» */
function paint(px, py) {
  const L = sel, [u, v] = toLayer(L, px, py), rad = brush/(L.s*Math.min(L.sx, L.sy)*view.k)*(devicePixelRatio || 1)/2;
  const g = L.cut.getContext('2d'); g.save(); g.beginPath(); g.arc(u, v, rad, 0, Math.PI*2);
  if (mode === 'erase') { g.globalCompositeOperation = 'destination-out'; g.fill(); }
  else { g.clip(); g.clearRect(u - rad, v - rad, rad*2, rad*2); g.drawImage(L.orig, 0, 0); }
  g.restore();
}

function paintPerson(px, py) {
  const rad = brush*(devicePixelRatio || 1)/(2*view.k), g = person.getContext('2d');
  g.save(); g.beginPath(); g.arc(px, py, rad, 0, Math.PI*2);
  if (pmode === 'erase') { g.globalCompositeOperation = 'destination-out'; g.fill(); }
  else { g.clip(); g.clearRect(px - rad, py - rad, rad*2, rad*2); g.drawImage(personOrig, 0, 0); }
  g.restore();
}
function setPMode(m) {
  pmode = m; if (m) select(null);
  $f('fitPTools').hidden = !m; $f('fitPEdit')?.setAttribute('aria-pressed', !!m);
  for (const b of $f('fitPTools').querySelectorAll('[data-pmode]')) b.setAttribute('aria-pressed', b.dataset.pmode === m);
  room.dataset.mode = m ? 'erase' : mode;
  if (!m && person) { pbox = boxOf(person); save(true); draw(); }
}
// кнопки «Поправить фон», «Добавить вещь», «Снять всё» убраны: фон убирается сам, вещи — через корзину
for (const b of $f('fitPTools').querySelectorAll('[data-pmode]')) b.onclick = () => setPMode(b.dataset.pmode);
$f('fitPDone').onclick = () => setPMode(null);
$f('fitPBrush').oninput = e => { brush = +e.target.value; };

/* клавиатура: стрелки двигают, +/− размер, [ ] поворот, Delete убирает */
cv.addEventListener('keydown', e => {
  if (!sel) { if (e.key === 'Tab' || !layers.length) return; if (e.key === 'Enter') { select(layers[layers.length - 1]); e.preventDefault(); } return; }
  const st = (e.shiftKey ? 20 : 4)/view.k;
  const k = { ArrowLeft: () => sel.x -= st, ArrowRight: () => sel.x += st, ArrowUp: () => sel.y -= st, ArrowDown: () => sel.y += st,
    '+': () => sel.s *= 1.04, '=': () => sel.s *= 1.04, '-': () => sel.s /= 1.04, '[': () => sel.r -= 0.03, ']': () => sel.r += 0.03,
    Delete: () => removeSel(), Escape: () => select(null) }[e.key];
  if (k) { e.preventDefault(); k(); draw(); panel(); save(); }
});

/* ---------- панель вещи ---------- */
$f('fitW').oninput = e => { sel.sx = e.target.value/100; draw(); save(); };
$f('fitH').oninput = e => { sel.sy = e.target.value/100; draw(); save(); };
$f('fitRot').oninput = e => { sel.r = e.target.value*Math.PI/180; draw(); save(); };
$f('fitOp').oninput = e => { sel.op = e.target.value/100; draw(); save(); };
$f('fitBrush').oninput = e => { brush = +e.target.value; };
for (const b of $f('fitPanel').querySelectorAll('[data-mode]')) b.onclick = () => setMode(mode === b.dataset.mode ? 'move' : b.dataset.mode);
$f('fitUp').onclick = () => { const i = layers.indexOf(sel); if (i < layers.length - 1) { layers.splice(i, 1); layers.splice(i + 1, 0, sel); draw(); save(); } };
$f('fitDown').onclick = () => { const i = layers.indexOf(sel); if (i > 0) { layers.splice(i, 1); layers.splice(i - 1, 0, sel); draw(); save(); } };
$f('fitReset').onclick = async () => { await findMarks(); sel.cut = cloneC(sel.orig); place(sel); removeBgAgain(sel); draw(); panel(); save(); };
function removeBgAgain(L) { const r = removeBg(L.orig); if (r.cut.width === L.orig.width && r.cut.height === L.orig.height) L.cut = r.cut; }
function removeSel() { const t = sel.title; layers = layers.filter(x => x !== sel); select(null); save(); announce(`«${t}» снята.`); }
$f('fitDel').onclick = removeSel;
$f('fitDone').onclick = () => select(null);
const cloneC = s => { const c = document.createElement('canvas'); c.width = s.width; c.height = s.height; c.getContext('2d').drawImage(s, 0, 0); return c; };

/* ---------- ИИ-сканер фигуры: видимый скан и мерки ---------- */
const KP = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // нос, плечи, локти, запястья, таз, колени, лодыжки
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const TR = t => (window.I18N ? I18N.tr(t) : t);
function makeHolo() { // голографическая сетка в форме фигуры
  const W = person.width, H = person.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), st = Math.max(4, Math.round((pbox.y1 - pbox.y0)/70)), lw = Math.max(1, Math.round(W/450));
  g.fillStyle = 'rgba(63,216,245,.22)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,235,255,.95)'; g.lineWidth = lw; g.beginPath();
  for (let y = pbox.y0; y <= pbox.y1; y += st) { g.moveTo(0, y); g.lineTo(W, y); }
  for (let x = pbox.x0; x <= pbox.x1; x += st*1.6) { g.moveTo(x, 0); g.lineTo(x, H); }
  g.stroke();
  g.globalCompositeOperation = 'destination-in'; g.drawImage(person, 0, 0);
  return c;
}
function drawFx(dpr) {
  const now = performance.now(), e = now - fx.t0, H = pbox.y1 - pbox.y0, W = pbox.x1 - pbox.x0;
  const fade = fx.done ? Math.max(0, 1 - (now - fx.tEnd)/700) : 1;
  const [, sy0] = toScreen(0, pbox.y0 - H*0.02), [, sy1] = toScreen(0, pbox.y1 + H*0.01);
  const ph = (e % 4400)/2200, p = ph <= 1 ? ph : 2 - ph, ly = sy0 + (sy1 - sy0)*p;
  const reveal = e < 2200 ? ly : sy1;
  // отсканированная часть — голограмма поверх фото
  ctx.save(); ctx.globalAlpha = 0.75*fade; ctx.beginPath(); ctx.rect(0, 0, cv.width, reveal); ctx.clip();
  ctx.drawImage(fx.holo, view.ox, view.oy, person.width*view.k, person.height*view.k); ctx.restore();
  // скелет и точки суставов
  if (fx.pts) {
    const S = i => toScreen(fx.pts[i].x, fx.pts[i].y), vis = i => fx.pts[i] && fx.pts[i].v > 0.4 && S(i)[1] <= reveal;
    ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = 'rgba(255,200,58,.85)'; ctx.lineWidth = 2*dpr; ctx.shadowColor = '#ffc83a'; ctx.shadowBlur = 8*dpr;
    ctx.beginPath(); for (const [a, b] of BONES) if (vis(a) && vis(b)) { const A = S(a), B = S(b); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke();
    for (const i of KP) if (vis(i)) {
      const [x, y] = S(i), pulse = (Math.sin(now/220 + i) + 1)/2, rr = Math.min(1, (pbox.y1 - pbox.y0)*view.k/(500*dpr)); // кольца — по размеру фигуры на экране
      ctx.fillStyle = '#ffc83a'; ctx.beginPath(); ctx.arc(x, y, (2 + 2*rr)*dpr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = `rgba(255,200,58,${0.25 + 0.5*pulse})`; ctx.lineWidth = 1.5*dpr; ctx.beginPath(); ctx.arc(x, y, (4 + (4 + 6*pulse)*rr)*dpr, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
  // линия сканера
  if (!fx.done) {
    const [x0] = toScreen(pbox.x0 - W*0.3, 0), [x1] = toScreen(pbox.x1 + W*0.3, 0);
    const gr = ctx.createLinearGradient(0, ly - 60*dpr*(ph <= 1 ? 1 : -1), 0, ly);
    gr.addColorStop(0, 'rgba(63,216,245,0)'); gr.addColorStop(1, 'rgba(63,216,245,.28)');
    ctx.save(); ctx.fillStyle = gr; ctx.fillRect(x0, Math.min(ly, ly - 60*dpr*(ph <= 1 ? 1 : -1)), x1 - x0, 60*dpr);
    ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 2.5*dpr; ctx.shadowColor = '#3fd8f5'; ctx.shadowBlur = 18*dpr;
    ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke(); ctx.restore();
  }
  // подпись с процентами
  const pct = fx.done ? 100 : Math.min(95, Math.round(e/40));
  const txt = fx.done ? TR('Скан завершён') : `${TR('ИИ сканирует фигуру')}… ${pct}%`;
  const [cx] = toScreen((pbox.x0 + pbox.x1)/2, 0), [, ty] = toScreen(0, pbox.y0);
  ctx.save(); ctx.globalAlpha = fade; ctx.font = `700 ${12*dpr}px Manrope, system-ui, sans-serif`;
  const tw = ctx.measureText(txt).width + 22*dpr, th = 24*dpr, tx = cx - tw/2, tyy = Math.max(th/2 + 4*dpr, ty - 22*dpr);
  ctx.fillStyle = 'rgba(6,14,22,.82)'; ctx.strokeStyle = '#3fd8f5'; ctx.lineWidth = 1.5*dpr; ctx.shadowColor = '#3fd8f5'; ctx.shadowBlur = 12*dpr;
  ctx.beginPath(); ctx.roundRect(tx, tyy - th/2, tw, th, 12*dpr); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#bff6ff'; ctx.textBaseline = 'middle'; ctx.fillText(txt, tx + 11*dpr, tyy + 1*dpr); ctx.restore();
}
function fxLoop() { if (!fx) return; draw(); if (fx.done && performance.now() - fx.tEnd > 700) { fx = null; draw(); return; } requestAnimationFrame(fxLoop); }
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
async function runScan() {
  if (!person || !pbox || fx) return;
  if (pmode) setPMode(null); hideCard();
  fx = { t0: performance.now(), done: false, tEnd: 0, holo: makeHolo(), pts: null };
  requestAnimationFrame(fxLoop);
  if (typeof announce === 'function') announce(TR('ИИ сканирует фигуру'));
  let res = null, err = null;
  try {
    if (!window.Scan || !window.ProScan) throw new Error(TR('Сканер недоступен'));
    const det = lastDet || await Scan.detect(personOrig); lastDet = det;
    if (fx) fx.pts = det.landmarks.map(l => ({ x: l.x*person.width, y: l.y*person.height, v: l.visibility == null ? 1 : l.visibility }));
    if (!marks) { const P = i => ({ x: det.landmarks[i].x*person.width, y: det.landmarks[i].y*person.height }); marks = { ls: P(11), rs: P(12), lh: P(23), rh: P(24), lk: P(25), rk: P(26), la: P(27), ra: P(28) }; }
    res = ProScan.measure(personOrig, det);
  } catch (e) { err = (e && e.message) || String(e); }
  const minT = reduceMotion() ? 600 : 3800, left = minT - (performance.now() - (fx ? fx.t0 : 0));
  if (left > 0) await new Promise(r => setTimeout(r, left));
  if (!fx) return; // фото убрали во время скана
  fx.done = true; fx.tEnd = performance.now();
  showCard(res, err);
}
const card = $f('scanCard');
function hideCard() { if (card && !card.hidden) { card.hidden = true; draw(); } }
function showCard(res, err) {
  if (!card) return;
  const rows = $f('scanCardRows'), sub = $f('scanCardSub'), tbl = card.querySelector('.sc-tbl'), ap = $f('scanCardApply');
  card.classList.toggle('err', !!err);
  ap.hidden = !!err; ap.disabled = false; tbl.hidden = !!err;
  $f('scanCardClose').textContent = TR(err ? 'Закрыть' : 'Не сейчас');
  if (err) {
    $f('scanCardT').textContent = TR('Скан не получился');
    sub.textContent = `${err}. ${TR('Встаньте прямо, целиком в кадре, руки чуть в стороны')}.`;
  } else {
    $f('scanCardT').textContent = TR('Скан готов');
    sub.textContent = `${TR('Масштаб — ваш рост')} ${res.current.height} ${TR('см')}. ${TR('Если рост другой, поправьте его в «Мерках» и сканируйте снова')}.`;
    rows.innerHTML = ['chest', 'waist', 'hips', 'shoulders', 'inseam'].filter(k => res.values[k] != null)
      .map(k => `<tr><td>${TR(res.names[k])}</td><td data-noi18n>${res.values[k]} ${TR('см')}</td><td data-noi18n>${res.current[k]} ${TR('см')}</td></tr>`).join('');
  }
  card.hidden = false; draw();
  notify(err ? TR('Скан не получился') : `${TR('Скан готов')}: ` + ['chest', 'waist', 'hips'].map(k => `${TR(res.names[k]).toLowerCase()} ${res.values[k]}`).join(', '), TR('Сканер'));
}
if (card) {
  $f('scanCardClose').onclick = hideCard;
  $f('scanCardApply').onclick = () => {
    const sz = window.ProScan && ProScan.apply(); if (!sz) return;
    $f('scanCardRows').insertAdjacentHTML('beforeend', `<tr class="size"><td>${TR('Ваш размер')}</td><td data-noi18n>${sz.letter}</td><td data-noi18n>${sz.top}</td></tr>`);
    $f('scanCardApply').disabled = true; $f('scanCardClose').textContent = TR('Готово');
    notify(`${TR('Мерки из скана применены')}. ${TR('Размер')} ${sz.letter}.`, TR('Сканер'));
    draw();
  };
}
$f('fitScan').onclick = () => { if (personCut) runScan(); else status(TR('Сначала загрузите своё фото в полный рост')); };

/* ---------- своё фото ---------- */
function refreshView(v) {
  if (typeof setView !== 'function' || typeof viewMode === 'undefined' || (typeof PHOTO_MODE !== 'undefined' && PHOTO_MODE)) return;
  setView(v || viewMode, true);
}
async function removePerson() {
  person = personOrig = null; personCut = false; pbox = null; marks = null; lastDet = null; fx = null; hideCard(); layers.length = 0; sel = null;
  room.classList.remove('has-photo'); setPMode(null); panel(); status(''); draw();
  try { await idb.del('fit-person'); await idb.del('fit-person-cut'); await idb.del('fit-layers'); } catch (e) {}
  refreshView(viewMode === 'photo' ? 'body' : null);
  notify('Фото убрано. Проекция снова 3D-модель.', 'Проекция');
}
async function setPerson(src, quiet, cut) {
  personOrig = toCanvas(src, MAXP); marks = null; lastDet = null; hideCard();
  person = cut ? toCanvas(cut, MAXP) : cloneC(personOrig); personCut = !!cut;
  pbox = personCut ? boxOf(person) : null;
  room.classList.add('has-photo'); fitView(); draw();
  if (quiet) return;
  refreshView(viewMode === 'holo' ? 'photo' : null); // фото — проекция во всех видах, кроме голограммы
  const r = await cutPerson(personOrig);
  if (r) { person = r.cut; personCut = true; pbox = boxOf(person); status(r.how === 'ai' ? '' : 'Фон убран быстро. Для точного результата запустите на ноутбуке модуль удаления фона.'); }
  else status('Фон не убран: модуль удаления фона не запущен и нет интернета для распознавания. Попробуйте другое фото на однотонном фоне.');
  fitView(); draw(); save(true);
  notify('Ваше фото — теперь проекция.', 'Проекция');
  if (personCut) runScan(); else if (!marks) findMarks().then(draw);
  setTimeout(() => { if (/^Убираю/.test($f('fitStatus').textContent)) status(''); }, 100);
}
$f('fitFile').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  try { await setPerson(await fileToCanvas(f, MAXP)); } catch (err) { status(err.message); }
});
$f('fitShoot').onclick = async () => { const c = await Cam.open({ facing: 'environment', guide: 'body', timer: 10, title: 'Своё фото' }); if (c) setPerson(c); };
$f('fitSnap').onclick = async () => {
  const keep = sel; sel = null;
  const out = document.createElement('canvas'); out.width = person.width; out.height = person.height;
  const g = out.getContext('2d'); g.drawImage(person, 0, 0);
  for (const L of layers) { g.save(); g.globalAlpha = L.op; g.translate(L.x, L.y); g.rotate(L.r); g.scale(L.s*L.sx, L.s*L.sy); g.drawImage(L.cut, -L.cut.width/2, -L.cut.height/2); g.restore(); }
  sel = keep; draw();
  const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.9)), file = new File([blob], 'proekciya-primerka.jpg', { type: 'image/jpeg' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Проекция — примерка' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  notify('Снимок примерки сохранён.', 'Примерочная');
};
$f('fitChange').onclick = () => $f('fitFile').click();
$f('fitRemove').onclick = removePerson;
function status(t) { $f('fitStatus').textContent = t || ''; }

/* ---------- хранение на устройстве ---------- */
function save(withPhoto) {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try {
      if (withPhoto && person) { await idb.put('fit-person', personOrig.toDataURL('image/jpeg', 0.9)); await idb.put('fit-person-cut', personCut ? person.toDataURL('image/png') : null); }
      await idb.put('fit-layers', layers.map(L => ({ kind: L.kind, title: L.title, x: L.x, y: L.y, s: L.s, sx: L.sx, sy: L.sy, r: L.r, op: L.op,
        cut: L.cut.toDataURL('image/png'), orig: L.orig.toDataURL('image/png') })));
    } catch (e) { console.warn('fit save', e); }
  }, withPhoto ? 0 : 500);
}
async function restore() {
  try {
    const p = await idb.get('fit-person'); if (!p) return;
    const pc = await idb.get('fit-person-cut');
    await setPerson(await loadImg(p), true, pc ? await loadImg(pc) : null);
    setTimeout(() => refreshView(), 0);
    if (personCut) findMarks().then(draw);
    const ls = await idb.get('fit-layers') || [];
    for (const o of ls) { const [c, g] = await Promise.all([loadImg(o.cut), loadImg(o.orig)]);
      layers.push({ ...o, id: Math.random().toString(36).slice(2), cut: toCanvas(c, 4000), orig: toCanvas(g, 4000) }); }
    draw();
  } catch (e) { console.warn('fit restore', e); }
}

addEventListener('resize', resize);
new ResizeObserver(resize).observe(room);
restore();
window.PhotoFit = { addGarment, get active() { return !room.hidden; }, get hasPerson() { return !!person; }, open() { $f('fitFile').click(); },
  /* исходное фото человека (с фоном — так ИИ-примерке лучше видно позу и свет) */
  personData(max = 1536) { if (!personOrig) return null; const k = Math.min(1, max/Math.max(personOrig.width, personOrig.height)), c = document.createElement('canvas');
    c.width = Math.round(personOrig.width*k); c.height = Math.round(personOrig.height*k); c.getContext('2d').drawImage(personOrig, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.9); },
  usePhoto(img) { return setPerson(img); }, redraw() { fitView(); draw(); } };
})();
