// Скачивает всё, что нужно приложению для работы без интернета:
//  - распознавание фигуры MediaPipe (из npm-пакета) и его модель (~9 МБ);
//  - шрифты Manrope и Unbounded (кириллица + латиница).
// Запуск: npm install && node scripts/fetch-vendor.mjs
import { mkdir, copyFile, readdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const exists = p => access(p).then(() => true, () => false);

async function download(url, dest, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

// 1. MediaPipe
const mp = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision');
if (await exists(mp)) {
  const out = join(WWW, 'vendor', 'mediapipe');
  await mkdir(join(out, 'wasm'), { recursive: true });
  await copyFile(join(mp, 'vision_bundle.mjs'), join(out, 'vision_bundle.mjs'));
  for (const f of await readdir(join(mp, 'wasm'))) await copyFile(join(mp, 'wasm', f), join(out, 'wasm', f));
  console.log('✓ MediaPipe скопирован');
} else console.warn('! Нет node_modules/@mediapipe/tasks-vision — сначала выполните npm install');

const model = join(WWW, 'vendor', 'models', 'pose_landmarker_full.task');
if (!(await exists(model))) {
  await download('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task', model);
  console.log('✓ Модель распознавания позы скачана');
}

// 2. Шрифты
try {
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Unbounded:wght@600&display=swap', { headers: UA })).text();
  let outCss = '/* Шрифты из Google Fonts (лицензия OFL), сохранены локально */\n', i = 0;
  const parts = css.split('@font-face');
  for (let k = 1; k < parts.length; k++) {
    const subset = (parts[k - 1].match(/\/\* ([a-z-]+) \*\/\s*$/) || [, ''])[1];
    if (subset !== 'cyrillic' && subset !== 'latin') continue;
    const url = (parts[k].match(/url\((https:[^)]+)\)/) || [])[1]; if (!url) continue;
    const name = `font-${i++}.woff2`;
    await download(url, join(WWW, 'fonts', name));
    outCss += '@font-face' + parts[k].split('}')[0].replace(url, '../fonts/' + name) + '}\n';
  }
  await writeFile(join(WWW, 'css', 'fonts.css'), outCss);
  console.log(`✓ Шрифты скачаны: ${i} файлов`);
} catch (e) { console.warn('! Шрифты не скачались, будут системные:', e.message); }
