/* Реалистичная модель из MakeHuman (или любой похожий OBJ человека в A-позе).
 * Загружает OBJ + MTL + текстуры, сама находит подмышки, пах, руки и ноги
 * и подгоняет фигуру под мерки: рост, длину ноги, обхваты, плечи, рукав, голову, стопу.
 * Экспорт из MakeHuman распространяется свободно (CC0). */
(function (root) {
'use strict';
const KIND = { SKIN:0, HAIR:1, CHEST:2, WAIST:3, PELVIS:4, LEG_UP:5, LEG_LO:6, FOOT:7, ARM_UP:8, ARM_LO:9, HAND:10, HEAD:11, NECK:12, BREAST:13, LIPS:14, GLUTE:15 };
const REF = 175; // рабочий рост шаблона, см

/* ---------- чтение OBJ / MTL ---------- */
function parseMTL(text) {
  const mats = {}; let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '#') continue;
    const [k, ...rest] = l.split(/\s+/), v = rest.join(' ');
    if (k === 'newmtl') { cur = mats[v] = { name: v, map: null, kd: [0.8, 0.8, 0.8], d: 1 }; }
    else if (!cur) continue;
    else if (k === 'map_Kd') cur.map = rest[rest.length - 1];
    else if (k === 'map_d' && !cur.map) cur.alphaMap = rest[rest.length - 1];
    else if (k === 'Kd') cur.kd = rest.slice(0, 3).map(Number);
    else if (k === 'd') cur.d = +rest[0];
  }
  return mats;
}
function parseOBJ(text) {
  const V = [], VT = [], parts = new Map();
  let obj = 'body', mtl = '', mtllib = null, part = null;
  const getPart = () => { const key = obj + '|' + mtl; if (!parts.has(key)) parts.set(key, { name: obj, mtl, map: new Map(), pos: [], uv: [], idx: [] }); return parts.get(key); };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw[0] === '#') continue;
    const sp = raw.indexOf(' '), k = sp < 0 ? raw : raw.slice(0, sp), r = raw.slice(sp + 1).trim();
    if (k === 'v') { const a = r.split(/\s+/); V.push(+a[0], +a[1], +a[2]); }
    else if (k === 'vt') { const a = r.split(/\s+/); VT.push(+a[0], +a[1]); }
    else if (k === 'o' || k === 'g') { obj = r || obj; part = null; }
    else if (k === 'usemtl') { mtl = r; part = null; }
    else if (k === 'mtllib') mtllib = r;
    else if (k === 'f') {
      part = part || getPart();
      const ids = r.split(/\s+/).map(t => {
        let m = part.map.get(t); if (m !== undefined) return m;
        const [vi, ti] = t.split('/'); let a = +vi, b = ti ? +ti : 0;
        if (a < 0) a = V.length/3 + a + 1; if (b < 0) b = VT.length/2 + b + 1;
        m = part.pos.length/3; part.pos.push(V[(a-1)*3], V[(a-1)*3+1], V[(a-1)*3+2]);
        if (b) part.uv.push(VT[(b-1)*2], VT[(b-1)*2+1]); else part.uv.push(0, 0);
        part.map.set(t, m); return m;
      });
      for (let i = 1; i + 1 < ids.length; i++) part.idx.push(ids[0], ids[i], ids[i+1]);
    }
  }
  const list = [...parts.values()].filter(p => p.idx.length).map(p => ({ name: p.name, mtl: p.mtl, pos: new Float32Array(p.pos), uv: new Float32Array(p.uv), idx: new Uint32Array(p.idx) }));
  return { parts: list, mtllib };
}
function roleOf(name) {
  const n = name.toLowerCase();
  if (/brow/.test(n)) return 'brows';
  if (/lash/.test(n)) return 'lashes';
  if (/eye/.test(n)) return 'eyes';
  if (/teeth|tongue|joint|helper|skel/.test(n)) return 'hide';
  if (/hair|bob|ponytail|braid|afro|short0|long0/.test(n)) return 'hair';
  return 'other';
}

