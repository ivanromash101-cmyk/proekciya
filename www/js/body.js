/* Генератор 3D-тела человека по меркам.
 * Тело описано набором анатомических форм (кости, мышцы, жир), которые
 * плавно сливаются в одну поверхность (signed distance field), затем
 * превращаются в сетку треугольников (surface nets).
 * Единицы: сантиметры. Ось Y вверх, Z вперёд, 0 — пол между стопами.
 * Работает и в основном потоке, и в Web Worker.
 */
(function (root) {
'use strict';
const KIND = { SKIN:0, HAIR:1, CHEST:2, WAIST:3, PELVIS:4, LEG_UP:5, LEG_LO:6, FOOT:7, ARM_UP:8, ARM_LO:9, HAND:10, HEAD:11, NECK:12, BREAST:13, LIPS:14, GLUTE:15 };
const D2R = Math.PI / 180;

/* ---------- примитивы ---------- */
function rotMat(ax, ay, az) { // локальная = R * мировая; R = (Rz*Ry*Rx)^T
  const cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay),cz=Math.cos(az),sz=Math.sin(az);
  const m=[cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx, sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx, -sy, cy*sx, cy*cx];
  return [m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
}
function Builder() {
  const P = [];
  return {
    P,
    // эллипсоид; rot — углы в градусах [x,y,z]; op 1 = вычитание
    E(c, r, kind, k, rot, op) {
      const p = { t:0, op:op||0, kind, k, cx:c[0], cy:c[1], cz:c[2], rx:r[0], ry:r[1], rz:r[2], bx:c[0], by:c[1], bz:c[2], br:Math.max(r[0],r[1],r[2]) };
      if (rot && (rot[0]||rot[1]||rot[2])) p.m = rotMat(rot[0]*D2R, rot[1]*D2R, rot[2]*D2R);
      P.push(p); return p;
    },
    // конус со скруглёнными концами (кость/мышца между суставами)
    C(a, b, r1, r2, kind, k) {
      const bax=b[0]-a[0], bay=b[1]-a[1], baz=b[2]-a[2], l2=bax*bax+bay*bay+baz*baz, rr=r1-r2;
      P.push({ t:1, op:0, kind, k, ax:a[0], ay:a[1], az:a[2], bax, bay, baz, l2, rr, a2:l2-rr*rr, il2:1/l2, r1, r2,
        bx:(a[0]+b[0])/2, by:(a[1]+b[1])/2, bz:(a[2]+b[2])/2, br:Math.sqrt(l2)/2+Math.max(r1,r2) });
      return P[P.length-1];
    },
    // эллипсоид, срезанный плоскостью (волосы)
    H(c, r, n, d0, kind, k) {
      const l = Math.hypot(n[0], n[1], n[2]);
      P.push({ t:2, op:0, kind, k, cx:c[0], cy:c[1], cz:c[2], rx:r[0], ry:r[1], rz:r[2], nx:n[0]/l, ny:n[1]/l, nz:n[2]/l, d0,
        bx:c[0], by:c[1], bz:c[2], br:Math.max(r[0],r[1],r[2]) });
    }
  };
}
function sdE(p, x, y, z) {
  let qx = x-p.cx, qy = y-p.cy, qz = z-p.cz;
  if (p.m) { const m=p.m, a=qx, b=qy, c=qz; qx=m[0]*a+m[1]*b+m[2]*c; qy=m[3]*a+m[4]*b+m[5]*c; qz=m[6]*a+m[7]*b+m[8]*c; }
  const ax=qx/p.rx, ay=qy/p.ry, az=qz/p.rz, k0=Math.sqrt(ax*ax+ay*ay+az*az);
  const bx=ax/p.rx, by=ay/p.ry, bz=az/p.rz, k1=Math.sqrt(bx*bx+by*by+bz*bz);
  return k1 < 1e-9 ? -Math.min(p.rx,p.ry,p.rz) : k0*(k0-1)/k1;
}
function sdC(p, x, y, z) {
  const pax=x-p.ax, pay=y-p.ay, paz=z-p.az, yy=pax*p.bax+pay*p.bay+paz*p.baz, zz=yy-p.l2;
  const xx=pax*p.l2-p.bax*yy, xy=pay*p.l2-p.bay*yy, xz=paz*p.l2-p.baz*yy, x2=xx*xx+xy*xy+xz*xz, y2=yy*yy*p.l2, z2=zz*zz*p.l2;
  const k = Math.sign(p.rr)*p.rr*p.rr*x2;
  if (Math.sign(zz)*p.a2*z2 > k) return Math.sqrt(x2+z2)*p.il2 - p.r2;
  if (Math.sign(yy)*p.a2*y2 < k) return Math.sqrt(x2+y2)*p.il2 - p.r1;
  return (Math.sqrt(x2*p.a2*p.il2) + yy*p.rr)*p.il2 - p.r1;
}
function sd(p, x, y, z) {
  if (p.t === 1) return sdC(p, x, y, z);
  const e = sdE(p, x, y, z);
  if (p.t === 0) return e;
  return Math.max(e, (x-p.cx)*p.nx + (y-p.cy)*p.ny + (z-p.cz)*p.nz - p.d0);
}
function smin(a, b, k) { const h = Math.max(k-Math.abs(a-b), 0)/k; return Math.min(a, b) - h*h*k*0.25; }

/* ---------- ускорение: примитивы разложены по горизонтальным слоям ---------- */
const SLAB = 4;
function index(P) {
  let y0 = 1e9, y1 = -1e9;
  for (const p of P) { y0 = Math.min(y0, p.by-p.br-p.k); y1 = Math.max(y1, p.by+p.br+p.k); }
  const n = Math.ceil((y1-y0)/SLAB)+1, slabs = Array.from({length:n}, () => []);
  P.forEach((p, i) => {
    if (p.op === 3) return;
    const a = Math.max(0, Math.floor((p.by-p.br-p.k-y0)/SLAB)), b = Math.min(n-1, Math.floor((p.by+p.br+p.k-y0)/SLAB));
    for (let s = a; s <= b; s++) slabs[s].push(p);
  });
  return { P, y0, n, slabs };
}
function field(I, x, y, z) {
  let s = Math.floor((y-I.y0)/SLAB);
  if (s < 0 || s >= I.n) return Math.max(1e3, -y);
  const L = I.slabs[s];
  let d = 1e3;
  for (let i = 0; i < L.length; i++) {
    const p = L[i], dx=x-p.bx, dy=y-p.by, dz=z-p.bz, dc = Math.sqrt(dx*dx+dy*dy+dz*dz) - p.br;
    if (p.op === 1) { if (dc > p.k) continue; d = -smin(-d, sd(p,x,y,z), p.k); }
    else { if (dc > d + p.k) continue; d = smin(d, sd(p,x,y,z), p.k); }
  }
  return Math.max(d, -y); // плоская подошва
}
function kindAt(I, x, y, z) {
  let s = Math.min(I.n-1, Math.max(0, Math.floor((y-I.y0)/SLAB))), best = 1e9, id = 0;
  for (const p of I.slabs[s]) { if (p.op) continue; const d = sd(p,x,y,z); if (d < best) { best = d; id = p.kind; } }
  return id;
}

/* ---------- анатомия ---------- */
const ramanujan = (a, b) => Math.PI*(3*(a+b) - Math.sqrt((3*a+b)*(a+3*b)));
function semiFromCirc(c, ratio) { const g = 3*(1+ratio) - Math.sqrt((3+ratio)*(1+3*ratio)); return c/(Math.PI*g); }

/* Недостающие мерки — типовые значения для роста и пола */
function fillM(M, gender) {
  const f = gender === 'f', H = M.height || (f ? 166 : 178), c = M.chest || (f ? 90 : 98);
  return Object.assign({
    neck: Math.round((f ? 33 : 39)*Math.sqrt(c/(f ? 90 : 98))), underbust: Math.round(c - (f ? 15 : 10)),
    thigh: Math.round((M.hips || 98)*0.57), sleeve: Math.round(H*(f ? 0.35 : 0.354)),
    head: f ? 55 : 57, foot: Math.round(H*(f ? 0.145 : 0.149)*2)/2
  }, M);
}
function makeBody(M, gender, opt) {
  opt = opt || {};
  M = fillM(M, gender);
  const f = gender === 'f', H = M.height, K = KIND, B = Builder(), S = Object.assign({ c:1, w:1, h:1, b:1, t:1, hd:1 }, opt.scale);
  const hh = S.hd*M.head/(f ? 55.2 : 57.5);   // масштаб головы — по обхвату головы
  const hs = H/176;                       // общий масштаб головы/кистей/стоп
  const bulk = Math.pow(M.chest/(f?90:98), 0.6) * (f ? 0.86 : 1); // толщина рук и шеи

  // ключевые уровни
  const yS  = 0.818*H;                      // плечо (акромион)
  const yC  = 0.722*H;                      // грудь
  const yCr = Math.min(M.inseam, 0.5*H);    // промежность
  const yHp = yCr + 0.062*H;                // самые широкие бёдра
  const yW  = Math.max(0.618*H, yHp + 0.075*H);
  const yK  = 0.285*H, yA = 0.045*H;

  // сечения торса (эллипсы), подстраиваются калибровкой
  const rc = f ? 0.74 : 0.71, rw = f ? 0.76 : 0.80, rh = f ? 0.76 : 0.74;
  const ac = semiFromCirc((f ? M.underbust*1.02 : M.chest*0.93), rc)*S.c, bc = ac*rc;
  const aw = semiFromCirc(M.waist*0.97, rw)*S.w, bw = aw*rw;
  const ah = semiFromCirc(M.hips*0.90, rh)*S.h,  bh = ah*rh;
  // центр плечевого сустава; руки не должны врастать в торс у крупной фигуры
  const sx = Math.max(M.shoulders/2 - 4.4*bulk, ac*0.92, ac + 4.7*bulk + 2.2 - Math.sin(21*D2R)*(yS - 2 - yC));
  const belly = Math.max(0, M.waist - M.chest*0.84)*0.11;

  /* торс */
  B.E([0, yHp, -bh*0.08], [ah, 0.072*H, bh], K.PELVIS, 3);
  B.E([0, yW, belly], [aw, 0.075*H, bw], K.WAIST, 8);
  B.E([0, yC, 0], [ac, 0.088*H, bc], K.CHEST, 8);
  B.E([0, 0.782*H, -0.8], [Math.max(ac*0.9, sx*0.86), 0.05*H, bc*0.86], K.CHEST, 6);
  B.E([0, (yW+yHp)/2, bw*0.35+belly*0.6], [aw*0.82, 0.06*H, bw*0.62], K.WAIST, 6);  // низ живота
  for (const s of [-1, 1]) {
    B.E([s*aw*0.92, yW+0.01*H, -bw*0.05], [aw*0.22, 0.06*H, bw*0.6], K.WAIST, 5);    // косые мышцы
    B.E([s*ah*0.42, yHp-0.012*H, -bh*0.42], [ah*0.52, 0.062*H, bh*0.62], K.GLUTE, 4); // ягодицы
    B.E([s*ac*0.48, 0.752*H, -bc*0.62], [ac*0.44, 0.055*H, 3.2], K.CHEST, 5, [0, 0, s*-8]); // лопатки
    if (f) {
      const rb = Math.min(14, Math.max(3.2, (2.6 + (M.chest - M.underbust)*0.42)*S.b));
      B.E([s*ac*0.43, 0.712*H, bc*0.6], [rb*1.05, rb*0.95, rb*0.9], K.BREAST, 3.5, [0, s*10, 0]);
    } else {
      B.E([s*ac*0.44, 0.738*H, bc*0.55], [ac*0.48, 0.037*H, 4], K.CHEST, 4, [0, 0, s*-10]);    // грудные мышцы
    }
    B.C([s*2.5, 0.812*H, 2.8], [s*(sx-1.5), 0.822*H, 0.8], 1.3*bulk, 1.1*bulk, K.CHEST, 3);  // ключицы
  }
  // пупок
  B.E([0, 0.598*H, bw*0.98 + belly + 0.4], [0.55, 0.75, 0.9], K.WAIST, 0.6, null, 1);

  /* шея и трапеции */
  const nr = M.neck/(2*Math.PI);
  B.C([0, 0.79*H, -1.6], [0, H - 20*hh, -0.8], nr*1.05, nr*0.98, K.NECK, 5).tag = 'neck';
  if (!f) B.E([0, 0.845*H, nr*0.93 - 1.2], [0.85, 1.4, 0.9], K.NECK, 1.2);   // кадык
  for (const s of [-1, 1]) B.C([s*3.5, 0.845*H, -2.8], [s*(sx-2), yS+0.6, -1.6], 4.4*bulk, 3.6*bulk, K.NECK, 5);

  /* голова */
  const hw = (f ? 0.96 : 1)*hh, Ht = H;
  const head = { top:Ht, eyeY:Ht-11.9*hh, cz:-1.2 };
  B.E([0, Ht-10.4*hh, -1.2*hh], [7.5*hw, 10.4*hh, 9.7*hh], K.HEAD, 3);                   // череп
  B.E([0, Ht-17.4*hh, 1.6*hh], [(f?5.0:5.5)*hw, 6.0*hh, 7.5*hh], K.HEAD, 4);              // челюсть
  B.E([0, Ht-21.4*hh, 6.4*hh], [(f?1.9:2.5)*hw, 1.8*hh, 2.1*hh], K.HEAD, 3);              // подбородок
  B.E([0, Ht-10.0*hh, 7.6*hh], [5.0*hw, (f?0.6:0.9)*hh, (f?0.8:1.1)*hh], K.HEAD, 2.5);                      // надбровье
  for (const s of [-1, 1]) {
    B.E([s*4.5*hw, Ht-13.9*hh, 4.8*hh], [2.3*hw, 1.6*hh, 2.3*hh], K.HEAD, 3);           // скулы
    B.E([s*7.25*hw, Ht-12.9*hh, -0.6*hh], [1.0*hh, 3.0*hh, 1.9*hh], K.HEAD, 1, [0, s*-20, 0]); // уши
      }
  if (!opt.face) {
    for (const s of [-1, 1]) {
      B.E([s*3.25*hw, head.eyeY, 7.95*hh], [1.6*hh, 0.66*hh, 1.25*hh], K.HEAD, 0.9, [0, 0, s*-6], 1); // разрез глаз
      B.E([s*3.2*hw, head.eyeY + 0.95*hh, 7.6*hh], [1.9*hh, 0.6*hh, 1.2*hh], K.HEAD, 1.4, null, 1);   // складка века
      B.E([s*3.3*hw, head.eyeY + 1.75*hh, 8.0*hh], [1.95*hh, 0.36*hh, 1.6*hh], K.HAIR, 1, [0, 0, s*-7], 3); // брови (только цвет)
      B.E([s*3.25*hw, head.eyeY + 0.78*hh, 7.2*hh], [1.5*hh, 0.42*hh, 1.08*hh], K.HEAD, 0.45, [0, 0, s*-6]); // верхнее веко
    }
    const nz = f ? 0.88 : 1;
    B.C([0, Ht-11.7*hh, 8.0*hh], [0, Ht-15.2*hh, (8.9+1.3*nz)*hh], 0.78*hh*nz, 1.05*hh*nz, K.HEAD, 1.4);   // спинка носа
    B.E([0, Ht-15.5*hh, (8.8+1.2*nz)*hh], [1.15*hh*nz, 1.0*hh*nz, 1.05*hh*nz], K.HEAD, 1);                  // кончик носа
    for (const s of [-1, 1]) B.E([s*1.35*hh, Ht-16.0*hh, 9.0*hh], [0.95*hh, 0.8*hh, 0.9*hh], K.HEAD, 0.8); // крылья носа
    B.E([0, Ht-17.95*hh, 8.65*hh], [(f?2.15:2.25)*hh, (f?0.55:0.47)*hh, 0.7*hh], K.LIPS, 0.9);  // верхняя губа
    B.E([0, Ht-18.85*hh, 8.45*hh], [(f?1.95:2.0)*hh, (f?0.62:0.55)*hh, 0.72*hh], K.LIPS, 0.9);     // нижняя губа
  }
  // волосы
  if (f) {
    B.H([0, Ht-9.8*hh, -1.6*hh], [8.2*hw, 11.2*hh, 10.6*hh], [0, -0.55, 0.85], 2.0*hh, K.HAIR, 1.5);
    B.H([0, Ht-21*hh, -4.6*hh], [9.0*hw, 15*hh, 6.4*hh], [0, 0, 1], 1.2*hh, K.HAIR, 3);
    for (const s of [-1, 1]) B.E([s*7.4*hw, Ht-17.5*hh, -1.2*hh], [2.0*hh, 10*hh, 4.6*hh], K.HAIR, 3);
  } else {
    B.H([0, Ht-10.0*hh, -1.4*hh], [7.95*hw, 10.9*hh, 10.25*hh], [0, -0.6, 0.8], 1.6*hh, K.HAIR, 1.2);
  }

  /* руки (A-поза) */
  const la = (M.sleeve - 2.5)*0.56, lf = (M.sleeve - 2.5)*0.44, a1 = 21*D2R, a2 = 25*D2R, a3 = 18*D2R;
  const hand = [];
  for (const s of [-1, 1]) {
    const sh = [s*sx, yS-2, -0.6];
    const el = [sh[0] + s*Math.sin(a1)*la, sh[1] - Math.cos(a1)*la, -1.8];
    const wr = [el[0] + s*Math.sin(a2)*lf, el[1] - Math.cos(a2)*lf, 1.8];
    const at = (A, Bp, t) => [A[0]+(Bp[0]-A[0])*t, A[1]+(Bp[1]-A[1])*t, A[2]+(Bp[2]-A[2])*t];
    const g1 = s*21, g2 = s*25, g3 = s*18;
    B.E([s*(sx+0.2), yS-3.2, -0.2], [4.7*bulk, 6.4*bulk, 5.0*bulk], K.ARM_UP, 5, [0, 0, g1]);       // дельта
    B.C(sh, el, 4.7*bulk, 3.4*bulk, K.ARM_UP, 3);
    B.E(at(sh, el, 0.5).map((v,i)=>i===2?v+1.4:v), [3.0*bulk, 0.06*H, 3.2*bulk], K.ARM_UP, 4.5, [0, 0, g1]);   // бицепс
    B.E(at(sh, el, 0.45).map((v,i)=>i===2?v-1.6:v), [3.1*bulk, 0.065*H, 3.0*bulk], K.ARM_UP, 4.5, [0, 0, g1]);  // трицепс
    B.E(el.map((v,i)=>i===2?v-1.2:v), [1.8, 2.0, 1.6], K.ARM_LO, 3);                                         // локоть
    B.C(el, wr, 3.5*bulk, 2.3*bulk, K.ARM_LO, 2.5);
    B.E(at(el, wr, 0.27).map((v,i)=>i===2?v+0.8:v), [3.4*bulk, 0.05*H, 3.2*bulk], K.ARM_LO, 4, [0, 0, g2]); // предплечье
    // кисть: ладонь смотрит к бедру, большой палец вперёд
    const hsz = hs*(f ? 0.92 : 1), dir = [s*Math.sin(a3), -Math.cos(a3), 0];
    const pc = [wr[0]+dir[0]*4.6*hsz, wr[1]+dir[1]*4.6*hsz, wr[2]+0.4];
    B.C(wr, pc, 2.4*hsz, 2.6*hsz, K.HAND, 1.6);
    B.E(pc, [1.35*hsz, 4.6*hsz, 4.1*hsz], K.HAND, 1.6, [0, 0, g3]);
    const fl = [3.9, 4.4, 4.1, 3.3], fz = [2.7, 0.9, -0.9, -2.6];
    for (let i = 0; i < 4; i++) {
      const base = [pc[0]+dir[0]*4.2*hsz, pc[1]+dir[1]*4.2*hsz, pc[2]+fz[i]*hsz];
      const l1 = fl[i]*hsz*0.56, l2 = fl[i]*hsz*0.5, curl = -s*0.22;
      const mid = [base[0]+dir[0]*l1 + curl*l1*0.3, base[1]+dir[1]*l1, base[2]];
      const tip = [mid[0]+dir[0]*l2 + curl*l2*0.9, mid[1]+dir[1]*l2*0.95, base[2]];
      B.C(base, mid, 0.88*hsz, 0.78*hsz, K.HAND, 0.6);
      B.C(mid, tip, 0.76*hsz, 0.62*hsz, K.HAND, 0.5);
    }
    const tb = [wr[0]+dir[0]*2.2*hsz - s*0.4, wr[1]+dir[1]*2.2*hsz, wr[2]+3.2*hsz];
    const tm = [tb[0]+dir[0]*3*hsz - s*0.6, tb[1]+dir[1]*3*hsz, tb[2]+2.0*hsz];
    const tt = [tm[0]+dir[0]*2.6*hsz - s*0.9, tm[1]+dir[1]*2.6*hsz, tm[2]+0.9*hsz];
    B.C(tb, tm, 1.15*hsz, 0.95*hsz, K.HAND, 1.0);
    B.C(tm, tt, 0.9*hsz, 0.72*hsz, K.HAND, 0.6);
    hand.push({ wrist: wr, palm: pc, dir, shoulder: sh, elbow: el });
  }

  /* ноги */
  const rt = M.thigh/(2*Math.PI)*0.88*S.t, hx = Math.max(ah - rt*0.92, rt*0.86, ah*0.5), rk = Math.min(rt*0.58 + 0.7, rt*0.85);
  const foot = M.foot/27, legs = [];
  for (const s of [-1, 1]) {
    const hip = [s*hx, yHp - 0.018*H, 0], kn = [s*hx*0.74, yK, 0.9], an = [s*hx*0.68, yA + 1.5, -1.2];
    legs.push({ hip, knee: kn, ankle: an, toe: [an[0] + s*1.9, 1.6*foot, 15.2*foot] });
    const n0 = B.P.length;
    B.C(hip, kn, rt, rk, K.LEG_UP, 3);
    B.E([s*hx*0.92, yHp - 0.115*H, rt*0.38], [rt*0.8, 0.095*H, rt*0.62], K.LEG_UP, 4);              // квадрицепс
    B.E([s*hx*0.58, yHp - 0.07*H, -0.5], [rt*0.62, 0.075*H, rt*0.72], K.LEG_UP, 4);                // внутренняя поверхность
    B.E([s*hx*0.95, yHp - 0.12*H, -rt*0.4], [rt*0.75, 0.09*H, rt*0.55], K.LEG_UP, 4);              // задняя поверхность
    B.E([kn[0], yK + 0.8, rk*0.82], [2.0*hs, 2.4*hs, 1.2*hs], K.LEG_LO, 3);                       // надколенник
    B.C(kn, an, rk*0.86, 2.7*hs, K.LEG_LO, 2.5);
    B.E([kn[0] + s*0.4, 0.222*H, -2.6], [rk*0.88, 0.068*H, rk*0.82], K.LEG_LO, 3.5);               // икра
    for (const t of [-1, 1]) B.E([an[0] + t*2.2*hs, yA + 1.2, -1.4], [0.9, 1.1, 1.1], K.FOOT, 1);  // косточки
    // стопа: пятка, свод, пальцы
    B.E([an[0], 3.2*foot, -4.6*foot], [3.0*foot, 3.3*foot, 3.6*foot], K.FOOT, 2);
    B.E([an[0] + s*0.9, 3.0*foot, 4.5*foot], [4.0*foot, 2.9*foot, 9.5*foot], K.FOOT, 2.5, [0, s*-6, 0]);
    B.E([an[0] + s*1.9, 1.6*foot, 15.2*foot], [4.4*foot, 1.6*foot, 3.6*foot], K.FOOT, 2, [0, s*-8, 0]);
    for (let i = n0; i < B.P.length; i++) B.P[i].side = s;
  }

  const info = { H, yS, yC, yW, yHp, yCr, yK, yA, ac, bc, aw, bw, ah, bh, belly, hand, legs, hx, sx, hh, foot, M, nose: [0, Ht-15.5*hh, 10*hh],
    yBelt: yW - 0.035*H, neckline: 0.79*H, sleeve: yS - 0.42*la*Math.cos(a1),
    eyes: opt.face ? [] : [-1, 1].map(s => ({ x: s*3.25*hw, y: head.eyeY, z: 6.85*hh, r: 1.2*hh })),
    headCut: Ht - 26*hh,
    face: { x0: -6.8*hw, x1: 6.8*hw, y0: Ht-23.4*hh, y1: Ht-4.6*hh, cz: 1 } };
  return { P: B.P, info };
}

/* ---------- обхват: срез поля на высоте y ---------- */
function slice(I, y, cz, n, cx) {
  n = n || 72; cx = cx || 0;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i/n*Math.PI*2, dx = Math.sin(a), dz = Math.cos(a);
    let lo = 0, hi = 0.5;
    while (hi < 60 && field(I, cx + dx*hi, y, cz + dz*hi) < 0) { lo = hi; hi += 0.5; }
    for (let k = 0; k < 18; k++) { const m = (lo+hi)/2; if (field(I, cx + dx*m, y, cz + dz*m) < 0) lo = m; else hi = m; }
    pts.push([cx + dx*hi, cz + dz*hi]);
  }
  let L = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i+1)%n]; L += Math.hypot(a[0]-b[0], a[1]-b[1]); }
  return { pts, len: L, y, cx, cz };
}

