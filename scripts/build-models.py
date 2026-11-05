# Сборка реалистичных моделей man/woman для «Проекции» из открытых файлов MakeHuman (CC0).
# Нужен клон https://github.com/makehumancommunity/makehuman в /tmp/mh, Python 3 + numpy + Pillow.
# Запуск: python scripts/build-models.py www/models
"""Build realistic man/woman OBJ for Proekciya from MakeHuman CC0 base mesh + targets."""
import numpy as np, os, sys, shutil

D = '/tmp/mh/makehuman/data'
OUT = sys.argv[1]
os.makedirs(OUT + '/textures', exist_ok=True)

# ---------- base mesh ----------
V, VT, faces = [], [], []  # faces: (group, [(vi, ti)])
g = None
for line in open(D + '/3dobjs/base.obj'):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        g = line.split()[1]
    elif line.startswith('f '):
        f = []
        for t in line.split()[1:]:
            a = t.split('/')
            f.append((int(a[0]) - 1, int(a[1]) - 1 if len(a) > 1 and a[1] else -1))
        faces.append((g, f))
V0 = np.array(V)
VT = np.array(VT)


def target(name):
    d = np.zeros_like(V0)
    for line in open(D + '/targets/' + name):
        if not line.strip() or line[0] == '#':
            continue
        a = line.split()
        d[int(a[0])] += [float(a[1]), float(a[2]), float(a[3])]
    return d


def build(male):
    gs = 'male' if male else 'female'
    v = V0.copy()
    v += target(f'macrodetails/universal-{gs}-young-averagemuscle-averageweight.target')
    for race in ('african', 'asian', 'caucasian'):
        w = 0.8 if race == 'caucasian' else 0.1
        v += w * target(f'macrodetails/{race}-{gs}-young.target')
    # slightly ideal proportions (as in good-looking renders)
    v += 0.5 * target(f'macrodetails/proportions/{gs}-young-averagemuscle-averageweight-idealproportions.target')
    if male:
        v += 0.25 * target('macrodetails/universal-male-young-maxmuscle-averageweight.target') \
            - 0.25 * target('macrodetails/universal-male-young-averagemuscle-averageweight.target')
    else:
        v += 0.35 * target('breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness.target')
    return v


def fit_proxy(v, mhclo):
    base = os.path.dirname(mhclo)
    refs, scale, objf = [], {}, None
    inverts = False
    for line in open(mhclo):
        s = line.split()
        if not s or s[0] == '#':
            continue
        if s[0] == 'obj_file':
            objf = s[1]
        elif s[0] in ('x_scale', 'y_scale', 'z_scale'):
            scale[s[0][0]] = (int(s[1]), int(s[2]), float(s[3]))
        elif s[0] == 'verts':
            inverts = True
        elif inverts and len(s) == 9:
            refs.append([float(x) for x in s])
        elif inverts and len(s) == 1:
            refs.append([int(s[0]), int(s[0]), int(s[0]), 1, 0, 0, 0, 0, 0])
        elif inverts and s[0] in ('weights', 'delete_verts'):
            inverts = False
    sc = []
    for ax, k in enumerate('xyz'):
        a, b, div = scale[k]
        sc.append(abs(v[a][ax] - v[b][ax]) / div)
    out = []
    for r in refs:
        i, j, k = int(r[0]), int(r[1]), int(r[2])
        p = r[3] * v[i] + r[4] * v[j] + r[5] * v[k] + np.array(r[6:9]) * sc
        out.append(p)
    # proxy obj faces/uvs
    pv, pvt, pf = [], [], []
    for line in open(os.path.join(base, objf)):
        if line.startswith('vt '):
            pvt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            f = []
            for t in line.split()[1:]:
                a = t.split('/')
                f.append((int(a[0]) - 1, int(a[1]) - 1 if len(a) > 1 and a[1] else -1))
            pf.append(f)
    return np.array(out), np.array(pvt), pf


def vnormals(v, flist):
    n = np.zeros_like(v)
    for f in flist:
        p = [v[i] for i in f]
        for k in range(1, len(p) - 1):
            n[f[0]] += np.cross(p[k] - p[0], p[k + 1] - p[0])
            n[f[k]] += np.cross(p[k] - p[0], p[k + 1] - p[0])
            n[f[k + 1]] += np.cross(p[k] - p[0], p[k + 1] - p[0])
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l


