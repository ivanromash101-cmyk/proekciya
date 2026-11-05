// Простой локальный сервер для запуска на ноутбуке: node scripts/serve.mjs → http://localhost:8000
import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), WWW = join(ROOT, 'www'), TOOLS = join(ROOT, 'tools');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.task': 'application/octet-stream' };
const PORT = +process.env.PORT || 8000;
const BG = { host: '127.0.0.1', port: +process.env.BG_PORT || 8765 }; // модуль удаления фона (tools/bg_remover)
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // фото пользователя → модуль удаления фона на этом же компьютере; в интернет ничего не уходит
  if (p === '/api/remove-background' && req.method === 'POST') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (body.length > 40e6) { res.writeHead(413, { 'Content-Type': 'application/json' }).end('{"error":"файл больше 40 МБ"}'); return; }
    const up = request({ ...BG, path: '/remove-background', method: 'POST', headers: { 'content-type': req.headers['content-type'] || 'application/octet-stream', 'content-length': body.length } }, r => {
      res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'application/octet-stream', ...(r.headers['x-report'] ? { 'X-Report': r.headers['x-report'] } : {}) });
      r.pipe(res);
    });
    up.setTimeout(240000, () => up.destroy(new Error('timeout')));
    up.on('error', () => { if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"bg_remover не запущен"}'); });
    up.end(body); return;
  }
  // ИИ-примерка (FASHN через fal.ai): ключ лежит только на этом компьютере — в файле fal.key или переменной FAL_KEY
  if (p === '/api/tryon-ai/status') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: !!falKey() })); return; }
  if (p === '/api/tryon-ai' && req.method === 'POST') { await tryonAI(req, res); return; }
  // ИИ-стилист, поиск, скидки — тот же код, что на сервере в интернете (server/worker.js), но с ключом из файла anthropic.key
  const ai = p.match(/^\/api(\/(chat|search|tryon|deals|vton|places))$/);
  if (ai) { await viaWorker(req, res, ai[1]); return; }
  // программа сама узнаёт, что ИИ-сервер есть на этом компьютере
  if (p === '/js/config.js' && anthropicKey()) {
    const base = await readFile(join(WWW, 'js/config.js'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' })
      .end(base + "\nif (!window.PROEKCIYA_CONFIG.chatUrl) window.PROEKCIYA_CONFIG.chatUrl = 'api'; // ключ ИИ найден на этом компьютере\n");
    return;
  }
  if (p.endsWith('/')) p += 'index.html';
  const f = join(WWW, p); if (!f.startsWith(WWW)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : data); }
  catch { res.writeHead(404).end('Не найдено'); }
}).listen(PORT, () => console.log(`Проекция: http://localhost:${PORT}  (Ctrl+C — остановить)`));