/* Строит тело так, чтобы все обхваты на модели совпали с мерками. */
function legAxis(inf, y) { // ось левой ноги на высоте y
  const L = inf.legs[1], pts = [L.hip, L.knee, L.ankle];
  if (y >= L.hip[1]) return L.hip;
  for (let i = 0; i < 2; i++) { const A = pts[i], B2 = pts[i+1]; if (y <= A[1] && y >= B2[1]) { const t = (A[1]-y)/(A[1]-B2[1]); return [A[0]+(B2[0]-A[0])*t, y, A[2]+(B2[2]-A[2])*t]; } }
  return [L.ankle[0], y, L.ankle[2]];
}
function measureAll(P, inf, gender, n) {
  const K = KIND, f = gender === 'f', H = inf.H;
  const T = index(P.filter(p => p.kind !== K.ARM_UP && p.kind !== K.ARM_LO && p.kind !== K.HAND));
  const Leg = index(P.filter(p => p.side === 1));
  const Hd = index(P.filter(p => p.kind === K.HEAD || p.kind === K.HAIR));
  const yTh = inf.yCr - 4, la = legAxis(inf, yTh);
  const r = {
    chest: slice(T, inf.yC, 0, n), waist: slice(T, inf.yW, inf.belly*0.5, n), hips: slice(T, inf.yHp, -inf.bh*0.15, n),
    thigh: slice(Leg, yTh, la[2], n, la[0]),
    head: slice(Hd, H - 6.6*inf.hh, -1.3*inf.hh, n),
    neck: slice(index(P.filter(p => p.tag === 'neck')), 0.862*H, -1.2, n)
  };
  if (f) r.underbust = slice(index(P.filter(p => p.kind !== K.ARM_UP && p.kind !== K.ARM_LO && p.kind !== K.HAND && p.kind !== K.BREAST)), inf.yC - 0.052*H, 0, n);
  return { r, T, Leg };
}
const calCache = new Map(), lastS = {};
function makeCalibrated(M, gender, face) {
  const f = gender === 'f';
  M = fillM(M, gender);
  const key = JSON.stringify([M, gender]);
  // готовый подбор для тех же мерок; иначе начинаем с прошлого — сходится за 1–2 шага
  let S = calCache.get(key) || Object.assign({}, lastS[gender] || { c:1, w:1, h:1, b:1, t:1, hd:1 }), out, I, m;
  for (let it = 0; it < 8; it++) {
    out = makeBody(M, gender, { face, scale: S });
    if (calCache.has(key)) break;
    m = measureAll(out.P, out.info, gender, 36);
    const r = m.r, q = k => M[k]/r[k].len;
    const err = Math.max(...['chest', 'waist', 'hips', 'thigh', 'head'].concat(f ? ['underbust'] : []).map(k => Math.abs(r[k].len - M[k])));
    if (err < 0.6) break;
    S = { c: S.c*(f ? q('underbust') : q('chest')), w: S.w*q('waist'), h: S.h*q('hips'), t: S.t*q('thigh'), hd: S.hd*q('head'),
      b: f ? Math.min(3, Math.max(0.3, S.b*Math.pow(q('chest'), 1.7))) : 1 };
  }
  calCache.set(key, S); lastS[gender] = S; if (calCache.size > 20) calCache.delete(calCache.keys().next().value);
  I = index(out.P);
  m = measureAll(out.P, out.info, gender, 72);
  out.info.slices = m.r;
  out.info.tapes = makeTapes(I, m, out.info, M, gender);
  out.I = I;
  return out;
}