def hair_mesh(v, male, bv, bfaces):
    """Scalp cap offset from the body along a natural hairline; the woman also gets a chin-length bob."""
    eye = v[sorted({i for g2, f in faces if g2 in ('helper-l-eye', 'helper-r-eye') for i, _ in f})].mean(axis=0)
    body_f = bfaces
    ids = sorted({i for f in body_f for i in f})
    cz = eye[2] - 0.95                      # head centre lies ~9.5 cm behind the eyes
    nrm = vnormals(bv, body_f)

    def hairline(p):
        dx, dz = p[0], p[2] - cz
        r = np.hypot(dx, dz) or 1
        t = (1 - dz / r) / 2               # 0 = front, 1 = back
        if t < 0.5:
            return eye[1] + (0.42 if male else 0.36) + t * 2 * (0.40 - (0.42 if male else 0.36))
        return eye[1] + 0.40 - (t - 0.5) * 2 * (0.40 + (0.75 if male else 0.95))

    # hairline: every vertex gets a signed height above the hairline; the shell dives under the skin
    # below it, so the visible edge is the smooth zero line, not the stair-step of mesh faces
    def h_above(i):
        p = bv[i]
        return p[1] - hairline(p)
    hgt = {i: h_above(i) for i in ids if bv[i][1] > eye[1] - 1.3}
    off = 0.045 if male else 0.09
    hv, remap, tris = [], {}, []
    for f in body_f:
        if all(i in hgt for i in f) and max(hgt[i] for i in f) > -0.02 and min(hgt[i] for i in f) > -0.35:
            q = []
            for i in f:
                if i not in remap:
                    k = max(-1.0, min(1.0, hgt[i] / 0.18))
                    remap[i] = len(hv); hv.append(bv[i] + nrm[i] * off * k)
                q.append(remap[i])
            tris.append(q)
    if not male:
        # bob: MakeHuman's long-hair helper, trimmed at the jaw and opened at the face
        hf = [[i for i, _ in f] for g2, f in faces if g2 == 'helper-hair']
        hn = vnormals(v, hf)
        rm2 = {}
        chin = eye[1] - 1.05
        for f in hf:
            ok = True
            for i in f:
                p = v[i]
                dz = p[2] - cz; r = np.hypot(p[0], dz) or 1
                front = dz / r
                if p[1] < chin or (front > 0.45 and p[1] < eye[1] + 0.55):
                    ok = False; break
            if ok:
                q = []
                for i in f:
                    if i not in rm2:
                        rm2[i] = len(hv); hv.append(v[i] + hn[i] * 0.02)
                    q.append(rm2[i])
                tris.append(q)
    return np.array(hv), tris, eye


def catmull_clark(v, flist):
    """flist: faces as [(vi, ti)]. Returns new verts, uvs, quad faces [(vi, ti)]."""
    used = sorted({i for f in flist for i, _ in f})
    vid = {i: n for n, i in enumerate(used)}
    P = v[used]
    F = [[vid[i] for i, _ in f] for f in flist]
    T = [[t for _, t in f] for f in flist]
    nP = len(P)
    fp = np.array([P[f].mean(axis=0) for f in F])
    edges = {}
    for fi, f in enumerate(F):
        for k in range(len(f)):
            e = tuple(sorted((f[k], f[(k + 1) % len(f)])))
            edges.setdefault(e, []).append(fi)
    eidx = {e: n for n, e in enumerate(edges)}
    ep = np.zeros((len(edges), 3))
    bnd = np.zeros(nP, bool)
    for e, fs in edges.items():
        a, b = e
        if len(fs) == 2:
            ep[eidx[e]] = (P[a] + P[b] + fp[fs[0]] + fp[fs[1]]) / 4
        else:
            ep[eidx[e]] = (P[a] + P[b]) / 2; bnd[a] = bnd[b] = True
    # new vertex points
    Fs = np.zeros((nP, 3)); Fn = np.zeros(nP)
    for fi, f in enumerate(F):
        for i in f:
            Fs[i] += fp[fi]; Fn[i] += 1
    Rs = np.zeros((nP, 3)); Rn = np.zeros(nP)
    for (a, b) in edges:
        m = (P[a] + P[b]) / 2
        Rs[a] += m; Rs[b] += m; Rn[a] += 1; Rn[b] += 1
    n = Fn[:, None]
    NP = (Fs / n + 2 * Rs / Rn[:, None] + (n - 3) * P) / n
    NP[bnd] = P[bnd]
    verts = np.vstack([NP, ep, fp])
    E0, F0 = nP, nP + len(edges)
    # uvs
    uv, uvi = [], {}
    def U(key, val):
        if key not in uvi:
            uvi[key] = len(uv); uv.append(val)
        return uvi[key]
    out = []
    for fi, f in enumerate(F):
        t = T[fi]; L = len(f)
        cu = U(('f', fi), VT[t].mean(axis=0))
        for k in range(L):
            i, ip, im = f[k], f[(k + 1) % L], f[(k - 1) % L]
            ti, tip_, tim = t[k], t[(k + 1) % L], t[(k - 1) % L]
            en = E0 + eidx[tuple(sorted((i, ip)))]
            eprev = E0 + eidx[tuple(sorted((im, i)))]
            out.append([
                (i, U(('v', ti), VT[ti])),
                (en, U(('e',) + tuple(sorted((ti, tip_))), (VT[ti] + VT[tip_]) / 2)),
                (F0 + fi, cu),
                (eprev, U(('e',) + tuple(sorted((tim, ti))), (VT[tim] + VT[ti]) / 2)),
            ])
    return verts, np.array(uv), out