/* Загрузка из набора файлов: getText(name), getImage(name) — по имени файла без пути */
async function load(getText, getImage, objName) {
  const objText = await getText(objName); if (!objText) throw new Error('Не найден файл модели ' + objName);
  const { parts, mtllib } = parseOBJ(objText);
  let mats = {};
  if (mtllib) { const t = await getText(mtllib.split(/[\\/]/).pop()).catch(() => null); if (t) mats = parseMTL(t); }
  // тело — самая большая часть, не похожая на глаза, волосы и т. п.
  let body = null;
  for (const p of parts) { p.role = roleOf(p.name + ' ' + p.mtl); if (p.role === 'other' && (!body || p.pos.length > body.pos.length)) body = p; }
  if (!body) throw new Error('В файле нет тела человека.');
  body.role = 'body';
  for (const p of parts) {
    const m = mats[p.mtl]; p.color = m ? m.kd : [0.8, 0.8, 0.8];
    if (m && m.map && p.role !== 'body') p.image = await getImage(m.map.split(/[\\/]/).pop()).catch(() => null);
  }
  return normalize({ parts: parts.filter(p => p.role !== 'hide'), body });
}

/* ---------- приведение к виду: Y вверх, стопы на 0, лицом к +Z, рост REF ---------- */
function normalize(t) {
  const B = t.body.pos, ext = [0, 1, 2].map(a => { let lo = 1e9, hi = -1e9; for (let i = a; i < B.length; i += 3) { lo = Math.min(lo, B[i]); hi = Math.max(hi, B[i]); } return [lo, hi]; });
  const up = ext[2][1] - ext[2][0] > (ext[1][1] - ext[1][0])*1.2 ? 2 : 1;
  const tf = (p, fn) => { for (let i = 0; i < p.length; i += 3) { const r = fn(p[i], p[i+1], p[i+2]); p[i] = r[0]; p[i+1] = r[1]; p[i+2] = r[2]; } };
  if (up === 2) for (const p of t.parts) tf(p.pos, (x, y, z) => [x, z, -y]);
  let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < B.length; i += 3) { x0 = Math.min(x0, B[i]); x1 = Math.max(x1, B[i]); y0 = Math.min(y0, B[i+1]); y1 = Math.max(y1, B[i+1]); z0 = Math.min(z0, B[i+2]); z1 = Math.max(z1, B[i+2]); }
  const s = REF/(y1 - y0), cx = (x0 + x1)/2, cz = (z0 + z1)/2;
  for (const p of t.parts) tf(p.pos, (x, y, z) => [(x - cx)*s, (y - y0)*s, (z - cz)*s]);
  // лицо — сторона, где сильнее выступает нос
  // перед — куда смотрят пальцы ног: от щиколотки носок уходит дальше, чем пятка
  let az = 0, an = 0, fz0 = 1e9, fz1 = -1e9;
  for (let i = 0; i < B.length; i += 3) { const y = B[i+1]; if (y > REF*0.04 && y < REF*0.07) { az += B[i+2]; an++; } if (y < REF*0.02) { fz0 = Math.min(fz0, B[i+2]); fz1 = Math.max(fz1, B[i+2]); } }
  az /= an || 1;
  if (fz1 - az < az - fz0) for (const p of t.parts) tf(p.pos, (x, y, z) => [-x, y, -z]);
  analyze(t);
  return t;
}

