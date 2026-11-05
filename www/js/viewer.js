/* 3D-просмотр на чистом WebGL: тело, глаза, лицо с фото, сантиметровые ленты,
 * пол с мягкой тенью, режим голограммы. Без внешних библиотек — работает офлайн. */
(function (root) {
'use strict';

const VS_BODY = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUv; attribute vec3 aMat;
uniform mat4 uVP; uniform mat4 uM;
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying vec2 vUv; varying vec3 vMat;
void main(){ vec4 w = uM*vec4(aPos,1.); vW = w.xyz; vN = mat3(uM)*aNor; vC = aCol; vUv = aUv; vMat = aMat; gl_Position = uVP*w; }`;

const FS_BODY = `
precision highp float;
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying vec2 vUv; varying vec3 vMat; // vMat: x — затенение, y — волосы, z — ткань
uniform vec3 uCam; uniform float uMode; uniform float uTime; uniform float uTex; uniform sampler2D uMap;
uniform float uWrap; uniform float uSpec; uniform float uAlpha; uniform vec3 uTint; uniform float uCut;
uniform float uUOn; uniform vec4 uUB; uniform vec3 uUC; // бельё по высоте, попиксельно: uUB — низ/верх топа, низ/верх трусов
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 tone(vec3 c){ c *= 1.05; return pow(c/(c+vec3(0.62))*1.18, vec3(1./2.2)); }
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(uCam - vW);
  if (dot(n, v) < 0.) n = -n;
  vec3 base = vC; float a = uAlpha;
  if (uTex > .5) { vec4 t = texture2D(uMap, vUv); if (t.a < uCut) discard; base = lin(t.rgb)*uTint; a *= t.a; }
  float fres = pow(1. - max(dot(n, v), 0.), 2.6);
  if (uMode > .5) { // голограмма
    float scan = .78 + .22*step(.5, fract(vW.y*.22 - uTime*.6));
    float band = .7 + .3*smoothstep(0., .1, abs(fract(vW.y*.012 - uTime*.08) - .5));
    // сетка как у каркасной модели: кольца по высоте и меридианы вокруг тела
    float ring = smoothstep(.86, .97, abs(fract(vW.y*.75) - .5)*2.);
    float ang = atan(vW.x, vW.z)*12.;
    float mer = smoothstep(.84, .97, abs(fract(ang) - .5)*2.);
    float grid = max(ring, mer);
    vec3 hc = vec3(.28, .86, 1.);
    float lum = uTex > .5 ? dot(base, vec3(.3,.59,.11))*.9 : .0;
    float edge = pow(fres, 1.3);
    gl_FragColor = vec4(hc*(.08 + lum + edge*2.3 + grid*.75)*scan*band, (.05 + edge*.8 + lum*.25 + grid*.3)*a);
    return;
  }
  vec3 L1 = normalize(vec3(.55, .75, .62)), L2 = normalize(vec3(-.7, .25, .35)), L3 = normalize(vec3(-.2, .5, -.9));
  float w = uWrap;
  float d1 = max((dot(n, L1) + w)/(1. + w), 0.);
  float d2 = max(dot(n, L2), 0.);
  float d3 = max(dot(n, L3), 0.);
  vec3 sky = vec3(.78, .84, .95), gnd = vec3(.42, .37, .34);
  vec3 hemi = mix(gnd, sky, n.y*.5 + .5);
  // мягкое «подповерхностное» рассеяние: в полутени цвет теплеет
  vec3 sss = vec3(1., .55, .45)*smoothstep(.0, .5, d1)*(1. - smoothstep(.5, 1., d1))*.18*uWrap*2.5;
  vec3 h = normalize(L1 + v);
  float sp = pow(max(dot(n, h), 0.), 48.)*uSpec;
  float ao = .72 + .28*smoothstep(0., 18., vW.y); // темнее у пола
  float occ = mix(.42, 1., vMat.x), hair = vMat.y, cloth = vMat.z;
  if (uUOn > .5) { // ровные края ткани без «пилы» по треугольникам
    float y = vW.y, e = .12;
    float top = smoothstep(uUB.x - e, uUB.x + e, y)*(1. - smoothstep(uUB.y - e, uUB.y + e, y));
    float bot = smoothstep(uUB.z - e, uUB.z + e, y)*(1. - smoothstep(uUB.w - e, uUB.w + e, y));
    float wgt = clamp(vMat.z*(top + bot), 0., 1.);
    float trim = max(smoothstep(uUB.w - 2.6, uUB.w - 2.3, y)*bot, (1. - smoothstep(uUB.x + 2., uUB.x + 2.3, y))*top); // резинка
    base = mix(base, mix(uUC, vec3(.86, .86, .84), trim), wgt); cloth = wgt;
  }
  // волосы: пряди и блик вдоль прядей
  if (hair > .01) {
    float strand = vnoise(vec2(atan(vW.x, vW.z)*40., vW.y*1.2))*.5 + vnoise(vec2(atan(vW.x, vW.z)*110., vW.y*3.))*.5;
    base *= mix(1., .7 + .55*strand, hair);
    float band = pow(max(0., 1. - abs(dot(normalize(vec3(n.x, 0., n.z)), normalize(vec3(h.x, 0., h.z))) - .25)), 6.);
    sp = mix(sp, band*.22*(.6 + .8*strand)*max(d1, 0.), hair);
  }
  // ткань: шероховатость и плетение, без блеска
  if (cloth > .01) { float weave = .94 + .06*sin(vW.x*9.)*sin(vW.y*9.) + .04*vnoise(vW.xy*3.); base *= mix(1., weave, cloth); sp *= 1. - cloth*.85; }
  vec3 sssC = sss*(1. - cloth)*(1. - hair);
  vec3 col = base*(hemi*.42*occ + d1*vec3(1., .96, .9)*.95*mix(.7, 1., vMat.x) + d2*vec3(.55, .62, .8)*.32*occ + sssC)*ao
           + d3*vec3(.75, .85, 1.)*.22*base*occ + vec3(sp)*occ + fres*.10*sky*occ*(1. - cloth*.5);
  gl_FragColor = vec4(tone(col), a);
}`;

const VS_QUAD = `attribute vec2 aP; varying vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, .9999, 1.); }`;
const FS_BG = `
precision mediump float; varying vec2 vP; uniform vec3 uTop; uniform vec3 uBot; uniform float uHolo;
void main(){ float t = vP.y*.5 + .5; vec3 c = mix(uBot, uTop, smoothstep(0., 1., t));
  float vig = 1. - .18*dot(vP*vec2(.8,.6), vP*vec2(.8,.6)); gl_FragColor = vec4(c*vig, 1.); }`;

const VS_FLOOR = `attribute vec2 aP; uniform mat4 uVP; varying vec2 vF;
void main(){ vF = aP*120.; gl_Position = uVP*vec4(vF.x, 0., vF.y, 1.); }`;
const FS_FLOOR = `
precision mediump float; varying vec2 vF; uniform vec4 uFeet; uniform vec2 uBody; uniform vec3 uTint; uniform float uHolo; uniform float uTime;
float blob(vec2 p, vec2 c, vec2 r){ vec2 q = (p - c)/r; return exp(-dot(q, q)*1.6); }
void main(){
  float r = length(vF);
  if (uHolo > .5) {
    float ring = smoothstep(1.5, 0., abs(r - 52.)) + smoothstep(1., 0., abs(r - 44.))*.6;
    float disc = smoothstep(56., 40., r)*.18;
    float puls = .7 + .3*sin(uTime*3.);
    gl_FragColor = vec4(vec3(.3,.85,1.)*(ring*puls + disc), (ring + disc)*.9); return;
  }
  float plat = smoothstep(64., 60., r);
  float sh = max(blob(vF, vec2(0., 0.), uBody)*.38, max(blob(vF, uFeet.xy, vec2(6., 13.)), blob(vF, uFeet.zw, vec2(6., 13.)))*.55);
  float edge = smoothstep(1.2, 0., abs(r - 62.))*.5;
  float a = plat*.55 + sh*plat + edge;
  vec3 c = mix(uTint, vec3(0.), clamp(sh*1.6, 0., 1.));
  gl_FragColor = vec4(mix(c, uTint*1.15, edge), a);
}`;

const VS_TAPE = `attribute vec3 aPos; attribute vec2 aUv; attribute vec3 aNor; uniform mat4 uVP; uniform mat4 uM;
varying vec2 vUv; varying vec3 vN; void main(){ vUv = aUv; vN = mat3(uM)*aNor; gl_Position = uVP*(uM*vec4(aPos,1.)); }`;
const FS_TAPE = `precision mediump float; varying vec2 vUv; varying vec3 vN; uniform sampler2D uMap; uniform float uA; uniform float uHi; uniform float uTime;
void main(){ vec4 t = texture2D(uMap, vUv); float l = .78 + .22*abs(dot(normalize(vN), normalize(vec3(.4,.6,.7))));
  vec3 c = t.rgb*l;
  if (uHi > .5) { float p = .5 + .5*sin(uTime*5.); c = mix(c, vec3(1., .93, .55), .18 + .22*p); c *= 1.12; }
  if (uA < .99) c = mix(vec3(dot(c, vec3(.3,.59,.11))), c, .35);
  gl_FragColor = vec4(c, t.a*uA); }`;

function mat4Persp(fov, asp, n, f) { const t = 1/Math.tan(fov/2), nf = 1/(n-f); return [t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]; }
function mat4Look(e, c, u) {
  let zx=e[0]-c[0], zy=e[1]-c[1], zz=e[2]-c[2]; let l=Math.hypot(zx,zy,zz); zx/=l; zy/=l; zz/=l;
  let xx=u[1]*zz-u[2]*zy, xy=u[2]*zx-u[0]*zz, xz=u[0]*zy-u[1]*zx; l=Math.hypot(xx,xy,xz); xx/=l; xy/=l; xz/=l;
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1];
}
function mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+j]*b[i*4+k]; o[i*4+j] = s; } return o; }
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
const srgb = v => Math.pow(v, 2.2);

function Viewer(canvas) {
  const ctxOpts = { antialias: true, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl2', ctxOpts) || canvas.getContext('webgl', ctxOpts) || canvas.getContext('experimental-webgl', ctxOpts);
  if (!gl) throw new Error('WebGL недоступен');
  const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!gl2 && !gl.getExtension('OES_element_index_uint')) throw new Error('Нет поддержки больших моделей');

  function prog(vs, fs) {
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
    return { p, u, a };
  }
  const P = { body: prog(VS_BODY, FS_BODY), bg: prog(VS_QUAD, FS_BG), floor: prog(VS_FLOOR, FS_FLOOR), tape: prog(VS_TAPE, FS_TAPE) };
  const buf = (data, target) => { const b = gl.createBuffer(); gl.bindBuffer(target || gl.ARRAY_BUFFER, b); gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  const quad = buf(new Float32Array([-1,-1, 1,-1, -1,1, 1,1]));

  function makeMesh(m) { // { pos, nor, col?, uv?, idx }
    const o = { n: m.idx.length, pos: buf(m.pos), nor: buf(m.nor), idx: buf(m.idx, gl.ELEMENT_ARRAY_BUFFER), bytes: m.idx.BYTES_PER_ELEMENT };
    o.col = m.col ? buf(m.col) : null; o.uv = m.uv ? buf(m.uv) : null; return o;
  }
  function freeMesh(o) { if (!o) return; for (const k of ['pos','nor','idx','col','uv','mat']) if (o[k]) gl.deleteBuffer(o[k]); }
  const resetAttribs = () => { for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i); };
  function attr(loc, b, size) { if (loc === undefined || loc < 0) return; if (b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); } else { gl.disableVertexAttribArray(loc); } }
  function texture(src) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // глаз: сфера с белком, радужкой и зрачком (смотрит вдоль +Z)
  function eyeMesh(r, iris) {
    const pos = [], nor = [], col = [], idx = [], S = 24, R = 18;
    const ir = iris.map(srgb), white = [.86,.84,.82].map(srgb), dark = [.02,.02,.02];
    for (let i = 0; i <= R; i++) for (let j = 0; j <= S; j++) {
      const th = i/R*Math.PI, ph = j/S*Math.PI*2, x = Math.sin(th)*Math.cos(ph), y = Math.sin(th)*Math.sin(ph), z = Math.cos(th);
      pos.push(x*r, y*r, z*r); nor.push(x, y, z);
      const c = th < 0.17 ? dark : th < 0.42 ? ir.map((v, k) => v*(0.75 + 0.5*Math.sin(ph*9 + k)*0.2 + (th - 0.17))) : white;
      col.push(c[0], c[1], c[2]);
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) { const a = i*(S+1)+j, b = a+S+1; idx.push(a, b, a+1, b, b+1, a+1); }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), idx: new Uint32Array(idx) };
  }

  // сантиметровая лента вокруг среза тела
  function tapeTexture(lenCm) {
    const pxcm = 12, W = Math.min(4096, Math.ceil(lenCm*pxcm)), H = 32, c = document.createElement('canvas');
    c.width = W; c.height = H; const g = c.getContext('2d'), k = W/lenCm;
    g.fillStyle = '#ffc21a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1a1a1a';
    for (let cm = 0; cm <= lenCm; cm++) { const x = cm*k, big = cm % 10 === 0, mid = cm % 5 === 0;
      g.fillRect(x, 0, 1.4, big ? 13 : mid ? 9 : 6); g.fillRect(x, H - (big ? 13 : mid ? 9 : 6), 1.4, big ? 13 : mid ? 9 : 6);
      if (big && cm) { g.font = '700 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(cm), x, H/2 + 1); } }
    return texture(c);
  }
  // лента вдоль контура: pts/nrm — плоские массивы xyz, nrm — наружу от тела
  function tapeMesh(pts, nrm, closed, width) {
    const n = pts.length/3, pos = [], nor = [], uv = [], idx = [], hw = (width || 1.8)/2;
    const P = i => [pts[i*3], pts[i*3+1], pts[i*3+2]], Nn = i => [nrm[i*3], nrm[i*3+1], nrm[i*3+2]];
    let L = 0; const acc = [0], cnt = closed ? n : n - 1;
    for (let i = 1; i <= cnt; i++) { const a = P(i - 1), b = P(i % n); L += Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]); acc.push(L); }
    for (let i = 0; i <= cnt; i++) {
      const k = i % n, p = P(k), nn = Nn(k);
      const pa = P(closed ? (k - 1 + n) % n : Math.max(0, k - 1)), pb = P(closed ? (k + 1) % n : Math.min(n - 1, k + 1));
      let t = [pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]]; const tl = Math.hypot(...t) || 1; t = t.map(v => v/tl);
      let sd = [t[1]*nn[2]-t[2]*nn[1], t[2]*nn[0]-t[0]*nn[2], t[0]*nn[1]-t[1]*nn[0]]; const sl = Math.hypot(...sd) || 1; sd = sd.map(v => v/sl);
      if (sd[1] < -0.01 || (Math.abs(sd[1]) < 0.01 && sd[2] + sd[0] < 0)) sd = sd.map(v => -v);
      const o = [p[0] + nn[0]*0.35, p[1] + nn[1]*0.35, p[2] + nn[2]*0.35];
      for (const sg of [-1, 1]) { pos.push(o[0] + sd[0]*hw*sg, o[1] + sd[1]*hw*sg, o[2] + sd[2]*hw*sg); nor.push(nn[0], nn[1], nn[2]); uv.push(acc[i]/L, sg > 0 ? 1 : 0); }
      if (i < cnt) { const a = i*2; idx.push(a, a+1, a+2, a+1, a+3, a+2); }
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint32Array(idx), len: L };
  }

  /* ---------- состояние ---------- */
  const S = {
    yaw: 0.45, pitch: 0.08, dist: 380, target: 92, auto: true, speed: 0.25, mode: 'solid', theme: 'light',
    body: null, face: null, faceTex: null, eyes: [], parts: [], tapes: [], showTapes: true, H: 176, feet: [-10, 4, 10, 4], bodyR: [26, 16],
    eyeColor: [.36, .25, .16], labels: [], hi: null, goal: null, ty: null, tx: 0, tz: 0
  };
  let eyeGeo = null, vp = null, camPos = [0, 0, 0], W = 1, Hh = 1, raf = 0, last = 0, time = 0, dirty = true, visible = true;

  function resize() {
    const dpr = Math.min(2, root.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    W = w; Hh = h;
    if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) { canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr); }
    dirty = true;
  }
  function camera() {
    const asp = W/Hh, fitH = S.H*1.3, fov = 30*Math.PI/180;
    let d = S.dist; const needH = fitH/2/Math.tan(fov/2), needW = (S.H*0.62)/2/Math.tan(fov/2)/asp;
    d = Math.max(60, Math.min(S.dist, 900)) * Math.max(needH, needW)/380;
    const ty = S.ty == null ? S.H*0.5 + 2 : S.ty;
    camPos = [S.tx + Math.sin(S.yaw)*Math.cos(S.pitch)*d, ty + Math.sin(S.pitch)*d, S.tz + Math.cos(S.yaw)*Math.cos(S.pitch)*d];
    vp = mul(mat4Persp(fov, asp, 5, 3000), mat4Look(camPos, [S.tx, ty, S.tz], [0, 1, 0]));
  }
  const ID = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

  function drawMesh(m, M, opt) {
    const b = P.body; gl.useProgram(b.p); resetAttribs();
    gl.uniformMatrix4fv(b.u.uVP, false, vp); gl.uniformMatrix4fv(b.u.uM, false, M);
    gl.uniform3fv(b.u.uCam, camPos); gl.uniform1f(b.u.uMode, S.mode === 'holo' ? 1 : 0); gl.uniform1f(b.u.uTime, time);
    gl.uniform1f(b.u.uUOn, opt.under && S.under ? 1 : 0); if (opt.under && S.under) { gl.uniform4fv(b.u.uUB, S.under.b); gl.uniform3fv(b.u.uUC, S.under.c); }
    gl.uniform1f(b.u.uTex, opt.tex ? 1 : 0); gl.uniform3fv(b.u.uTint, opt.tint || [1, 1, 1]); gl.uniform1f(b.u.uCut, opt.cut ?? -1); gl.uniform1f(b.u.uWrap, opt.wrap ?? 0.4); gl.uniform1f(b.u.uSpec, opt.spec ?? 0.08); gl.uniform1f(b.u.uAlpha, opt.alpha ?? 1);
    if (opt.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, opt.tex); gl.uniform1i(b.u.uMap, 0); }
    attr(b.a.aPos, m.pos, 3); attr(b.a.aNor, m.nor, 3); attr(b.a.aCol, m.col, 3); attr(b.a.aUv, m.uv, 2); attr(b.a.aMat, m.mat, 3);
    if (!m.mat && b.a.aMat >= 0) gl.vertexAttrib3f(b.a.aMat, 1, opt.hair ? 1 : 0, 0);
    if (!m.col && b.a.aCol >= 0) { const c = opt.color || [.8, .8, .8]; gl.vertexAttrib3f(b.a.aCol, c[0], c[1], c[2]); }
    if (!m.uv && b.a.aUv >= 0) gl.vertexAttrib2f(b.a.aUv, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.drawElements(gl.TRIANGLES, m.n, m.bytes === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (last || ts))/1000); last = ts; time += dt;
    if (S.goal) { // плавно поворачиваемся к выбранной мерке
      const g = S.goal, k = Math.min(1, dt*4);
      let dy = ((g.yaw - S.yaw) % (Math.PI*2) + Math.PI*3) % (Math.PI*2) - Math.PI;
      S.yaw += dy*k; S.pitch += (g.pitch - S.pitch)*k; S.dist += (g.dist - S.dist)*k;
      const tyNow = S.ty == null ? S.H*0.5 + 2 : S.ty, tyGoal = g.ty == null ? S.H*0.5 + 2 : g.ty;
      S.ty = tyNow + (tyGoal - tyNow)*k; S.tx += ((g.tx || 0) - S.tx)*k; S.tz += ((g.tz || 0) - S.tz)*k;
      if (Math.abs(dy) < 0.002 && Math.abs(g.dist - S.dist) < 0.5 && Math.abs(tyGoal - S.ty) < 0.1) { if (g.ty == null) S.ty = null; if (g.release) S.goal = null; }
      dirty = true;
    } else if (S.auto && !drag) { S.yaw += dt*S.speed; dirty = true; }
    if (S.hi) dirty = true;
    if (S.mode === 'holo') dirty = true;
    if (!dirty || !visible) return;
    dirty = false;
    resize(); camera();
    gl.viewport(0, 0, canvas.width, canvas.height);
    const holo = S.mode === 'holo', dark = holo || S.theme === 'dark';
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    // фон
    gl.useProgram(P.bg.p); resetAttribs();
    const top = holo || dark ? [.035,.075,.115] : [.96,.965,.975], bot = holo || dark ? [.008,.018,.035] : [.83,.85,.88]; // тёмная тема — ночной синий, как у голограммы
    gl.uniform3fv(P.bg.u.uTop, top); gl.uniform3fv(P.bg.u.uBot, bot);
    attr(P.bg.a.aP, quad, 2); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // пол
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const rot = rotY(S.yawModel || 0);
    gl.useProgram(P.floor.p); resetAttribs();
    gl.uniformMatrix4fv(P.floor.u.uVP, false, vp);
    gl.uniform4fv(P.floor.u.uFeet, S.feet); gl.uniform2fv(P.floor.u.uBody, S.bodyR);
    gl.uniform3fv(P.floor.u.uTint, dark ? [.12,.3,.38] : [.74,.76,.8]); gl.uniform1f(P.floor.u.uHolo, dark ? 1 : 0); gl.uniform1f(P.floor.u.uTime, time);
    attr(P.floor.a.aP, quad, 2); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // тело
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    if (holo) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); } else gl.disable(gl.BLEND);
    if (S.body) drawMesh(S.body, ID, { wrap: 0.42, spec: 0.07, under: true });
    if (!holo) for (const e of S.eyes) drawMesh(eyeGeo, e.M, { wrap: 0.1, spec: 0.55 });
    // части реалистичной модели: глаза, брови, ресницы, волосы
    for (const p of S.parts) {
      if (holo && p.role === 'eyes') continue; // глаза на голограмме дают яркое пятно
      const cut = p.role === 'eyes' ? -1 : 0.45;
      if (cut > 0 && !holo) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      drawMesh(p.m, ID, { tex: p.tex, color: p.color, cut, wrap: p.role === 'hair' ? 0.2 : 0.3, hair: p.role === 'hair', spec: p.role === 'eyes' ? 0.5 : 0.12 });
      if (cut > 0 && !holo) gl.disable(gl.BLEND);
    }
    if (S.face && S.faceTex) {
      gl.enable(gl.BLEND); if (!holo) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4); gl.depthMask(false);
      drawMesh(S.face, ID, { tex: S.faceTex, wrap: 0.42, spec: 0.05 });
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true);
    }
    if (S.showTapes && S.tapes.length) { // ленты видны и на голограмме
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P.tape.p); resetAttribs(); gl.uniformMatrix4fv(P.tape.u.uVP, false, vp); gl.uniformMatrix4fv(P.tape.u.uM, false, ID); gl.uniform1f(P.tape.u.uTime, time);
      const order = S.hi ? S.tapes.filter(t => t.key !== S.hi).concat(S.tapes.filter(t => t.key === S.hi)) : S.tapes;
      for (const t of order) {
        const on = t.key === S.hi;
        gl.uniform1f(P.tape.u.uA, S.hi && !on ? 0.28 : 1); gl.uniform1f(P.tape.u.uHi, on ? 1 : 0);
        if (on) gl.depthFunc(gl.ALWAYS); else gl.depthFunc(gl.LEQUAL);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(P.tape.u.uMap, 0);
        attr(P.tape.a.aPos, t.m.pos, 3); attr(P.tape.a.aNor, t.m.nor, 3); attr(P.tape.a.aUv, t.m.uv, 2);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, t.m.idx); gl.drawElements(gl.TRIANGLES, t.m.n, gl.UNSIGNED_INT, 0);
      }
      gl.depthFunc(gl.LEQUAL);
    }
    gl.depthMask(true);
    if (api.onFrame) api.onFrame();
  }

  /* ---------- управление ---------- */
  let drag = null, pinch = null, lastTap = 0;
  const pts = new Map();
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, [e.clientX, e.clientY]); try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, vx: 0 }; const now = performance.now(); if (now - lastTap < 300) api.reset(); lastTap = now; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0]-b[0], a[1]-b[1]), dist: S.dist }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; S.dist = Math.max(140, Math.min(520, pinch.dist*pinch.d/Math.max(20, Math.hypot(a[0]-b[0], a[1]-b[1])))); dirty = true; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.vx = dx;
    S.yaw -= dx*0.008; S.pitch = Math.max(-0.35, Math.min(0.75, S.pitch + dy*0.005)); dirty = true;
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { if (drag && Math.abs(drag.vx) > 2) momentum = -drag.vx*0.008; drag = null; } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); S.dist = Math.max(140, Math.min(520, S.dist*(e.deltaY > 0 ? 1.08 : 0.93))); dirty = true; }, { passive: false });
  let momentum = 0;
  (function inertia() { requestAnimationFrame(inertia); if (Math.abs(momentum) > 0.0005 && !drag) { S.yaw += momentum; momentum *= 0.93; dirty = true; } })();
  if (root.ResizeObserver) new ResizeObserver(() => { dirty = true; }).observe(canvas);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; dirty = true; });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); if (api.onLost) api.onLost(); });

  const api = {
    gl, state: S,
    setBody(mesh, info) {
      freeMesh(S.body); S.body = makeMesh(mesh); S.H = info.H;
      S.bodyR = [Math.max(14, info.ah*1.15), Math.max(10, info.bh*1.4)];
      S.feet = [-(info.ah*0.45), 5, info.ah*0.45, 5];
      // глаза
      if (!eyeGeo) eyeGeo = makeMesh(eyeMesh(1, S.eyeColor));
      S.eyes = (info.eyes || []).map(e => ({ M: [e.r,0,0,0, 0,e.r,0,0, 0,0,e.r,0, e.x,e.y,e.z,1] }));
      // ленты
      for (const t of S.tapes) { freeMesh(t.m); gl.deleteTexture(t.tex); }
      S.tapes = (info.tapes || []).map(t => { const g = tapeMesh(t.pts, t.nrm, t.closed, t.w); return { key: t.key, m: makeMesh(g), tex: tapeTexture(Math.max(1, g.len)), src: t }; });
      dirty = true;
    },
    setParts(list) {
      for (const p of S.parts) { freeMesh(p.m); if (p.tex) gl.deleteTexture(p.tex); }
      S.parts = (list || []).map(p => ({ role: p.role, m: makeMesh({ pos: p.pos, nor: p.nor, uv: p.uv, idx: p.idx }), tex: p.image ? texture(p.image) : null,
        color: (p.color || [.8, .8, .8]).map(c => Math.pow(c, 2.2)) }));
      dirty = true;
    },
    setUnderwear(u) { S.under = u; dirty = true; }, // { b: [низ топа, верх топа, низ трусов, верх трусов], c: [r,g,b] } или null
    setColors(col, mat) { if (!S.body) return; if (S.body.col) gl.deleteBuffer(S.body.col); S.body.col = buf(col); if (mat) { if (S.body.mat) gl.deleteBuffer(S.body.mat); S.body.mat = buf(mat); } dirty = true; },
    setEyeColor(rgb) { S.eyeColor = rgb; freeMesh(eyeGeo); eyeGeo = makeMesh(eyeMesh(1, rgb)); dirty = true; },
    setFace(mesh, canvasSrc) { freeMesh(S.face); S.face = mesh ? makeMesh(mesh) : null; if (canvasSrc) api.updateFaceTexture(canvasSrc); dirty = true; },
    updateFaceTexture(src) { if (S.faceTex) gl.deleteTexture(S.faceTex); S.faceTex = texture(src); dirty = true; },
    setMode(m) { S.mode = m; dirty = true; }, setTheme(t) { S.theme = t; dirty = true; },
    setAuto(on) { S.auto = on; }, setSpeed(v) { S.speed = v; },
    showTapes(on) { S.showTapes = on; dirty = true; },
    rotate(d) { S.yaw += d; dirty = true; }, tilt(d) { S.pitch = Math.max(-0.35, Math.min(0.75, S.pitch + d)); dirty = true; },
    zoom(f) { S.dist = Math.max(140, Math.min(520, S.dist*f)); dirty = true; },
    reset() { S.yaw = 0.45; S.pitch = 0.08; S.dist = 380; momentum = 0; dirty = true; },
    project(x, y, z) { if (!vp) return null; const v = [x, y, z, 1], o = [0,0,0,0];
      for (let i = 0; i < 4; i++) o[i] = vp[i]*v[0] + vp[4+i]*v[1] + vp[8+i]*v[2] + vp[12+i];
      if (o[3] <= 0) return null; return { x: (o[0]/o[3]*0.5 + 0.5)*W, y: (1 - (o[1]/o[3]*0.5 + 0.5))*Hh, z: o[2]/o[3] }; },
    viewDir() { return [Math.sin(S.yaw), Math.cos(S.yaw)]; },
    invalidate() { dirty = true; },
    /* подсветить ленту мерки и повернуть к ней камеру */
    highlight(key, view) {
      S.hi = key; dirty = true;
      if (!key) { S.goal = { yaw: S.yaw, pitch: 0.08, dist: 380, ty: null, release: true }; return; }
      const t = S.tapes.find(x => x.key === key); if (!t || !view) return;
      const p = t.src.pts; let y0 = 1e9, y1 = -1e9, sx = 0, sz = 0, n = p.length/3;
      for (let i = 0; i < p.length; i += 3) { y0 = Math.min(y0, p[i+1]); y1 = Math.max(y1, p[i+1]); sx += p[i]; sz += p[i+2]; }
      const side = !view.whole && (view.zoom || 1) < 0.9; // крупный план — смотрим в центр ленты
      S.goal = { yaw: view.yaw, pitch: view.pitch ?? 0.1, dist: 380*(view.zoom || 1), ty: view.whole ? null : (y0 + y1)/2 + (view.dy || 0),
        tx: side ? sx/n*0.8 : 0, tz: side ? sz/n*0.5 : 0 };
    },
    snapshot() { dirty = true; frame(performance.now()); return canvas.toDataURL('image/jpeg', 0.9); }
  };
  raf = requestAnimationFrame(frame);
  return api;
}

root.Viewer = Viewer;
})(typeof self !== 'undefined' ? self : this);