def write(name, male):
    v = build(male)
    gs = 'm' if male else 'f'
    lines = [f'# Proekciya {name} — built from MakeHuman CC0 assets', f'mtllib {name}.mtl']
    # body: one Catmull-Clark pass (smooth skin, sharper painted clothing edges)
    sv, suv, sf = catmull_clark(v, [f for gname, f in faces if gname == 'body'])
    for p in sv:
        lines.append('v %.5f %.5f %.5f' % tuple(p))
    for t in suv:
        lines.append('vt %.5f %.5f' % tuple(t))
    lines += ['o body', 'usemtl skin']
    for f in sf:
        lines.append('f ' + ' '.join(f'{i + 1}/{t + 1}' for i, t in f))
    nv, nt = len(sv), len(suv)
    # eyes
    ev, evt, ef = fit_proxy(v, D + '/eyes/high-poly/high-poly.mhclo')
    for p in ev:
        lines.append('v %.5f %.5f %.5f' % tuple(p))
    for t in evt:
        lines.append('vt %.5f %.5f' % tuple(t))
    lines += ['o eyes', 'usemtl eyes']
    for f in ef:
        cu = np.mean([evt[t] for _, t in f], axis=0)
        if cu[0] > 0.8 and cu[1] < 0.2:   # transparent cornea shell: skip
            continue
        lines.append('f ' + ' '.join(f'{nv + i + 1}/{nt + t + 1}' for i, t in f))
    nv += len(ev); nt += len(evt)
    # hair
    hv, ht, c = hair_mesh(v, male, sv, [[i for i, _ in f] for f in sf])
    for p in hv:
        lines.append('v %.5f %.5f %.5f' % tuple(p))
    lines += ['o hair', 'usemtl hair']
    for f in ht:
        lines.append('f ' + ' '.join(str(nv + i + 1) for i in f))
    open(f'{OUT}/{name}.obj', 'w').write('\n'.join(lines) + '\n')
    hair = '0.10 0.07 0.05' if male else '0.22 0.14 0.08'
    open(f'{OUT}/{name}.mtl', 'w').write(
        f'newmtl skin\nKd 0.80 0.62 0.52\n\nnewmtl eyes\nKd 1 1 1\nmap_Kd textures/brown_eye.png\n\nnewmtl hair\nKd {hair}\n')
    print(name, 'verts', nv + len(hv))


from PIL import Image
im = np.array(Image.open(D + '/eyes/materials/brown_eye.png').convert('RGBA')).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
red = (r > g * 1.35) & (r > 60)                       # iris is very red: shift to warm brown
lum = 0.3 * r + 0.59 * g + 0.11 * b
im[..., :3] = np.where(red[..., None], np.clip(np.stack([lum * 1.25, lum * 0.95, lum * 0.65], -1), 0, 255), im[..., :3])
Image.fromarray(im.astype(np.uint8)).save(OUT + '/textures/brown_eye.png')
write('man', True)
write('woman', False)