/* ---------- разбор фигуры шаблона ---------- */
function analyze(t) {
  const P = t.body.pos, n = P.length/3, H = REF;
  const bands = Array.from({ length: H + 2 }, () => []);
  for (let i = 0; i < n; i++) { const y = P[i*3+1]; bands[Math.max(0, Math.min(H + 1, Math.round(y)))].push(i); }
  // граница рука/торс на каждой высоте: первый просвет по X от середины наружу
  // срез треугольниками: непрерывный контур, без ложных просветов между редкими вершинами
  const TI = t.body.idx, segX = y => { const xs = [];
    for (let k = 0; k < TI.length; k += 3) { const a = TI[k]*3, b = TI[k+1]*3, c = TI[k+2]*3, ya = P[a+1], yb = P[b+1], yc = P[c+1];
      if ((ya < y && yb < y && yc < y) || (ya > y && yb > y && yc > y)) continue;
      const cut = []; for (const [p, q] of [[a, b], [b, c], [c, a]]) { const y0 = P[p+1], y1 = P[q+1]; if ((y0 - y)*(y1 - y) <= 0 && y0 !== y1) { const s = (y - y0)/(y1 - y0); cut.push(P[p] + (P[q] - P[p])*s); } }
      if (cut.length >= 2) { const lo = Math.min(...cut), hi = Math.max(...cut); if (hi > 0) xs.push([Math.max(0, lo), hi]); if (lo < 0) xs.push([Math.max(0, -hi), -lo]); } }
    return xs; };
  const gapAt = y => { const iv = segX(y).sort((p, q) => p[0] - q[0]); if (!iv.length) return null; let reach = iv[0][1];
    for (let k = 1; k < iv.length; k++) { if (iv[k][0] - reach > 0.6 && reach > 3) return (iv[k][0] + reach)/2; reach = Math.max(reach, iv[k][1]); } return null; };
  const bound = new Float32Array(H + 2).fill(1e9);
  let armpit = null, tip = null;
  for (let y = Math.round(H*0.84); y > Math.round(H*0.25); y--) { const g = gapAt(y); if (g != null) { bound[y] = g; if (armpit == null) armpit = y; tip = y; } }
  if (armpit == null) throw new Error('Не удалось найти руки: модель должна стоять с руками чуть в стороны (A-поза).');
  for (let y = tip; y <= armpit; y++) if (bound[y] > 1e8) { let a = y - 1, b = y + 1; while (bound[a] > 1e8 && a > tip) a--; while (bound[b] > 1e8 && b < armpit) b++; bound[y] = (bound[a] + bound[b])/2; }
  // кончики пальцев — нижняя точка руки
  let F = null;
  for (let i = 0; i < n; i++) { const x = P[i*3], y = P[i*3+1], yb = Math.round(y); if (x > 0 && yb >= tip && yb <= armpit && x > bound[yb] && (!F || y < F[1])) F = [x, y, P[i*3+2]]; }
  // пах: нижняя точка средней линии, где поверхность смотрит вниз/вперёд/назад (не внутренняя сторона бёдер)
  const NR = normals(P, t.body.idx);
  let crotch = 1e9;
  for (let i = 0; i < n; i++) { const x = P[i*3], y = P[i*3+1]; if (Math.abs(x) < 0.9 && Math.abs(NR[i*3]) < 0.5 && y > H*0.38 && y < H*0.6) crotch = Math.min(crotch, y); }
  if (crotch > 1e8) crotch = H*0.47;
  // ширина торса по высоте
  const torsoW = y => { let lo = 1e9, hi = -1e9; for (const i of bands[y] || []) { const x = P[i*3]; if (Math.abs(x) < bound[y]) { lo = Math.min(lo, x); hi = Math.max(hi, x); } } return hi - lo; };
  let waist = Math.round(H*0.62), wmin = 1e9; for (let y = Math.round(H*0.58); y <= Math.round(H*0.68); y++) { const w = torsoW(y); if (w > 0 && w < wmin) { wmin = w; waist = y; } }
  let hip = Math.round(crotch + 0.06*H), wmax = 0; for (let y = Math.round(crotch + 1); y <= Math.round(crotch + 0.11*H); y++) { const w = torsoW(y); if (w > wmax) { wmax = w; hip = y; } }
  let neck = Math.round(H*0.84), nmin = 1e9; for (let y = Math.round(H*0.82); y <= Math.round(H*0.855); y++) { const w = torsoW(y); if (w > 0 && w < nmin) { nmin = w; neck = y; } }
  // плечо: ширина на уровне акромиона, сустав — у границы руки
  const shY = Math.min(H*0.84, armpit + 0.05*H); let shx = 0; for (const i of bands[Math.round(shY)] || []) shx = Math.max(shx, Math.abs(P[i*3]));
  let armW = 0; { const yy = Math.round(armpit - 4), xs = (bands[yy] || []).map(i => Math.abs(P[i*3])).filter(x => x > bound[yy]); if (xs.length) armW = Math.max(...xs) - Math.min(...xs); }
  const armR = Math.max(3, armW/2), J = [bound[armpit] + armR, Math.max(armpit + 0.035*H, 0.8*H), 0];
  const dir = norm([F[0] - J[0], F[1] - J[1], 0]), armLen = Math.hypot(F[0] - J[0], F[1] - J[1]);
  const wristT = armLen - 0.108*H;
  // стопа (левая, x > 0)
  let fz0 = 1e9, fz1 = -1e9, ax = 0, an = 0; for (let i = 0; i < n; i++) if (P[i*3] > 0 && P[i*3+1] < 0.03*H) { fz0 = Math.min(fz0, P[i*3+2]); fz1 = Math.max(fz1, P[i*3+2]); }
  for (let i = 0; i < n; i++) if (P[i*3] > 0 && Math.abs(P[i*3+1] - 0.06*H) < 1) { ax += P[i*3]; an++; }
  let hzc = 0, hzn = 0; for (let i = 0; i < n; i++) if (P[i*3+1] > H*0.93) { hzc += P[i*3+2]; hzn++; }
  t.an = { H, bound, armpit, tip, F, crotch, waist, hip, neck, shY, shoulders0: shx*2*0.92, J, dir, armLen, wristT, armR,
    footLen: fz1 - fz0, footZ0: fz0, ankleX: an ? ax/an : 8, chin: H*0.872, headCZ: hzn ? hzc/hzn : 0 };
  // классы вершин тела: 0 торс/голова, 1 рука, 2 нога
  const cls = new Uint8Array(n), side = new Int8Array(n), armT = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i*3], y = P[i*3+1], yb = Math.round(y), ax2 = Math.abs(x); side[i] = x >= 0 ? 1 : -1;
    const tt = (ax2 - J[0])*dir[0] + (y - J[1])*dir[1];
    // рука — снаружи от просвета и рядом с осью руки (плечо → кончики пальцев)
    const pt = Math.max(0, Math.min(armLen, tt)), dx = ax2 - (J[0] + dir[0]*pt), dy = y - (J[1] + dir[1]*pt), near = Math.hypot(dx, dy) < Math.max(armR*1.5, 5.5);
    if ((yb >= tip - 1 && yb <= armpit && ax2 > bound[Math.max(tip, Math.min(armpit, yb))] && near) || (y > armpit && y < armpit + 0.08*H && ax2 > J[0] - armR*0.2 && y < J[1] + armR)) { cls[i] = 1; armT[i] = tt; }
    else if (y < crotch) cls[i] = 2;
  }
  t.cls = cls; t.side = side; t.armT = armT;
}
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(a => a/l); };

