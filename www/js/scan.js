/* Автоматический скан фигуры по фото.
 * 1) MediaPipe Pose находит суставы и вырезает силуэт человека (маска).
 * 2) По силуэту на нужных высотах меряется ширина (спереди) и глубина (сбоку).
 * 3) Обхват = периметр эллипса с этими осями. Масштаб задаёт рост.
 */
(function (root) {
'use strict';

const MP_VERSION = '0.10.14';
const SOURCES = [
  { base: 'vendor/mediapipe', model: 'vendor/models/pose_landmarker_full.task' },
  { base: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VERSION,
    model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task' }
];
let landmarker = null, loading = null;

async function exists(url) {
  if (/^https?:/.test(url)) return true;
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch (e) { return false; }
}
function load(onStatus) {
  if (landmarker) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    let lastErr = null;
    for (const src of SOURCES) {
      try {
        if (!(await exists(src.base + '/vision_bundle.mjs')) || !(await exists(src.model))) continue;
        onStatus && onStatus(/^https?:/.test(src.base) ? 'Загружаю распознавание фигуры из интернета (около 10 МБ, один раз)…' : 'Готовлю распознавание фигуры…');
        const mod = await import(new URL(src.base + '/vision_bundle.mjs', location.href).href);
        const fileset = await mod.FilesetResolver.forVisionTasks(new URL(src.base + '/wasm', location.href).href);
        for (const delegate of ['GPU', 'CPU']) {
          try {
            landmarker = await mod.PoseLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: new URL(src.model, location.href).href, delegate },
              runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: true,
              minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5
            });
            return landmarker;
          } catch (e) { lastErr = e; }
        }
      } catch (e) { lastErr = e; }
    }
    loading = null;
    if (lastErr) console.warn(lastErr);
    throw new Error('Автоматический скан недоступен: нет интернета для первой загрузки распознавания. Отметьте точки вручную или подключитесь к сети.');
  })();
  return loading;
}

/* Находит человека на фото. Возвращает суставы (0..1) и маску силуэта. */
async function detect(img, onStatus) {
  const lm = await load(onStatus);
  onStatus && onStatus('Ищу фигуру на фото…');
  const res = lm.detect(img);
  try {
    if (!res.landmarks || !res.landmarks.length) throw new Error('Человек на фото не найден. Нужен снимок в полный рост на ровном фоне.');
    const m = res.segmentationMasks && res.segmentationMasks[0];
    if (!m) throw new Error('Не удалось выделить силуэт.');
    const mask = m.getAsFloat32Array().slice();
    return { landmarks: res.landmarks[0], mask, w: m.width, h: m.height };
  } finally { if (res.close) res.close(); }
}

/* ---------- измерение по силуэту (чистая функция, проверяется тестами) ---------- */
const L = { NOSE:0, LSH:11, RSH:12, LEL:13, REL:14, LWR:15, RWR:16, LHIP:23, RHIP:24, LKN:25, RKN:26, LAN:27, RAN:28, LHEEL:29, RHEEL:30, LTOE:31, RTOE:32 };
const ramanujan = (a, b) => Math.PI*(3*(a+b) - Math.sqrt((3*a+b)*(a+3*b)));

function silhouette(det) {
  const { mask, w, h } = det, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y*w + x] > 0.5;
  const P = i => ({ x: det.landmarks[i].x*w, y: det.landmarks[i].y*h, v: det.landmarks[i].visibility ?? 1 });
  const cx = Math.round((P(L.LHIP).x + P(L.RHIP).x + P(L.LSH).x + P(L.RSH).x)/4);
  // верх и низ силуэта рядом с осью тела
  let top = -1, bot = -1;
  const band = Math.max(4, Math.round(w*0.06));
  for (let y = 0; y < h && top < 0; y++) for (let x = cx - band*2; x <= cx + band*2; x++) if (on(x, y)) { top = y; break; }
  const footL = Math.min(P(L.LAN).x, P(L.RAN).x, P(L.LTOE).x, P(L.RTOE).x) - band*2, footR = Math.max(P(L.LAN).x, P(L.RAN).x, P(L.LTOE).x, P(L.RTOE).x) + band*2;
  for (let y = h-1; y >= 0 && bot < 0; y--) for (let x = Math.max(0, Math.floor(footL)); x <= Math.min(w-1, footR); x++) if (on(x, y)) { bot = y; break; }
  return { on, P, cx, top, bot, w, h };
}