/* ---------- контуры сантиметровых лент для каждой мерки ---------- */
function rayOut(I, o, d, max) { // из точки внутри тела наружу до поверхности
  if (field(I, o[0], o[1], o[2]) >= 0) return null;
  let lo = 0, hi = 0.4;
  while (hi < max && field(I, o[0]+d[0]*hi, o[1]+d[1]*hi, o[2]+d[2]*hi) < 0) { lo = hi; hi += 0.4; }
  if (hi >= max) return null;
  for (let k = 0; k < 16; k++) { const t = (lo+hi)/2; if (field(I, o[0]+d[0]*t, o[1]+d[1]*t, o[2]+d[2]*t) < 0) lo = t; else hi = t; }
  return [o[0]+d[0]*hi, o[1]+d[1]*hi, o[2]+d[2]*hi];
}
function rayIn(I, o, d, max) { // из точки снаружи до первого касания тела
  let lo = 0, hi = 0.4;
  while (hi < max && field(I, o[0]+d[0]*hi, o[1]+d[1]*hi, o[2]+d[2]*hi) >= 0) { lo = hi; hi += 0.4; }
  if (hi >= max) return null;
  for (let k = 0; k < 16; k++) { const t = (lo+hi)/2; if (field(I, o[0]+d[0]*t, o[1]+d[1]*t, o[2]+d[2]*t) >= 0) lo = t; else hi = t; }
  return [o[0]+d[0]*hi, o[1]+d[1]*hi, o[2]+d[2]*hi];
}
function makeTapes(I, m, inf, M, gender) {
  const H = inf.H, tapes = [];
  const ring = (key, s) => { const pts = [], nrm = []; for (const [x, z] of s.pts) { const dx = x - s.cx, dz = z - s.cz, l = Math.hypot(dx, dz) || 1; pts.push(x, s.y, z); nrm.push(dx/l, 0, dz/l); }
    tapes.push({ key, pts, nrm, closed: true, anchor: 'right', w: key === 'neck' || key === 'head' ? 1.3 : 1.8 }); };
  for (const k of ['neck', 'chest', 'underbust', 'waist', 'hips', 'thigh', 'head']) if (m.r[k]) ring(k, m.r[k]);
  const open = (key, P3, N3, anchor, w) => { if (P3.length < 2) return; tapes.push({ key, pts: P3.flat(), nrm: N3.flat(), closed: false, anchor, w: w || 1.8 }); };
  // плечи: по спине от плеча до плеча
  { const X = M.shoulders/2, P3 = [], N3 = [];
    for (let i = 0; i <= 24; i++) { const x = -X + 2*X*i/24, y = inf.yS + 1.0 + 1.4*(1 - (x/X)**2), p = rayIn(I, [x, y, -40], [0, 0, 1], 60); if (p) { P3.push(p); N3.push([0, 0.3, -0.95]); } }
    open('shoulders', P3, N3, 1); }
  // рукав: от плеча по внешней стороне руки до запястья (левая рука)
  { const h = inf.hand[1], P3 = [], N3 = [], segs = [[h.shoulder, h.elbow], [h.elbow, h.wrist]];
    const top = rayIn(I, [h.shoulder[0] + 1.5, inf.yS + 12, h.shoulder[2]], [0, -1, 0], 30); if (top) { P3.push(top); N3.push([0, 1, 0]); }
    segs.forEach(([A, B2], si) => { const dx = B2[0]-A[0], dy = B2[1]-A[1], l = Math.hypot(dx, dy), n = [-dy/l, dx/l, 0];
      if (n[0] < 0) { n[0] = -n[0]; n[1] = -n[1]; }
      for (let i = si ? 1 : 0; i <= 10; i++) { const t = i/10, o = [A[0]+(B2[0]-A[0])*t, A[1]+(B2[1]-A[1])*t, A[2]+(B2[2]-A[2])*t]; const p = rayOut(I, o, n, 20); if (p) { P3.push(p); N3.push(n); } } });
    open('sleeve', P3, N3, 0.55); }
  // длина ноги: по внутренней стороне левой ноги от пола до паха
  { const P3 = [], N3 = [];
    for (let y = 0.6; y <= inf.yCr - 0.6; y += 2.5) { const a = legAxis(inf, Math.max(y, inf.yA + 1.5)), p = rayOut(m.Leg, [a[0], y, a[2]], [-1, 0, 0], 25); if (p) { P3.push(p); N3.push([-0.55, 0, 0.83]); } }
    open('inseam', P3, N3, 0.5); }
  // стопа: по внешнему краю левой стопы от пятки до носка
  { const L = inf.legs[1], cx = L.ankle[0] + 0.9*inf.foot, P3 = [], N3 = [];
    const heel = rayOut(m.Leg, [cx, 2.2, 0], [0, 0, -1], 30), toe = rayOut(m.Leg, [cx + 1, 1.4, 6], [0, 0, 1], 30);
    if (heel && toe) for (let i = 0; i <= 14; i++) { const z = heel[2] + (toe[2] - heel[2])*i/14, p = rayOut(m.Leg, [cx + (i > 9 ? 1 : 0), 1.0, Math.min(Math.max(z, heel[2] + 0.6), toe[2] - 0.6)], [1, 0, 0], 15); if (p) { P3.push([p[0], 0.9, z]); N3.push([1, 0, 0]); } }
    open('foot', P3, N3, 1, 1.2); }
  // рост: ростомер сбоку — две полосы крестом и планка над головой
  { const x0 = inf.hand[0].palm[0] - 16, P3 = [], N3 = [], P4 = [], N4 = [];
    for (let i = 0; i <= 36; i++) { const y = H*i/36; P3.push([x0, y, 0]); N3.push([0, 0, 1]); P4.push([x0, y, 0]); N4.push([1, 0, 0]); }
    open('height', P3, N3, 1, 2.4); open('height', P4, N4, 1, 2.4);
    open('height', [[x0, H + 0.5, 0], [-2, H + 0.5, 0]], [[0, 1, 0], [0, 1, 0]], null, 3); }
  return tapes;
}