/* ---------- кольцо мерки: выпуклая оболочка точек среза ---------- */
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function ring(P, n, y, test, band) {
  const pts = []; band = band || 0.7;
  for (let i = 0; i < n; i++) if (Math.abs(P[i*3+1] - y) < band && test(i)) pts.push([P[i*3], P[i*3+2]]);
  if (pts.length < 3) return null;
  const h = hull(pts); let L = 0, cx = 0, cz = 0;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i+1) % h.length]; L += Math.hypot(a[0]-b[0], a[1]-b[1]); cx += a[0]; cz += a[1]; }
  return { len: L, pts: h, cx: cx/h.length, cz: cz/h.length, y };
}

/* ---------- подгонка под мерки ---------- */
function fit(t, M0, gender) {
  const M = (root.HumanBody && root.HumanBody.fillM) ? root.HumanBody.fillM(M0, gender) : M0;
  const a = t.an, H = M.height, g = H/REF, f = gender === 'f';
  // шаблон в масштабе роста
  const L = k => a[k]*g;
  const crotch0 = L('crotch'), inseam = Math.min(M.inseam, H*0.52);
  const mapY = (y, arm) => arm || y >= crotch0 ? inseam + (y - crotch0)*(H - inseam)/(H - crotch0) : y*inseam/crotch0;
  const unmapY = y => y >= inseam ? crotch0 + (y - inseam)*(H - crotch0)/(H - inseam) : y*crotch0/inseam;
  const lv = { hips: L('hip'), waist: L('waist'), chest: L('armpit') - 0.018*H, underbust: L('armpit') - 0.068*H, neck: L('neck'), head: 0.94*H, thigh: crotch0 - 5 };
  let R = { chest: 1, underbust: 1, waist: 1, hips: 1, neck: 1, head: 1, thigh: 1 };
  const B = t.body, n = B.pos.length/3;
  let out = null;
  for (let it = 0; it < 7; it++) {
    out = deform(t, M, g, R, lv, mapY, inseam, f);
    // замер на результате и поправка
    const P = out.parts[out.bodyIndex].pos, cls = t.cls, side = t.side, rings = {};
    const tor = i => cls[i] === 0, legL = i => cls[i] === 2 && side[i] > 0, head = i => cls[i] === 0;
    rings.chest = ring(P, n, mapY(lv.chest), tor); rings.waist = ring(P, n, mapY(lv.waist), tor); rings.hips = ring(P, n, mapY(lv.hips), tor);
    rings.neck = ring(P, n, mapY(lv.neck), tor); rings.head = ring(P, n, mapY(lv.head), head); rings.thigh = ring(P, n, mapY(lv.thigh), legL);
    if (f) rings.underbust = ring(P, n, mapY(lv.underbust), tor);
    out.rings = rings;
    let err = 0;
    for (const k in rings) if (rings[k] && M[k]) { const q = M[k]/rings[k].len; err = Math.max(err, Math.abs(rings[k].len - M[k])); R[k] = Math.min(2.5, Math.max(0.4, R[k]*q)); }
    if (err < 0.8) break;
  }
  return finish(t, out, M, gender, lv, mapY, inseam);
}
function lerpTable(tab, y) { // tab: [[y, v], ...] по возрастанию y
  if (y <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (y <= tab[i][0]) { const [y0, v0] = tab[i-1], [y1, v1] = tab[i], k = (y - y0)/(y1 - y0); return v0 + (v1 - v0)*k; } return tab[tab.length-1][1];
}
const ss = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0)/(e1 - e0))); return k*k*(3 - 2*k); };
function deform(t, M, g, R, lv, mapY, inseam, f) {
  const a = t.an, H = M.height, crotch0 = a.crotch*g;
  const J = [a.J[0]*g, a.J[1]*g, 0], dir = a.dir, armLen0 = a.armLen*g;
  const halfChest = a.shoulders0*g*0.32;
  const shoulderDx = Math.max((M.shoulders - a.shoulders0*g)/2, halfChest*(R.chest - 1) + 0.5*(R.chest > 1 ? 1 : 0));
  const sleeve0 = armLen0 - 0.108*H + 4, kArm = Math.min(1.35, Math.max(0.75, M.sleeve/sleeve0));
  const thick = Math.min(1.3, Math.max(0.82, Math.sqrt(R.chest)));
  const rTab = [[crotch0 - 1, R.hips], [lv.hips, R.hips], [lv.waist, R.waist], [f ? lv.underbust : (lv.waist + lv.chest)/2, f ? R.underbust : (R.waist + R.chest)/2], [lv.chest, R.chest],
    [a.armpit*g + 0.04*H, (R.chest + R.neck)/2], [lv.neck, R.neck], [a.chin*g, R.neck]];
  const headC = [0, a.chin*g, a.headCZ*g], kFoot = M.foot/(a.footLen*g), kHead = R.head;
  const legTab = [[0, 1], [a.H*0.045*g + 3, Math.sqrt(R.thigh)*0.5 + 0.5], [0.285*H, (R.thigh + 1)/2 + (R.thigh - 1)*0.15], [crotch0 - 8, R.thigh], [crotch0, R.hips]];
  const armpitG = a.armpit*g, armR = a.armR*g;
  const parts = t.parts.map(p => ({ src: p, pos: new Float32Array(p.pos.length) }));
  let bodyIndex = 0;
  parts.forEach((pp, pi) => {
    const S = pp.src.pos, D = pp.pos, isBody = pp.src === t.body; if (isBody) bodyIndex = pi;
    for (let i = 0; i < S.length; i += 3) {
      let x = S[i]*g, y = S[i+1]*g, z = S[i+2]*g;
      const c = isBody ? t.cls[i/3] : 0, sx = Math.sign(x) || 1, ax = Math.abs(x);
      const armT = () => { // рука: длина вдоль руки, толщина поперёк, сдвиг плеча
        const rel = [ax - J[0], y - J[1], z], al = rel[0]*dir[0] + rel[1]*dir[1], pr = [rel[0] - al*dir[0], rel[1] - al*dir[1], rel[2]];
        const k = al > 0 ? 1 + (kArm - 1)*ss(0, armR*2, al) : 1;
        return [sx*(J[0] + shoulderDx + al*k*dir[0] + pr[0]*thick), J[1] + al*k*dir[1] + pr[1]*thick, pr[2]*thick];
      };
      const torsoT = () => {
        if (y > a.chin*g - 2) { const w = ss(a.chin*g - 2, a.chin*g + 2, y), hx = headC[0] + (x - headC[0])*kHead, hy = headC[1] + (y - headC[1])*kHead, hz = headC[2] + (z - headC[2])*kHead;
          const r = R.neck; return [(x*r)*(1 - w) + hx*w, y*(1 - w) + hy*w, (z*r)*(1 - w) + hz*w]; }
        const r = lerpTable(rTab, y); return [x*r, y, z*r];
      };
      if (c === 2) { // нога: непрерывно переходит в таз у паха
        const r = lerpTable(legTab, y), cxL = a.ankleX*g, hf = 1 + (R.hips - 1)*ss(0, crotch0, y);
        let nx = cxL*hf + (ax - cxL)*r, nz = z*r;
        if (y < 0.06*H) { const fz0 = a.footZ0*g, ank = fz0 + a.footLen*g*0.18; nz = ank + (nz - ank)*kFoot; nx = cxL*hf + (nx - cxL*hf)*Math.sqrt(kFoot); }
        x = sx*nx; z = nz; y = mapY(y);
      } else {
        // вес руки: 1 на руке ниже подмышки, плавно убывает к плечу и шее
        let wA = 0;
        if (c === 1 && y <= armpitG) wA = 1;
        else if (isBody && y > armpitG - 1) wA = ss(J[0] - armR*1.3, J[0] + armR*0.3, ax)*(1 - ss(J[1] + armR*0.3, J[1] + armR*1.6, y));
        const T0 = wA < 1 ? torsoT() : null, A0 = wA > 0 ? armT() : null;
        const q = !A0 ? T0 : !T0 ? A0 : [T0[0]*(1 - wA) + A0[0]*wA, T0[1]*(1 - wA) + A0[1]*wA, T0[2]*(1 - wA) + A0[2]*wA];
        x = q[0]; y = mapY(q[1], c === 1); z = q[2];
      }
      D[i] = x; D[i+1] = y; D[i+2] = z;
    }
  });
  // рост: после масштаба головы подтягиваем верх точно к росту
  let top = -1e9; const BP = parts[bodyIndex].pos; for (let i = 1; i < BP.length; i += 3) top = Math.max(top, BP[i]);
  const ks = (H - inseam)/(top - inseam);
  for (const pp of parts) { const D = pp.pos; for (let i = 1; i < D.length; i += 3) if (D[i] > inseam) D[i] = inseam + (D[i] - inseam)*ks; }
  return { parts, bodyIndex };
}
function normals(pos, idx) {
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3;
    const ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2], vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    for (const o of [a, b, c]) { nor[o] += nx; nor[o+1] += ny; nor[o+2] += nz; }
  }
  for (let i = 0; i < nor.length; i += 3) { const l = Math.hypot(nor[i], nor[i+1], nor[i+2]) || 1; nor[i] /= l; nor[i+1] /= l; nor[i+2] /= l; }
  return nor;
}
// одинаковые точки в разных местах (швы UV) — общая нормаль, чтобы не было видно швов
function weldNormals(pos, nor) {
  const m = new Map(), key = i => Math.round(pos[i]*200) + ',' + Math.round(pos[i+1]*200) + ',' + Math.round(pos[i+2]*200);
  for (let i = 0; i < pos.length; i += 3) { const k = key(i), e = m.get(k); if (e) { e[0] += nor[i]; e[1] += nor[i+1]; e[2] += nor[i+2]; e.push(i); } else m.set(k, [nor[i], nor[i+1], nor[i+2], i]); }
  for (const e of m.values()) { const l = Math.hypot(e[0], e[1], e[2]) || 1; for (let j = 3; j < e.length; j++) { nor[e[j]] = e[0]/l; nor[e[j]+1] = e[1]/l; nor[e[j]+2] = e[2]/l; } }
  return nor;
}