// ширина силуэта на строке y, растущая от x0; руки отсекаются по линии плечо-локоть-запястье
function run(S, y, x0, arms) {
  y = Math.round(y);
  let a = Math.round(x0), b = Math.round(x0);
  if (!S.on(a, y)) { // ось могла попасть в просвет — ищем ближайший пиксель тела
    let k = 1; while (k < S.w*0.05 && !S.on(a-k, y) && !S.on(a+k, y)) k++;
    a = b = S.on(a-k, y) ? a-k : a+k; if (!S.on(a, y)) return null;
  }
  while (S.on(a-1, y)) a--;
  while (S.on(b+1, y)) b++;
  if (arms) for (const arm of arms) {
    const ax = arm.xAt(y); if (ax == null) continue;
    // рука слилась с торсом: силуэт доходит до оси руки — обрезаем по внутреннему краю руки
    if (ax < x0 && a < ax + arm.r*0.3) a = Math.max(a, Math.round(ax + arm.r));
    if (ax > x0 && b > ax - arm.r*0.3) b = Math.min(b, Math.round(ax - arm.r));
  }
  return { a, b, len: b - a + 1, y };
}
function armLine(S, sh, el, wr, r) {
  const p = [S.P(sh), S.P(el), S.P(wr)];
  return { r, xAt(y) {
    for (let i = 0; i < 2; i++) { const A = p[i], B = p[i+1];
      if ((y - A.y)*(y - B.y) <= 0 && A.y !== B.y) return A.x + (B.x - A.x)*(y - A.y)/(B.y - A.y); }
    return null; } };
}

/* front, side — результаты detect(); side может быть null. */
function measure(front, side, heightCm, gender) {
  const f = silhouette(front);
  if (f.top < 0 || f.bot < 0 || f.bot - f.top < front.h*0.3) throw new Error('Фигура видна не целиком. Нужны и макушка, и стопы.');
  const vis = [L.NOSE, L.LSH, L.RSH, L.LHIP, L.RHIP, L.LAN, L.RAN].map(i => f.P(i).v);
  if (Math.min(...vis) < 0.35) throw new Error('Часть тела не видна. Встаньте целиком в кадр, руки чуть в стороны.');
  const px = f.bot - f.top + 1, k = heightCm/px, rowAt = fr => f.bot - fr*px;
  const armR = px*0.026;
  const arms = [armLine(f, L.LSH, L.LEL, L.LWR, armR), armLine(f, L.RSH, L.REL, L.RWR, armR)];
  const shY = (f.P(L.LSH).y + f.P(L.RSH).y)/2, hipY = (f.P(L.LHIP).y + f.P(L.RHIP).y)/2;
  const axisX = y => { const t = (y - shY)/(hipY - shY), a = (f.P(L.LSH).x + f.P(L.RSH).x)/2, b = (f.P(L.LHIP).x + f.P(L.RHIP).x)/2; return a + (b - a)*Math.max(0, Math.min(1.4, t)); };
  const width = (fr0, fr1, pick) => {
    let best = null;
    for (let fr = fr0; fr <= fr1 + 1e-9; fr += 0.004) { const y = rowAt(fr), r = run(f, y, axisX(y), arms); if (!r) continue;
      if (!best || (pick === 'min' ? r.len < best.len : pick === 'max' ? r.len > best.len : false)) best = Object.assign(r, { fr }); }
    return best;
  };
  const med = fr => { const L2 = []; for (let d = -0.006; d <= 0.006; d += 0.003) { const y = rowAt(fr + d), r = run(f, y, axisX(y), arms); if (r) L2.push(r); }
    L2.sort((p, q) => p.len - q.len); return Object.assign(L2[Math.floor(L2.length/2)] || {}, { fr }); };

  // промежность: идём вниз по оси от бёдер, пока силуэт не разойдётся на две ноги
  // если бёдра сомкнуты, просвета не видно — тогда берём типичное положение под тазобедренными суставами
  let crotch = null;
  for (let y = Math.round(hipY); y < Math.min(f.bot, hipY + 0.12*px); y++) {
    const x = Math.round(axisX(hipY)); let off = 0; for (let d = -2; d <= 2; d++) if (!f.on(x + d, y)) off++;
    if (off >= 4) { crotch = y; break; }
  }
  if (crotch == null) crotch = hipY + 0.05*px;
  const inseam = (f.bot - crotch)*k, crFr = (f.bot - crotch)/px;

  const chest = med(0.722), waist = width(0.585, 0.665, 'min');
  const hips = width(Math.max(crFr + 0.015, 0.46), Math.max(crFr + 0.09, 0.56), 'max');
  const jd = Math.hypot(f.P(L.LSH).x - f.P(L.RSH).x, f.P(L.LSH).y - f.P(L.RSH).y)*k;
  const shoulders = jd + 8;

  // глубина: по фото сбоку или по типичным пропорциям
  let depth = null, sideRows = null;
  if (side) {
    const s = silhouette(side);
    if (s.top >= 0 && s.bot > s.top) {
      const sp = s.bot - s.top + 1, sk = heightCm/sp, sx = Math.round((s.P(L.LHIP).x + s.P(L.RHIP).x + s.P(L.LSH).x + s.P(L.RSH).x)/4);
      const at = fr => { const y = s.bot - fr*sp; return run(s, y, sx, null); };
      const c = at(chest.fr), wv = at(waist.fr), hv = at(hips.fr);
      if (c && wv && hv) { depth = { chest: c.len*sk, waist: wv.len*sk, hips: hv.len*sk }; sideRows = { c, w: wv, h: hv, sk }; }
    }
  }
  const ratio = gender === 'f' ? { chest: 0.74, waist: 0.76, hips: 0.78 } : { chest: 0.71, waist: 0.80, hips: 0.74 };
  const W = { chest: chest.len*k, waist: waist.len*k, hips: hips.len*k };
  const D = depth || { chest: W.chest*ratio.chest, waist: W.waist*ratio.waist, hips: W.hips*ratio.hips };
  // сечение торса «квадратнее» эллипса — небольшая поправка
  const shape = { chest: 1.04, waist: 1.02, hips: 1.03 };
  const circ = key => ramanujan(W[key]/2, D[key]/2)*shape[key];
  return {
    values: { chest: circ('chest'), waist: circ('waist'), hips: circ('hips'), shoulders, inseam },
    usedSide: !!depth,
    overlay: { top: f.top, bot: f.bot, k, rows: { chest, waist, hips }, crotch, side: sideRows,
      shoulders: [f.P(L.LSH), f.P(L.RSH)] }
  };
}