/* ---------- surface nets ---------- */
const cubeEdges = new Int32Array(24), edgeTable = new Int32Array(256);
(function () {
  let k = 0;
  for (let i = 0; i < 8; ++i) for (let j = 1; j <= 4; j <<= 1) { const p = i^j; if (i <= p) { cubeEdges[k++] = i; cubeEdges[k++] = p; } }
  for (let i = 0; i < 256; ++i) { let em = 0; for (let j = 0; j < 24; j += 2) { const a = !!(i & (1<<cubeEdges[j])), b = !!(i & (1<<cubeEdges[j+1])); em |= a !== b ? (1 << (j>>1)) : 0; } edgeTable[i] = em; }
})();
function surfaceNets(data, dims) {
  const pos = [], faces = [], x = [0,0,0], R = [1, dims[0]+1, (dims[0]+1)*(dims[1]+1)], grid = new Float32Array(8);
  const buf = new Int32Array(R[2]*2);
  let n = 0, bufNo = 1;
  for (x[2] = 0; x[2] < dims[2]-1; ++x[2], n += dims[0], bufNo ^= 1, R[2] = -R[2]) {
    let m = 1 + (dims[0]+1)*(1 + bufNo*(dims[1]+1));
    for (x[1] = 0; x[1] < dims[1]-1; ++x[1], ++n, m += 2)
    for (x[0] = 0; x[0] < dims[0]-1; ++x[0], ++n, ++m) {
      let mask = 0, g = 0, idx = n;
      for (let k = 0; k < 2; ++k, idx += dims[0]*(dims[1]-2))
      for (let j = 0; j < 2; ++j, idx += dims[0]-2)
      for (let i = 0; i < 2; ++i, ++g, ++idx) { const p = data[idx]; grid[g] = p; mask |= (p < 0) ? (1<<g) : 0; }
      if (mask === 0 || mask === 0xff) continue;
      const em = edgeTable[mask]; let vx = 0, vy = 0, vz = 0, ec = 0;
      for (let i = 0; i < 12; ++i) {
        if (!(em & (1<<i))) continue;
        const e0 = cubeEdges[i<<1], e1 = cubeEdges[(i<<1)+1], g0 = grid[e0], g1 = grid[e1];
        let t = g0 - g1; if (Math.abs(t) < 1e-9) continue; t = g0/t; ++ec;
        vx += (e0&1) !== (e1&1) ? ((e0&1) ? 1-t : t) : (e0&1);
        vy += (e0&2) !== (e1&2) ? ((e0&2) ? 1-t : t) : ((e0&2) ? 1 : 0);
        vz += (e0&4) !== (e1&4) ? ((e0&4) ? 1-t : t) : ((e0&4) ? 1 : 0);
      }
      const s = 1/ec;
      buf[m] = pos.length/3; pos.push(x[0]+vx*s, x[1]+vy*s, x[2]+vz*s);
      for (let i = 0; i < 3; ++i) {
        if (!(em & (1<<i))) continue;
        const iu = (i+1)%3, iv = (i+2)%3; if (x[iu] === 0 || x[iv] === 0) continue;
        const du = R[iu], dv = R[iv];
        if (mask & 1) faces.push(buf[m], buf[m-du], buf[m-du-dv], buf[m-dv]);
        else faces.push(buf[m], buf[m-dv], buf[m-du-dv], buf[m-du]);
      }
    }
  }
  return { pos, faces };
}