function finish(t, out, M, gender, lv, mapY, inseam) {
  const a = t.an, H = M.height, g = H/REF, K = KIND, bi = out.bodyIndex, P = out.parts[bi].pos, n = P.length/3;
  const idx = t.body.idx, nor = weldNormals(P, normals(P, idx));
  const yC = mapY(lv.chest), yW = mapY(lv.waist), yHp = mapY(lv.hips), yS = mapY(a.shY*g), yK = 0.285*H, yA = 0.045*H, chin = mapY(a.chin*g), neckY = mapY(lv.neck);
  const la = 0.56*(M.sleeve - 2.5), lf = 0.44*(M.sleeve - 2.5);
  const kinds = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const y = P[i*3+1], z = P[i*3+2], c = t.cls[i];
    if (c === 1) { const fr = t.armT[i]/a.armLen; kinds[i] = fr < 0.42 ? K.ARM_UP : fr < 0.77 ? K.ARM_LO : K.HAND; }
    else if (c === 2) kinds[i] = y > yK ? K.LEG_UP : y > yA + 1 ? K.LEG_LO : K.FOOT;
    else kinds[i] = y > chin ? K.HEAD : y > neckY - 3 ? K.NECK : y > yW + 0.03*H ? K.CHEST : y > yHp + 0.02*H ? K.WAIST : z < 0 ? K.GLUTE : K.PELVIS;
  }
  // точки руки для одежды: запястье
  let wrist = null; { let best = 1e9; for (let i = 0; i < n; i++) if (kinds[i] === K.HAND && P[i*3] > 0 && P[i*3+1] > -1) { const y = P[i*3+1]; if (y > (wrist ? wrist[1] : -1)) wrist = [P[i*3], y, P[i*3+2]]; } }
  if (!wrist) wrist = [30, H*0.47, 0];
  let minX = 0; for (let i = 0; i < n; i++) minX = Math.min(minX, P[i*3]);
  const hand = [{ wrist: [-wrist[0], wrist[1], wrist[2]], palm: [minX + 6, wrist[1] - 8, 0] }, { wrist, palm: [-minX - 6, wrist[1] - 8, 0] }];
  // голова: прямоугольник лица для фото
  let hx = 0; for (let i = 0; i < n; i++) if (P[i*3+1] > chin + 4 && P[i*3+1] < chin + 12) hx = Math.max(hx, Math.abs(P[i*3]));
  const headTop = H, face = { x0: -hx*0.95, x1: hx*0.95, y0: chin - 2, y1: chin + (headTop - chin)*0.82, cz: a.headCZ*g };
  // ленты
  const tapes = [], rings = out.rings, slices = {};
  for (const k of ['neck', 'chest', 'underbust', 'waist', 'hips', 'thigh', 'head']) {
    const r = rings[k]; if (!r) continue; slices[k] = r.len;
    const pts = [], nrm = []; for (const [x, z] of r.pts) { const dx = x - r.cx, dz = z - r.cz, l = Math.hypot(dx, dz) || 1; pts.push(x, r.y, z); nrm.push(dx/l, 0, dz/l); }
    tapes.push({ key: k, pts, nrm, closed: true, anchor: 'right', w: k === 'neck' || k === 'head' ? 1.3 : 1.8 });
  }
  const smooth = P3 => P3.map((p, i) => { if (i === 0 || i === P3.length - 1) return p; const q = [0, 0, 0]; let c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(P3.length - 1, i + 2); j++) { q[0] += P3[j][0]; q[1] += P3[j][1]; q[2] += P3[j][2]; c++; } return q.map(v => v/c); });
  const open = (key, P3, N3, anchor, w) => { if (P3.length > 1) tapes.push({ key, pts: smooth(P3).flat(), nrm: N3.flat(), closed: false, anchor, w: w || 1.8 }); };
  // плечи — задние точки на уровне плеч
  { const X = M.shoulders/2, out3 = [], on = [];
    for (let s = 0; s <= 20; s++) { const x = -X + 2*X*s/20; let bz = 1e9, by = 0; for (let i = 0; i < n; i++) if (Math.abs(P[i*3] - x) < 1 && Math.abs(P[i*3+1] - yS) < 3 && t.cls[i] !== 2) { if (P[i*3+2] < bz) { bz = P[i*3+2]; by = P[i*3+1]; } } if (bz < 1e8) { out3.push([x, yS, bz]); on.push([0, 0.3, -0.95]); } }
    open('shoulders', out3, on, 1); }
  // рукав, длина ноги, стопа — по крайним точкам
  { const pts = [], nn = []; const buckets = new Map();
    for (let i = 0; i < n; i++) if (t.cls[i] === 1 && P[i*3] > 0 && kinds[i] !== K.HAND) { const b = Math.round(t.armT[i]/2); const e = buckets.get(b); const o = P[i*3]*0.8 + P[i*3+1]*0.2; if (!e || o > e[0]) buckets.set(b, [o, i]); }
    for (const b of [...buckets.keys()].sort((p, q) => p - q)) { const i = buckets.get(b)[1]; pts.push([P[i*3], P[i*3+1], P[i*3+2]]); nn.push([nor[i*3], nor[i*3+1], nor[i*3+2]]); }
    open('sleeve', pts, nn, 0.55); }
  { const pts = [], nn = [];
    for (let y = 1; y < inseam - 1; y += 2.5) { let bx = 1e9, bi2 = -1; for (let i = 0; i < n; i++) if (t.cls[i] === 2 && P[i*3] > 0 && Math.abs(P[i*3+1] - y) < 1.2 && P[i*3] < bx) { bx = P[i*3]; bi2 = i; } if (bi2 >= 0) { pts.push([P[bi2*3], P[bi2*3+1], P[bi2*3+2]]); nn.push([-0.55, 0, 0.83]); } }
    open('inseam', pts, nn, 0.5); }
  { const pts = [], nn = [], bk = new Map();
    for (let i = 0; i < n; i++) if (t.cls[i] === 2 && P[i*3] > 0 && P[i*3+1] < 2.5) { const b = Math.round(P[i*3+2]/1.5); const e = bk.get(b); if (!e || P[i*3] > P[e*3]) bk.set(b, i); }
    for (const b of [...bk.keys()].sort((p, q) => p - q)) { const i = bk.get(b); pts.push([P[i*3], 0.9, P[i*3+2]]); nn.push([1, 0, 0]); }
    open('foot', pts, nn, 1, 1.2); }
  { const x0 = minX - 16, A = [], NA = [], B2 = [], NB = []; for (let i = 0; i <= 36; i++) { const y = H*i/36; A.push([x0, y, 0]); NA.push([0, 0, 1]); B2.push([x0, y, 0]); NB.push([1, 0, 0]); }
    open('height', A, NA, 1, 2.4); open('height', B2, NB, 1, 2.4); open('height', [[x0, H + 0.5, 0], [-2, H + 0.5, 0]], [[0, 1, 0], [0, 1, 0]], null, 3); }

  const info = { H, yS, yC, yW, yHp, yCr: inseam, yK, yA, ac: 0, bc: 0, aw: 0, bw: 0, ah: Math.max(14, (rings.hips ? rings.hips.len : 98)/6.6), bh: 12, belly: 0,
    hand, legs: [], yBelt: yW - 0.035*H, neckline: neckY - 2, sleeve: yS - 0.12*H, eyes: [], headCut: chin - 4, face, slices, tapes, M, template: true };
  const mesh = { pos: P, nor, kinds, tint: new Uint8Array(n), brow: new Uint8Array(n), ao: null, idx: t.body.idx, uv: t.body.uv };
  const extras = out.parts.filter((p, i) => i !== bi).map(p => {
    const nn2 = weldNormals(p.pos, normals(p.pos, p.src.idx));
    return { role: p.src.role, pos: p.pos, nor: nn2, uv: p.src.uv, idx: p.src.idx, image: p.src.image || null, color: p.src.color };
  });
  return { mesh, info, extras };
}

/* Простая оценка затенения складок для шаблона: по кривизне соседей */
function cavityAO(pos, nor, idx) {
  const n = pos.length/3, acc = new Float32Array(n), cnt = new Uint16Array(n);
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = idx[t+k], b = idx[t+(k+1)%3];
    const dx = pos[b*3]-pos[a*3], dy = pos[b*3+1]-pos[a*3+1], dz = pos[b*3+2]-pos[a*3+2], l = Math.hypot(dx, dy, dz) || 1;
    acc[a] += (dx*nor[a*3] + dy*nor[a*3+1] + dz*nor[a*3+2])/l; cnt[a]++;
    acc[b] -= (dx*nor[b*3] + dy*nor[b*3+1] + dz*nor[b*3+2])/l; cnt[b]++;
  }
  const ao = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const c = cnt[i] ? acc[i]/cnt[i] : 0; ao[i] = Math.round(255*Math.min(1, Math.max(0.45, 1 - Math.max(0, c)*2.2))); }
  return ao;
}

const api = { load, fit, parseOBJ, parseMTL, cavityAO, REF };
root.HumanTemplate = api;
if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