/* ---------- модуль удаления фона запускается автоматически вместе с программой ---------- */
let bgProc = null, bgRestarts = 0;
const say = t => console.log('Удаление фона: ' + t);
function bgAlive() {
  return new Promise(ok => {
    const r = request({ ...BG, path: '/health', method: 'GET', timeout: 1500 }, x => { x.resume(); ok(x.statusCode === 200); });
    r.on('error', () => ok(false)); r.on('timeout', () => { r.destroy(); ok(false); }); r.end();
  });
}
const PYS = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
function launchBg(i = 0) {
  if (i >= PYS.length) { say('не удалось запустить — нужен Python и pip install -r tools\\requirements.txt. Пока работает быстрый способ.'); return; }
  const t0 = Date.now();
  const p = spawn(PYS[i], ['-m', 'bg_remover.server', '--port', String(BG.port)],
    { cwd: TOOLS, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' } });
  bgProc = p; let failed = false;
  p.on('error', () => { failed = true; bgProc = null; launchBg(i + 1); }); // такой команды нет — пробуем следующую
  p.stdout.on('data', d => process.stdout.write('[удаление фона] ' + d));
  p.stderr.on('data', d => { const t = String(d); if (!/HTTP\/1\.[01]" (200|204)/.test(t)) process.stderr.write('[удаление фона] ' + t); });
  p.on('exit', code => {
    if (failed || bgProc !== p) return; bgProc = null;
    if (stopping) return;
    if (Date.now() - t0 < 15000 && code) { launchBg(i + 1); return; } // этот Python не подошёл (нет rembg) — следующий
    if (bgRestarts++ < 3) { say('остановился, перезапускаю…'); setTimeout(() => launchBg(i), 3000); }
  });
}
let stopping = false;
const stopBg = () => { stopping = true; if (bgProc) { try { bgProc.kill(); } catch {} } };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { stopBg(); process.exit(0); });
process.on('exit', stopBg);
(async () => {
  if (!existsSync(join(TOOLS, 'bg_remover', 'server.py'))) { say('папка tools\\bg_remover не найдена — работает быстрый способ.'); return; }
  if (await bgAlive()) { say('уже работает.'); return; }
  say('запускаю нейросеть (первый раз скачается модель ~930 МБ)…');
  launchBg();
})();

/* ---------- ИИ-примерка: фото человека + фото вещи → фото человека в этой вещи ---------- */
const FAL_MODEL = process.env.FAL_MODEL || 'fal-ai/fashn/tryon/v1.6', FAL_BASE = process.env.FAL_BASE || 'https://fal.run/';
function falKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  try { return readFileSync(join(ROOT, 'fal.key'), 'utf8').trim() || null; } catch { return null; }
}
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const CATS = { tops: 1, bottoms: 1, 'one-pieces': 1, auto: 1 };
async function tryonAI(req, res) {
  const out = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
  const key = falKey(); if (!key) return out(501, { error: 'no-key' });
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 25e6) return out(413, { error: 'too big' }); chunks.push(c); }
  let b; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return out(400, { error: 'bad json' }); }
  if (!IMG.test(b.model_image || '') || !IMG.test(b.garment_image || '')) return out(400, { error: 'bad image' });
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 180000);
  try {
    const r = await fetch(FAL_BASE + FAL_MODEL, { method: 'POST', signal: ctrl.signal,
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_image: b.model_image, garment_image: b.garment_image, category: CATS[b.category] ? b.category : 'auto',
        garment_photo_type: 'auto', mode: 'balanced', num_samples: 1, output_format: 'png' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return out(r.status === 401 || r.status === 403 ? 401 : 502, { error: (j.detail && JSON.stringify(j.detail)) || j.error || ('fal ' + r.status) });
    const url = j.images && j.images[0] && j.images[0].url; if (!url) return out(502, { error: 'no image' });
    const img = await fetch(url, { signal: ctrl.signal }); if (!img.ok) return out(502, { error: 'download ' + img.status });
    const buf = Buffer.from(await img.arrayBuffer());
    res.writeHead(200, { 'Content-Type': img.headers.get('content-type') || 'image/png', 'Content-Length': buf.length }).end(buf);
  } catch (e) { out(504, { error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) }); }
  finally { clearTimeout(t); }
}

/* ---------- ИИ через локальный сервер ---------- */
function anthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try { return readFileSync(join(ROOT, 'anthropic.key'), 'utf8').trim() || null; } catch { return null; }
}
let workerMod = null;
async function viaWorker(req, res, path) {
  try {
    workerMod = workerMod || (await import(pathToFileURL(join(ROOT, 'server', 'worker.js')).href)).default;
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > 25e6) { res.writeHead(413).end(); return; } chunks.push(c); }
    const r = new Request('http://local' + path, { method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const out = await workerMod.fetch(r, { ANTHROPIC_API_KEY: anthropicKey() || '', FAL_KEY: falKey() || '', GOOGLE_PLACES_KEY: googleKey() || '' });
    const buf = Buffer.from(await out.arrayBuffer());
    res.writeHead(out.status, { 'Content-Type': out.headers.get('content-type') || 'application/json' }).end(buf);
  } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(e.message || e) })); }
}
function googleKey() {
  if (process.env.GOOGLE_PLACES_KEY) return process.env.GOOGLE_PLACES_KEY.trim();
  try { return readFileSync(join(ROOT, 'google.key'), 'utf8').trim() || null; } catch { return null; }
}