/* Сетка: разреженная выборка поля (считаем точно только возле поверхности). */
function mesh(I, cell, box) {
  let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
  for (const p of I.P) { if (p.op) continue; const c = [p.bx,p.by,p.bz]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], c[i]-p.br); mx[i] = Math.max(mx[i], c[i]+p.br); } }
  for (let i = 0; i < 3; i++) { mn[i] -= cell*2; mx[i] += cell*2; }
  if (box) for (let i = 0; i < 3; i++) { mn[i] = Math.max(mn[i], box[0][i]); mx[i] = Math.min(mx[i], box[1][i]); }
  mn[1] = Math.max(mn[1], -cell*2);
  const nx = Math.ceil((mx[0]-mn[0])/cell)+1, ny = Math.ceil((mx[1]-mn[1])/cell)+1, nz = Math.ceil((mx[2]-mn[2])/cell)+1;
  const data = new Float32Array(nx*ny*nz), BS = 6, half = Math.sqrt(3)*BS*cell/2;
  for (let bz = 0; bz < nz; bz += BS) for (let by = 0; by < ny; by += BS) for (let bx = 0; bx < nx; bx += BS) {
    const ex = Math.min(nx, bx+BS), ey = Math.min(ny, by+BS), ez = Math.min(nz, bz+BS);
    const cx = mn[0] + (bx+ex-1)/2*cell, cy = mn[1] + (by+ey-1)/2*cell, cz = mn[2] + (bz+ez-1)/2*cell;
    const dc = field(I, cx, cy, cz), far = Math.abs(dc) > half*1.6 + 1.5;
    for (let z = bz; z < ez; z++) for (let y = by; y < ey; y++) {
      let i = z*nx*ny + y*nx + bx;
      for (let x = bx; x < ex; x++, i++) data[i] = far ? dc : field(I, mn[0]+x*cell, mn[1]+y*cell, mn[2]+z*cell);
    }
  }
  const sn = surfaceNets(data, [nx, ny, nz]);
  const N = sn.pos.length/3, pos = new Float32Array(N*3), nor = new Float32Array(N*3), kinds = new Uint8Array(N), tint = new Uint8Array(N), brow = new Uint8Array(N), ao = new Uint8Array(N), e = cell*0.5;
  const lips = I.P.filter(p => p.kind === KIND.LIPS), brows = I.P.filter(p => p.op === 3);
  for (let j = 0; j < N; j++) {
    const x = mn[0]+sn.pos[j*3]*cell, y = mn[1]+sn.pos[j*3+1]*cell, z = mn[2]+sn.pos[j*3+2]*cell;
    pos[j*3] = x; pos[j*3+1] = y; pos[j*3+2] = z;
    const gx = field(I,x+e,y,z)-field(I,x-e,y,z), gy = field(I,x,y+e,z)-field(I,x,y-e,z), gz = field(I,x,y,z+e)-field(I,x,y,z-e);
    const l = Math.hypot(gx, gy, gz) || 1, nx = gx/l, ny = gy/l, nz = gz/l; nor[j*3] = nx; nor[j*3+1] = ny; nor[j*3+2] = nz;
    // мягкие тени в складках и подмышках: насколько близко другие части тела вдоль нормали
    let occ = 0, wsum = 0;
    for (let q = 0, d = 1.0; q < 4; q++, d *= 2.1) { const fd = field(I, x + nx*d, y + ny*d, z + nz*d), w = 1/(q + 1); occ += w*Math.max(0, (d - Math.max(0, fd))/d); wsum += w; }
    ao[j] = Math.round(255*Math.max(0.3, 1 - 1.25*occ/wsum));
    let k = kindAt(I, x, y, z);
    if (lips.length) { // мягкий переход цвета губ
      let dl = 1e9; for (const p of lips) dl = Math.min(dl, sd(p, x, y, z));
      const w = Math.min(1, Math.max(0, (0.45 - dl)/0.55)); tint[j] = Math.round(w*w*(3-2*w)*255);
      if (k === KIND.LIPS) k = KIND.HEAD;
    }
    if (brows.length && y > brows[0].cy - 3) {
      let db = 1e9; for (const p of brows) db = Math.min(db, sd(p, x, y, z));
      const w = Math.min(1, Math.max(0, (0.25 - db)/0.5)); brow[j] = Math.round(w*w*(3-2*w)*255);
    }
    kinds[j] = k;
  }
  const F = sn.faces, idx = new Uint32Array(F.length/4*6);
  let k = 0;
  for (let q = 0; q < F.length; q += 4) {
    // делим четырёхугольник по короткой диагонали
    const a=F[q], b=F[q+1], c=F[q+2], d=F[q+3];
    const dac = (pos[a*3]-pos[c*3])**2+(pos[a*3+1]-pos[c*3+1])**2+(pos[a*3+2]-pos[c*3+2])**2;
    const dbd = (pos[b*3]-pos[d*3])**2+(pos[b*3+1]-pos[d*3+1])**2+(pos[b*3+2]-pos[d*3+2])**2;
    if (dac <= dbd) { idx[k++]=a; idx[k++]=b; idx[k++]=c; idx[k++]=a; idx[k++]=c; idx[k++]=d; }
    else { idx[k++]=a; idx[k++]=b; idx[k++]=d; idx[k++]=b; idx[k++]=c; idx[k++]=d; }
  }
  return { pos, nor, kinds, tint, brow, ao, idx };
}