/* Рисует результат поверх фото: линии замеров как сантиметровая лента */
function drawOverlay(ctx, img, det, ov, scale, labels) {
  const w = det.w*scale, h = det.h*scale;
  ctx.drawImage(img, 0, 0, w, h);
  // затемнить фон вне силуэта
  const tmp = document.createElement('canvas'); tmp.width = det.w; tmp.height = det.h;
  const tg = tmp.getContext('2d'), id = tg.createImageData(det.w, det.h);
  for (let i = 0; i < det.mask.length; i++) { const a = det.mask[i] > 0.5 ? 0 : 120; id.data[i*4+3] = a; }
  tg.putImageData(id, 0, 0); ctx.drawImage(tmp, 0, 0, w, h);
  const line = (r, text) => {
    if (!r) return; const y = r.y*scale;
    ctx.fillStyle = '#ffc21a'; ctx.fillRect(r.a*scale, y - 3, (r.b - r.a)*scale, 6);
    ctx.fillStyle = '#1a1a1a'; for (let x = r.a*scale; x < r.b*scale; x += 5) ctx.fillRect(x, y - 3, 1, 3);
    if (text) { ctx.font = '700 13px system-ui, sans-serif'; const tw = ctx.measureText(text).width;
      const tx = Math.min(w - tw - 10, r.b*scale + 6); ctx.fillStyle = 'rgba(22,24,29,.85)'; ctx.fillRect(tx - 4, y - 11, tw + 8, 20);
      ctx.fillStyle = '#ffc21a'; ctx.fillText(text, tx, y + 4); }
  };
  if (ov) {
    line(ov.rows.chest, labels && labels.chest); line(ov.rows.waist, labels && labels.waist); line(ov.rows.hips, labels && labels.hips);
    ctx.strokeStyle = '#ffc21a'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    for (const y of [ov.top, ov.bot]) if (y != null) { ctx.beginPath(); ctx.moveTo(0, y*scale); ctx.lineTo(w, y*scale); ctx.stroke(); }
    if (ov.crotch != null) { ctx.beginPath(); ctx.moveTo(w*0.3, ov.crotch*scale); ctx.lineTo(w*0.7, ov.crotch*scale); ctx.stroke(); }
    ctx.setLineDash([]);
  }
}

const api = { load, detect, measure, drawOverlay, LM: L };
root.Scan = api;
if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