/* Склеивает части сетки; keep(x,y,z) решает, какие треугольники оставить */
function merge(parts) {
  let nv = 0, ni = 0;
  const kept = parts.map(({ m, keep }) => {
    const P = m.pos, I = m.idx, out = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t]*3, b = I[t+1]*3, c = I[t+2]*3;
      if (keep((P[a]+P[b]+P[c])/3, (P[a+1]+P[b+1]+P[c+1])/3, (P[a+2]+P[b+2]+P[c+2])/3)) out.push(I[t], I[t+1], I[t+2]);
    }
    nv += P.length/3; ni += out.length; return out;
  });
  const pos = new Float32Array(nv*3), nor = new Float32Array(nv*3), kinds = new Uint8Array(nv), tint = new Uint8Array(nv), brow = new Uint8Array(nv), ao = new Uint8Array(nv), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  parts.forEach(({ m }, k) => {
    pos.set(m.pos, ov*3); nor.set(m.nor, ov*3); kinds.set(m.kinds, ov); tint.set(m.tint, ov); brow.set(m.brow, ov); ao.set(m.ao, ov);
    for (const v of kept[k]) idx[oi++] = v + ov;
    ov += m.pos.length/3;
  });
  return { pos, nor, kinds, tint, brow, ao, idx };
}

/* Главная функция: мерки → сетка + сведения о фигуре.
 * Тело строится с шагом cell, голова и кисти — вдвое мельче (видны черты лица и пальцы).
 * Части перекрываются на 1–2 см, поэтому шва не видно. */
function buildHuman(M, gender, face, cell) {
  cell = cell || 0.9;
  const b = makeCalibrated(M, gender, !!face), inf = b.info, fine = Math.max(0.4, cell*0.5);
  const cut = inf.headCut, side = (h, x, y, z) => (x-h.wrist[0])*h.dir[0] + (y-h.wrist[1])*h.dir[1] + (z-h.wrist[2])*h.dir[2];
  const inHand = (h, x, y, z) => Math.abs(x-h.palm[0]) < 13 && Math.abs(y-h.palm[1]) < 13 && Math.abs(z-h.palm[2]) < 13;
  const parts = [{ m: mesh(b.I, cell), keep: (x, y, z) => y < cut + 1.2 && !inf.hand.some(h => inHand(h, x, y, z) && side(h, x, y, z) > 1.5) }];
  if (cell > 0.5) {
    parts.push({ m: mesh(b.I, fine, [[-14, cut - 1, -16], [14, inf.H + 2, 16]]), keep: (x, y) => y >= cut - 0.6 });
    for (const h of inf.hand) {
      const c = h.palm, box = [[c[0]-11, c[1]-13, c[2]-10], [c[0]+11, c[1]+9, c[2]+11]];
      parts.push({ m: mesh(b.I, fine, box), keep: (x, y, z) => side(h, x, y, z) >= 0 });
    }
  } else parts[0].keep = () => true;
  const m = merge(parts);
  const lens = {}; for (const k in inf.slices) lens[k] = inf.slices[k].len;
  const info = Object.assign({}, inf, { slices: lens });
  return { mesh: m, info };
}

const api = { KIND, buildHuman, makeBody, makeCalibrated, index, field, slice, mesh, fillM };
root.HumanBody = api;
if (typeof module !== 'undefined') module.exports = api;

// Web Worker: { M, gender, face, cell, id } → { id, mesh, info }
if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
  root.onmessage = e => {
    const { M, gender, face, cell, id } = e.data;
    try {
      const r = buildHuman(M, gender, face, cell);
      const m = r.mesh;
      root.postMessage({ id, mesh: m, info: r.info }, [m.pos.buffer, m.nor.buffer, m.kinds.buffer, m.tint.buffer, m.brow.buffer, m.ao.buffer, m.idx.buffer]);
    } catch (err) { root.postMessage({ id, error: String(err && err.message || err) }); }
  };
}
})(typeof self !== 'undefined' ? self : this);
