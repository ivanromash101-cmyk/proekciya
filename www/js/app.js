/* Проекция — основная логика приложения */
'use strict';
const $ = id => document.getElementById(id);
const root = document.documentElement;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ================= настройки, голос, субтитры ================= */
const prefs = Object.assign({ model: 'real', tts: false, wizard: false, big: false, hc: false, tapes: true, captions: true, theme: 'auto', spin: true }, store.get('pr-prefs', {}));
const savePrefs = () => store.set('pr-prefs', prefs);
let capTimer;
function caption(text, who) {
  if (!prefs.captions || !$('cam').hidden || !$('manual').hidden) return;
  $('capWho').textContent = who || ''; $('capText').textContent = text; $('caption').hidden = false;
  clearTimeout(capTimer); capTimer = setTimeout(() => $('caption').hidden = true, Math.max(3200, text.length*65));
}
let liveTimer;
function announce(text) { clearTimeout(liveTimer); liveTimer = setTimeout(() => { $('live').textContent = ''; requestAnimationFrame(() => $('live').textContent = text); }, 300); }
function say(text, force) { if (prefs.tts || force) Native.speak(window.I18N ? I18N.tr(text) : text); }
/* одно сообщение — сразу всеми способами: экранный диктор, голос, субтитр */
function notify(text, who) { announce(text); say(text); caption(text, who); }
window.App = { say: t => say(t) };
/* для «Моих мерок»: прочитать и подставить мерки целиком */
window.Body = { get: () => ({ g: gender, m: { ...M } }), set(g, m) { setGender(g); M = { ...DEF[g], ...m }; syncInputs(); updateResult(); requestBuild(); }, onChange: [] };
function cm(n) { if (n % 1) return `${String(Math.round(n*10)/10).replace('.', ',')} сантиметра`; n = Math.round(n); const a = n % 10, b = n % 100; return `${n} ${(a === 1 && b !== 11) ? 'сантиметр' : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? 'сантиметра' : 'сантиметров'}`; }
const fmt = v => String(v).replace('.', ',');

/* ================= мерки ================= */
const FIELDS = [
  { k: 'height', name: 'Рост', short: 'Рост', min: 145, max: 210, hint: 'Без обуви, от пола до макушки' },
  { k: 'neck', name: 'Обхват шеи', short: 'Шея', min: 28, max: 56, hint: 'У основания шеи — для рубашек' },
  { k: 'shoulders', name: 'Ширина плеч', short: 'Плечи', min: 32, max: 58, hint: 'По спине между крайними точками плеч' },
  { k: 'chest', name: 'Обхват груди', short: 'Грудь', min: 70, max: 140, hint: 'По самым выступающим точкам, лента горизонтально' },
  { k: 'underbust', name: 'Обхват под грудью', short: 'Под грудью', min: 58, max: 125, hint: 'Сразу под грудью — для бюстгальтера', only: 'f' },
  { k: 'waist', name: 'Обхват талии', short: 'Талия', min: 55, max: 135, hint: 'По самому узкому месту' },
  { k: 'hips', name: 'Обхват бёдер', short: 'Бёдра', min: 75, max: 150, hint: 'По самым выступающим точкам ягодиц' },
  { k: 'thigh', name: 'Обхват бедра', short: 'Бедро', min: 38, max: 90, hint: 'Одна нога, самое широкое место — для брюк' },
  { k: 'sleeve', name: 'Длина рукава', short: 'Рукав', min: 45, max: 78, hint: 'От плеча до запястья по слегка согнутой руке' },
  { k: 'inseam', name: 'Длина ноги', short: 'Шаг', min: 60, max: 100, hint: 'По внутреннему шву, от паха до пола' },
  { k: 'head', name: 'Обхват головы', short: 'Голова', min: 48, max: 64, hint: 'По лбу над бровями — для шапок' },
  { k: 'foot', name: 'Длина стопы', short: 'Стопа', min: 20, max: 33, step: 0.5, hint: 'От пятки до самого длинного пальца — для обуви' }
];
const NAMES = Object.fromEntries(FIELDS.map(f => [f.k, f.name]));
const DEF = { m: { height: 178, neck: 39, shoulders: 46, chest: 98, underbust: 88, waist: 84, hips: 98, thigh: 56, sleeve: 63, inseam: 81, head: 57, foot: 26.5 },
  f: { height: 166, neck: 33, shoulders: 39, chest: 90, underbust: 75, waist: 70, hips: 98, thigh: 56, sleeve: 58, inseam: 76, head: 55, foot: 24 } };
let gender = 'm', M = { ...DEF.m };
if (!store.get('pr-neon-v1', false)) { prefs.theme = 'dark'; store.set('pr-neon-v1', true); if (!store.get('pr-view', null)) store.set('pr-view', 'holo'); } // новый стиль: тёмная неоновая тема
if (!store.get('pr-real-v2', false)) { prefs.model = 'real'; store.set('pr-real-v2', true); } // реалистичная модель — по умолчанию
{ const s = store.get('pr-body', null); if (s && s.g && s.m) { gender = s.g; M = { ...DEF[gender], ...s.m }; } }
const VIEWS = { // откуда смотреть на ленту каждой мерки
  height: { yaw: 0.55, zoom: 1, whole: true }, neck: { yaw: 0.35, zoom: 0.38 }, shoulders: { yaw: Math.PI + 0.3, zoom: 0.55, pitch: 0.28 },
  chest: { yaw: 0.35, zoom: 0.6 }, underbust: { yaw: 0.35, zoom: 0.55 }, waist: { yaw: 0.35, zoom: 0.6 }, hips: { yaw: 0.55, zoom: 0.6 },
  thigh: { yaw: 0.75, zoom: 0.55 }, sleeve: { yaw: 1.3, zoom: 0.78 }, inseam: { yaw: -0.3, zoom: 0.78, pitch: 0.05 }, head: { yaw: 0.4, zoom: 0.34 },
  foot: { yaw: 1.05, zoom: 0.36, pitch: 0.42 } };
let hiKey = null, hlTimer;
function markRow(k) { for (const el of document.querySelectorAll('.step.hl')) el.classList.remove('hl'); const d = k && document.querySelector(`.step[data-step="${k}"]`); if (d) d.classList.add('hl'); }
function hl(k) { clearTimeout(hlTimer); if (hiKey === k) return; hiKey = k; markRow(k); if (viewer) viewer.highlight(k, VIEWS[k]); }
function unhl(now) { clearTimeout(hlTimer); hlTimer = setTimeout(() => { hiKey = null; markRow(null); if (viewer) viewer.highlight(null); }, now === true ? 0 : 2200); }
const clampF = (k, v) => { const f = FIELDS.find(x => x.k === k), st = f.step || 1; return clamp(Math.round(v/st)*st, f.min, f.max); };

for (const f of FIELDS) {
  const d = document.createElement('div'); d.className = 'step'; d.dataset.step = f.k; if (f.only) d.dataset.only = f.only;
  d.innerHTML = `<label class="f-name" for="n-${f.k}">${f.name}</label>
    <div class="stepper">
      <button type="button" id="dec-${f.k}" aria-label="Меньше: ${f.name.toLowerCase()}">−</button>
      <input id="n-${f.k}" type="${f.step ? 'text' : 'number'}" inputmode="${f.step ? 'decimal' : 'numeric'}" step="${f.step || 1}" min="${f.min}" max="${f.max}" aria-describedby="h-${f.k} e-${f.k}">
      <span class="u" aria-hidden="true">см</span>
      <button type="button" id="inc-${f.k}" aria-label="Больше: ${f.name.toLowerCase()}">+</button>
    </div>
    <input id="r-${f.k}" type="range" min="${f.min}" max="${f.max}" step="${f.step || 1}" aria-label="${f.name}, ползунок" aria-describedby="h-${f.k}">
    <span class="f-hint" id="h-${f.k}">${f.hint}. ${f.min}–${f.max} см</span>
    <span class="f-err" id="e-${f.k}" aria-live="assertive"></span>`;
  $('fields').appendChild(d);
  const r = $('r-' + f.k), n = $('n-' + f.k), e = $('e-' + f.k);
  const st = f.step || 1;
  const set = (v, src) => {
    v = Math.round(String(v).replace(',', '.')/st)*st;
    if (isNaN(v)) { e.textContent = 'Введите число цифрами, например ' + DEF[gender][f.k]; return; }
    if (v < f.min || v > f.max) { e.textContent = `Допустимо от ${f.min} до ${f.max} см. Поставлено ${fmt(clampF(f.k, v))}.`; v = clampF(f.k, v); } else e.textContent = '';
    M[f.k] = v; if (src !== 'n' || f.step) n.value = fmt(v); r.value = v; r.setAttribute('aria-valuetext', cm(v));
    changed(f, v, src === 'r');
  };
  r.oninput = () => set(+r.value, 'r');
  n.onchange = () => set(n.value, 'n');
  n.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); set(n.value, 'n'); if (prefs.wizard) go(1); } };
  $('dec-' + f.k).onclick = () => { hl(f.k); set(M[f.k] - st, 'b'); unhl(); };
  $('inc-' + f.k).onclick = () => { hl(f.k); set(M[f.k] + st, 'b'); unhl(); };
  n.addEventListener('focus', () => { hl(f.k); say(`${f.name}. Сейчас ${cm(M[f.k])}. ${f.hint}.`); });
  // подсветка ленты этой мерки на модели
  for (const el of [n, r]) { el.addEventListener('focus', () => hl(f.k)); el.addEventListener('blur', unhl); }
  r.addEventListener('pointerdown', () => hl(f.k)); r.addEventListener('input', () => hl(f.k));
  d.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hl(f.k); }); d.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !d.contains(document.activeElement)) unhl(); });
}
function syncInputs() { for (const f of FIELDS) { $('r-' + f.k).value = M[f.k]; $('n-' + f.k).value = fmt(M[f.k]); $('r-' + f.k).setAttribute('aria-valuetext', cm(M[f.k])); $('e-' + f.k).textContent = ''; } $('scanH').textContent = M.height; }
let chgTimer;
function changed(f, v, dragging) {
  updateResult(); requestBuild();
  clearTimeout(chgTimer);
  chgTimer = setTimeout(() => { notify(`${f.name}: ${cm(v)}. Размер ${sizes().letter}.`, 'Изменено'); flash(); }, dragging ? 700 : 350);
}
function flash() { const r = $('result'); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 800); }
function setGender(g) { gender = g; for (const x of ['m', 'f']) $('g-' + x).setAttribute('aria-checked', g === x); for (const el of document.querySelectorAll('[data-only]')) el.hidden = el.dataset.only !== g; }
function chooseGender(g, quiet) {
  if (gender === g) return; setGender(g); if (typeof applyModelUI === 'function') applyModelUI(); M = { ...DEF[g] }; syncInputs(); updateResult(); requestBuild();
  if (!quiet) notify(`${g === 'm' ? 'Мужчина' : 'Женщина'}. Мерки заменены на типовые — их можно изменить.`, 'Изменено');
}
$('g-m').onclick = () => chooseGender('m'); $('g-f').onclick = () => chooseGender('f');
for (const b of [$('g-m'), $('g-f')]) b.addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) { e.preventDefault(); const g = gender === 'm' ? 'f' : 'm'; chooseGender(g); $('g-' + g).focus(); } });
$('reset').onclick = () => { M = { ...DEF[gender] }; syncInputs(); updateResult(); requestBuild(); notify('Мерки сброшены на типовые.', 'Сброс'); };

/* «Начать заново»: стереть всё, что программа сохранила на этом устройстве; второе нажатие — подтверждение */
{ const b = $('resetAll'), note = $('resetAllNote'); let armed = null;
  const disarm = () => { clearTimeout(armed); armed = null; b.textContent = I18N_TR('Начать заново'); b.classList.remove('armed'); note.hidden = true; };
  b.onclick = async () => {
    if (!armed) { b.textContent = I18N_TR('Да, стереть всё'); b.classList.add('armed'); note.hidden = false; armed = setTimeout(disarm, 5000); return; }
    clearTimeout(armed); b.disabled = true;
    const step = (f, ms = 2000) => Promise.race([Promise.resolve().then(f).catch(() => {}), new Promise(r => setTimeout(r, ms))]); // ни один шаг не подвесит сброс
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    await step(() => new Promise(r => { const q = indexedDB.deleteDatabase('proekciya'); q.onsuccess = q.onerror = q.onblocked = r; }));
    await step(async () => { for (const k of await caches.keys()) await caches.delete(k); });
    await step(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
    try { localStorage.clear(); } catch (e) {} // программа могла успеть что-то записать
    location.replace(location.pathname);
  };
}
function I18N_TR(t) { return window.I18N ? I18N.tr(t) : t; }

/* ================= размеры ================= */
const LET = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
/* Размеры аксессуаров и обуви — одинаковы для всех вещей */
function extraSizes() {
  const shoe = clamp(Math.round((M.foot + 1.5)*1.5), 33, 50);
  const hatL = M.head <= 53 ? 'XS' : M.head <= 55 ? 'S' : M.head <= 57 ? 'M' : M.head <= 59 ? 'L' : M.head <= 61 ? 'XL' : 'XXL';
  const collarL = M.neck <= 36 ? 'XS' : M.neck <= 38 ? 'S' : M.neck <= 40 ? 'M' : M.neck <= 42 ? 'L' : M.neck <= 44 ? 'XL' : 'XXL';
  const o = { shoe, shoeTxt: `EU ${shoe} · RU ${shoe - 1}`, hat: M.head, hatTxt: `${M.head} (${hatL})`, collar: M.neck, collarL,
    shirtTxt: `воротник ${M.neck} · рукав ${M.sleeve}`, trouserLen: M.inseam };
  if (gender === 'f') {
    const band = clamp(Math.round(M.underbust/5)*5, 60, 120), diff = M.chest - M.underbust;
    const cup = ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][clamp(Math.floor((diff - 10)/2), 0, 8)];
    o.bra = `${band}${cup}`;
  }
  return o;
}
function sizes() { return Object.assign(baseSizes(), extraSizes()); }
function baseSizes() {
  const { chest, waist, hips } = M;
  if (gender === 'm') {
    const eu = clamp(Math.round(chest/4)*2, 42, 62), letter = LET[clamp(Math.floor((chest - 80)/8) + 1, 0, 8)];
    const bottom = clamp(Math.round(Math.max(waist + 14, hips)/4)*2, 42, 62);
    return { letter, eu, ru: eu, bottom, bottomRu: bottom, top: `EU ${eu} · RU ${eu}`, bottomTxt: `EU ${bottom} · RU ${bottom}` };
  }
  const bT = [[32,76],[34,80],[36,84],[38,88],[40,92],[42,96],[44,100],[46,104],[48,110],[50,116],[52,122],[54,128]];
  const hT = [[32,84],[34,88],[36,92],[38,96],[40,100],[42,104],[44,108],[46,112],[48,118],[50,124],[52,130],[54,136]];
  const pick = (t, v) => { for (const [s, c] of t) if (v <= c + 1) return s; return t[t.length - 1][0]; };
  const lf = s => ({ 32:'XXS', 34:'XS', 36:'S', 38:'M', 40:'M', 42:'L', 44:'L', 46:'XL', 48:'XL', 50:'XXL', 52:'XXL', 54:'3XL' })[s];
  const eu = pick(bT, chest), bottom = Math.max(pick(hT, hips), pick(hT, waist + 26));
  return { letter: lf(eu), eu, ru: eu + 6, bottom, bottomRu: bottom + 6, top: `EU ${eu} · RU ${eu + 6}`, bottomTxt: `EU ${bottom} · RU ${bottom + 6}` };
}
function shapeName() {
  const { chest, waist, hips } = M;
  if (gender === 'f') { if (Math.abs(chest - hips) <= 5 && hips - waist >= 20) return 'Песочные часы'; if (hips - chest > 5) return 'Груша'; if (chest - hips > 5) return 'Перевёрнутый треугольник'; if (waist >= chest - 5) return 'Яблоко'; return 'Прямоугольник'; }
  if (M.shoulders*2.15 > chest && chest - waist >= 14) return 'Атлетическая'; if (waist >= chest) return 'Округлая'; if (hips - chest > 4) return 'Треугольник'; return 'Прямая';
}
const spell = s => ({ XXS: 'два икс эс', XS: 'икс эс', S: 'эс', M: 'эм', L: 'эль', XL: 'икс эль', XXL: 'два икс эль', '3XL': 'три икс эль', '4XL': 'четыре икс эль' })[s] || s;
const jeans = () => `W${Math.round(M.waist/2.54)} L${Math.round(M.inseam/2.54)}`;
function resultText() {
  const r = sizes();
  return `Размер ${spell(r.letter)}. Верх: европейский ${r.eu}, российский ${r.ru}. Низ: европейский ${r.bottom}, российский ${r.bottomRu}. Рубашка: воротник ${M.neck}, рукав ${M.sleeve}.${r.bra ? ' Бюстгальтер: ' + r.bra + '.' : ''} Обувь: европейский ${r.shoe}. Головной убор: ${M.head}. Джинсы: ширина ${Math.round(M.waist/2.54)}, длина ${Math.round(M.inseam/2.54)}. Фигура: ${shapeName()}.`;
}
function updateResult() {
  const r = sizes();
  $('rSize').textContent = r.letter; $('rTop').textContent = r.top; $('rBottom').textContent = r.bottomTxt; $('rJeans').textContent = jeans(); $('rShape').textContent = shapeName();
  $('rShirt').textContent = r.shirtTxt; $('rShoe').textContent = r.shoeTxt; $('rHat').textContent = r.hatTxt; $('rBraRow').hidden = !r.bra; if (r.bra) $('rBra').textContent = r.bra;
  $('bSize').textContent = r.letter; $('bSub').textContent = r.top; $('bShape').textContent = shapeName();
  $('badge').setAttribute('aria-label', `Размер ${r.letter}, ${r.top}`);
  $('gl').setAttribute('aria-label', describe());
  store.set('pr-body', { g: gender, m: M });
  if (typeof renderStyle === 'function') renderStyle();
  for (const f of (window.Body ? Body.onChange : [])) f();
}
function describe() { return `${gender === 'm' ? 'Мужская' : 'Женская'} фигура: рост ${cm(M.height)}, грудь ${M.chest}, талия ${M.waist}, бёдра ${M.hips} сантиметров. ${shapeName()}.${hasFace ? ' С лицом по фото.' : ''}${viewMode === 'clothes' && outfit ? ' В образе «' + outfitTitle + '».' : ''}`; }
$('readRes').onclick = () => { const t = resultText(); say(t, true); announce(t); caption(t, 'Результат'); };

function exportText() {
  const r = sizes();
  return ['Проекция — мои мерки', 'Дата: ' + new Date().toLocaleDateString('ru-RU'), 'Пол: ' + (gender === 'm' ? 'мужской' : 'женский'),
    ...FIELDS.filter(f => !f.only || f.only === gender).map(f => `${f.name}: ${fmt(M[f.k])} см`), '', `Размер: ${r.letter}`, `Верх: ${r.top}`, `Низ: ${r.bottomTxt}`, `Джинсы: ${jeans()}`,
    `Рубашка: ${r.shirtTxt}`, ...(r.bra ? [`Бюстгальтер: ${r.bra}`] : []), `Обувь: ${r.shoeTxt}`, `Головной убор: ${r.hatTxt}`, `Фигура: ${shapeName()}`].join('\n');
}
$('shareBtn').onclick = async () => {
  try { const how = await Native.shareText('Мои мерки', exportText()); if (how === 'copied') notify('Мерки скопированы — вставьте их в сообщение.', 'Скопировано'); }
  catch (e) { if (!e || e.name !== 'AbortError') notify('Не удалось поделиться. Попробуйте «Сохранить».', 'Ошибка'); }
};
$('saveBtn').onclick = async () => {
  try { const how = await Native.saveText('merki.txt', exportText()); if (how === 'downloaded') notify('Файл merki.txt сохранён в «Загрузки».', 'Сохранено'); }
  catch (e) { if (!e || e.name !== 'AbortError') notify('Не удалось сохранить файл.', 'Ошибка'); }
};

/* ================= пошаговый ввод ================= */
const allSteps = [...document.querySelectorAll('.step')]; let cur = 0;
const visSteps = () => allSteps.filter(s => !s.hidden);
function showStep(focus = true) {
  const steps = visSteps(); cur = clamp(cur, 0, steps.length - 1);
  allSteps.forEach(x => x.classList.remove('current'));
  steps.forEach((s, i) => s.classList.toggle('current', i === cur));
  $('wizCount').textContent = `Шаг ${cur + 1} из ${steps.length}`; $('prev').disabled = cur === 0; $('next').textContent = cur === steps.length - 1 ? 'Готово' : 'Далее →';
  if (!focus) return;
  const k = steps[cur].dataset.step;
  if (k === 'gender') { $('g-' + gender).focus(); say(`Шаг ${cur + 1} из ${steps.length}. Пол. Сейчас ${gender === 'm' ? 'мужчина' : 'женщина'}. Переключайте стрелками.`); }
  else $('n-' + k).focus();
}
function go(d) {
  const steps = visSteps();
  if (cur === steps.length - 1 && d > 0) { const t = 'Все мерки введены. ' + resultText(); announce(t); say(t); caption('Все мерки введены. Результат вверху панели.', 'Готово'); $('readRes').focus(); return; }
  cur = clamp(cur + d, 0, steps.length - 1); showStep();
}
$('prev').onclick = () => go(-1); $('next').onclick = () => go(1);

/* ================= голосовой ввод ================= */
const WORDS = { 'рост': 'height', 'подгруд': 'underbust', 'груд': 'chest', 'тали': 'waist', 'бедро': 'thigh', 'бедр': 'hips', 'бёдр': 'hips', 'плеч': 'shoulders', 'ног': 'inseam', 'шаг': 'inseam', 'ше': 'neck', 'рукав': 'sleeve', 'голов': 'head', 'стоп': 'foot', 'обув': 'foot' };
function parseVoice(text) {
  const t = text.toLowerCase().replace(/под\s+груд/g, 'подгруд').replace(/(\d+)[,.](\d)/g, '$1.$2'), out = [];
  if (/женщ/.test(t)) chooseGender('f', true); else if (/мужч/.test(t)) chooseGender('m', true);
  const re = /([а-яё]+)[^0-9а-яё]*?(\d{2,3}(?:\.\d)?)/g; let m;
  while ((m = re.exec(t))) for (const w in WORDS) if (m[1].startsWith(w) && !(w === 'бедр' && /^бедро$/.test(m[1]))) { out.push([WORDS[w], +m[2]]); break; }
  if (!out.length) { const n = t.match(/\d{2,3}/); if (n) { const k = prefs.wizard ? visSteps()[cur].dataset.step : (document.activeElement && document.activeElement.id || '').replace(/^[nr]-/, ''); if (FIELDS.some(f => f.k === k)) out.push([k, +n[0]]); } }
  return out;
}
$('voiceBtn').onclick = async () => {
  const b = $('voiceBtn'), label = b.innerHTML; b.disabled = true; b.lastChild.textContent = 'Слушаю…';
  caption('Скажите, например: «рост 180, грудь 100, талия 86»', 'Голосовой ввод');
  try {
    const txt = await Native.listen(), got = parseVoice(txt);
    if (!got.length) { notify(`Услышано: «${txt}». Мерки не найдены — назовите мерку и число.`, 'Голосовой ввод'); return; }
    for (const [k, v] of got) M[k] = clampF(k, v);
    syncInputs(); updateResult(); requestBuild();
    notify('Записано: ' + got.map(([k]) => NAMES[k].toLowerCase() + ' ' + cm(M[k])).join(', ') + `. Размер ${sizes().letter}.`, 'Голосовой ввод');
  } catch (e) { notify(e.message || 'Голосовой ввод недоступен.', 'Голосовой ввод'); }
  finally { b.innerHTML = label; b.disabled = false; }
};

/* ================= 3D ================= */
let viewer = null;
const NO3D = (window.PROEKCIYA_CONFIG || {}).mode3d === false; // встроенная 3D-модель выключена — проекция только по фото
if (!NO3D) try { viewer = Viewer($('gl')); } catch (e) { $('nogl').hidden = false; $('gl').hidden = true; console.warn(e); }
const K = HumanBody.KIND;
let body = null, hasFace = false, viewMode = store.get('pr-view', 'body');
viewMode = 'photo'; // при запуске сразу реалистичная проекция — по фото; «Тело» и «Голограмма» — переключателем
if (viewMode === 'clothes') viewMode = 'body'; // кнопки «Одежда» больше нет
const BASIC_OUTFIT = { top: '#eceae4', sl: 's', bot: '#3a4a68', bt: 't', out: null, ol: 'j', sh: '#f2f2f2' };
let outfit = store.get('pr-outfit', null), outfitTitle = store.get('pr-outfit-title', '');
const look = Object.assign({ skin: '#e2b391', hair: '#3b2a1f', eyes: '#5a3b22' }, store.get('pr-look', {}));

let worker = null;
try { worker = new Worker('js/body.js'); worker.onerror = () => { worker = null; busy = false; pump(); }; worker.onmessage = e => onBuilt(e.data); } catch (e) { worker = null; }
let busy = false, wantCoarse = false, wantFine = false, fineTimer, reqId = 0;
/* реалистичная модель (MakeHuman): подгонка в основном потоке, она быстрая */
const templates = { m: null, f: null };
let tplTimer = null;
const useTemplate = () => prefs.model === 'real' && templates[gender];
function requestBuild() {
  if (typeof NO3D !== 'undefined' && NO3D) return;
  if (useTemplate()) {
    clearTimeout(tplTimer); $('busy').hidden = false;
    tplTimer = setTimeout(() => {
      try { const r = HumanTemplate.fit(templates[gender], { ...M }, gender); r.mesh.ao = HumanTemplate.cavityAO(r.mesh.pos, r.mesh.nor, r.mesh.idx); onBuilt({ id: ++reqId, mesh: r.mesh, info: r.info, extras: r.extras }); }
      catch (e) { console.error(e); tplMsg('Не удалось подогнать модель: ' + e.message, 'err'); prefs.model = 'built'; savePrefs(); applyModelUI(); requestBuild(); }
    }, 90);
    return;
  }
  wantCoarse = true; pump(); clearTimeout(fineTimer); fineTimer = setTimeout(() => { wantFine = true; pump(); }, 420); $('busy').hidden = false; }
function pump() {
  if (busy) return;
  let cell = 0;
  if (wantFine) { cell = 0.9; wantFine = wantCoarse = false; } else if (wantCoarse) { cell = 2.0; wantCoarse = false; }
  if (!cell) return;
  busy = true; const msg = { M: { ...M }, gender, face: hasFace, cell, id: ++reqId };
  if (worker) worker.postMessage(msg);
  else setTimeout(() => { try { const r = HumanBody.buildHuman(msg.M, msg.gender, msg.face, msg.cell); onBuilt({ id: msg.id, mesh: r.mesh, info: r.info, cell }); } catch (e) { busy = false; console.error(e); } }, 16);
}
function onBuilt(d) {
  busy = false;
  if (d.error) { console.error(d.error); pump(); return; }
  if (!d.extras && useTemplate()) { pump(); return; } // устаревший ответ встроенной модели
  body = d; recolor(true);
  if (viewer) { viewer.setBody(d.mesh, d.info); viewer.setParts(d.extras || []); }
  recolor(); buildFaceDecal();
  if (!wantCoarse && !wantFine && !busy) $('busy').hidden = true;
  pump();
}

// sRGB → линейный цвет
const lin = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.pow(v/255, 2.2)); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t];
function smoothAttr(arr, I, n, from) {
  const acc = new Float32Array(n*3), cnt = new Uint16Array(n), c0 = from || 0;
  for (let t = 0; t < I.length; t += 3) for (let a = 0; a < 3; a++) { const v = I[t + a]; for (let b = 1; b < 3; b++) { const u = I[t + (a + b) % 3]; for (let c = c0; c < 3; c++) acc[v*3 + c] += arr[u*3 + c]; cnt[v]++; } }
  for (let v = 0; v < n; v++) if (cnt[v]) for (let c = c0; c < 3; c++) arr[v*3 + c] = (arr[v*3 + c]*cnt[v] + acc[v*3 + c])/(2*cnt[v]);
}
function recolor(dry) {
  if (!body || dry || !viewer) return;
  const m = body.mesh, inf = body.info, n = m.kinds.length, P = m.pos, col = new Float32Array(n*3), mat = new Float32Array(n*3);
  const skin = lin(look.skin), hair = lin(look.hair), lip = mix(skin, lin('#a8504c'), 0.5), brow = mix(hair, skin, 0.25);
  const o = outfit || BASIC_OUTFIT;
  const under = lin(inf.template ? '#8e9098' : '#2a2e36'), shirt = lin(o.top), bottomC = lin(o.bot), outerC = o.out ? lin(o.out) : null, shoe = lin(o.sh), sole = lin('#3a3a3a'), belt = lin('#4a3424');
  const wristY = inf.hand[0].wrist[1] + 1.5;
  const H = inf.H, f = gender === 'f';
  const torso = k => k === K.CHEST || k === K.WAIST || k === K.BREAST || k === K.PELVIS || k === K.GLUTE;
  const ss = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
  const sharp = inf.template ? 0.5 : 1; // у реалистичной модели сетка плотная — края ткани чёткие
  const band = (y, lo, hi, e) => ss(lo - e*sharp, lo + e*sharp, y)*(1 - ss(hi - e*sharp, hi + e*sharp, y)); // полоса по высоте
  const put = (c, t, w) => w <= 0 ? c : mix(c, t, w);
  let cw = 0;
  const putc = (c, t, w) => { if (w > 0) cw = Math.max(cw, w); return put(c, t, w); };
  for (let i = 0; i < n; i++) {
    const k = m.kinds[i], y = P[i*3 + 1];
    let c = skin; cw = 0;
    if (k === K.HAIR) c = hair;
    else {
      if (m.tint[i]) c = mix(c, lip, m.tint[i]/255);
      if (m.brow[i]) c = mix(c, brow, m.brow[i]/255);
      if (viewMode === 'body' && inf.template) { if (torso(k) || k === K.LEG_UP) cw = 1; } // бельё рисует шейдер
      else if (viewMode === 'body') {
        if (torso(k) || k === K.LEG_UP) c = putc(c, under, band(y, inf.yCr - 2.5, inf.yHp + 0.035*H, 1.0));
        if (f && (k === K.BREAST || k === K.CHEST)) c = putc(c, under, band(y, inf.yC - 0.042*H, inf.yC + 0.028*H, 0.6));
      }
      if (viewMode === 'clothes' && k !== K.HEAD && k !== K.HAND) {
        const x = P[i*3], z = P[i*3 + 2], legs = k === K.LEG_UP || k === K.LEG_LO;
        // низ: брюки до щиколотки, шорты выше колена, юбка и платье чуть ниже колена
        const hemY = o.bt === 'sh' ? inf.yK + 0.085*H : (o.bt === 'sk' || o.bt === 'd') ? inf.yK - 5 : inf.yA + 3;
        if (torso(k) || legs) c = putc(c, bottomC, band(y, hemY, o.bt === 'd' ? 1e4 : inf.yBelt + 1.2, 0.6));
        // верх
        if (torso(k) || k === K.ARM_UP || k === K.ARM_LO || k === K.NECK) {
          const top = k === K.NECK ? 0.83*H : 1e4;
          let sl = 1;
          if (k === K.ARM_UP) sl = o.sl === 'l' ? 1 : ss(inf.sleeve - 0.6, inf.sleeve + 0.6, y);
          if (k === K.ARM_LO) sl = o.sl === 'l' ? ss(wristY - 0.6, wristY + 0.6, y) : 0;
          c = putc(c, shirt, band(y, o.bt === 'd' ? -1e4 : inf.yBelt + 1.2, top, 0.6)*sl);
        }
        if (torso(k) && o.bt !== 'd') c = putc(c, belt, band(y, inf.yBelt - 1.3, inf.yBelt + 1.3, 0.4));
        // верхняя одежда: куртка до бёдер или пальто до колена, спереди расстёгнута
        if (outerC && (torso(k) || k === K.ARM_UP || k === K.ARM_LO || k === K.NECK || (o.ol === 'c' && legs))) {
          const hem = o.ol === 'c' ? inf.yK + 4 : inf.yHp - 0.03*H, open = z > 0 && Math.abs(x) < (o.ol === 'c' ? 3.2 : 4.2) && y < inf.neckline - 4;
          let w = band(y, hem, k === K.NECK ? 0.84*H : 1e4, 0.6);
          if (k === K.ARM_LO) w *= ss(wristY - 0.6, wristY + 0.6, y);
          if (open && (torso(k) || legs)) w *= 0;
          c = putc(c, outerC, w);
        }
        if (k === K.FOOT || k === K.LEG_LO) c = putc(c, y < 1.4 ? sole : shoe, 1 - ss(inf.yA + 2.4, inf.yA + 3.6, y));
      }
    }
    col[i*3] = c[0]; col[i*3 + 1] = c[1]; col[i*3 + 2] = c[2];
    mat[i*3] = m.ao ? m.ao[i]/255 : 1; mat[i*3 + 1] = k === K.HAIR ? 1 : 0; mat[i*3 + 2] = cw;
  }
  // мягкие границы цветов и материалов: проход сглаживания по соседям
  if (!inf.template) { smoothAttr(col, m.idx, n); smoothAttr(mat, m.idx, n, 1); }
  viewer.setUnderwear(viewMode === 'body' && inf.template ? { b: f ? [inf.yC - 0.045*H, inf.yC + 0.03*H, inf.yCr - 3, inf.yHp + 0.03*H] : [-1e4, -1e4, inf.yCr - 3.5, inf.yHp + 0.035*H], c: under } : null);
  viewer.setColors(col, mat);
}
function setView(v, quiet) {
  viewMode = v; store.set('pr-view', v);
  { const photo = v === 'photo' || ((v === 'body' || v === 'clothes') && !!(window.PhotoFit && PhotoFit.hasPerson)); document.body.classList.toggle('photo-view', photo); const fr = $('fitRoom'); if (fr && !document.body.classList.contains('photo-mode')) fr.hidden = !photo; if (photo && window.PhotoFit) setTimeout(() => PhotoFit.redraw(), 30); }
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-checked', b.dataset.view === (v === 'clothes' ? 'body' : v)); // примерка образа на 3D-модели — под кнопкой «Тело»
  if (viewer) viewer.setMode(v === 'holo' ? 'holo' : 'solid');
  recolor(); if (!quiet) announce({ body: 'Вид: тело', clothes: 'Вид: в одежде', holo: 'Вид: голограмма', photo: 'Вид: моё фото' }[v]);
}
const views = [...document.querySelectorAll('[data-view]')];
views.forEach((b, i) => {
  b.onclick = () => setView(b.dataset.view);
  b.onkeydown = e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const j = (i + (e.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length; views[j].click(); views[j].focus(); } };
});

// подписи на лентах
const labelEls = {}, SHORT = Object.fromEntries(FIELDS.map(f => [f.k, f.short]));
function labelEl(k) {
  if (labelEls[k]) return labelEls[k];
  const s = document.createElement('span'); s.dataset.k = k; $('labels').appendChild(s); labelEls[k] = s;
  s.onclick = () => { selectTab('t-measure'); setSheet(true); const n = $('n-' + k); if (n) { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.focus(); } };
  return s;
}
if (viewer) viewer.onFrame = () => {
  const show = body && prefs.tapes, keys = hiKey ? [hiKey] : ['chest', 'waist', 'hips'];
  const seen = {};
  for (const k in labelEls) { labelEls[k].hidden = true; labelEls[k].classList.remove('hi'); }
  if (!show || !body.info.tapes) return;
  for (const t of body.info.tapes) {
    if (!keys.includes(t.key) || seen[t.key] || t.anchor == null || M[t.key] == null) continue;
    seen[t.key] = 1;
    const p = t.pts, n = p.length/3; let best = null;
    if (t.anchor === 'right') { for (let i = 0; i < n; i += 3) { const q = viewer.project(p[i*3], p[i*3+1], p[i*3+2]); if (q && (!best || q.x > best.x)) best = q; } }
    else { const i = Math.round(t.anchor*(n - 1)); best = viewer.project(p[i*3], p[i*3+1], p[i*3+2]); }
    if (!best) continue;
    const el = labelEl(t.key); el.hidden = false; el.classList.toggle('hi', t.key === hiKey);
    el.textContent = `${SHORT[t.key]} ${fmt(M[t.key])}`;
    el.style.left = Math.min(best.x + 10, ($('stage').clientWidth || 400) - 120) + 'px'; el.style.top = best.y + 'px';
  }
};
$('gl').addEventListener('keydown', e => {
  if (!viewer) return;
  const a = { ArrowLeft: () => viewer.rotate(-0.25), ArrowRight: () => viewer.rotate(0.25), ArrowUp: () => viewer.tilt(-0.08), ArrowDown: () => viewer.tilt(0.08), '+': () => viewer.zoom(0.9), '=': () => viewer.zoom(0.9), '-': () => viewer.zoom(1.1), ' ': () => $('spinBtn').click() }[e.key];
  if (a) { e.preventDefault(); a(); }
});
$('spinBtn').onclick = () => { prefs.spin = !prefs.spin; savePrefs(); applyPrefs(); };
$('resetView').onclick = () => viewer && viewer.reset();

/* ================= лицо ================= */
const FW = 384, FH = 544, EYE = 0.39, OVAL = { cx: .5, cy: .5, rx: .44, ry: .47 };
const faceCv = document.createElement('canvas'); faceCv.width = FW; faceCv.height = FH;
const fcx = faceCv.getContext('2d', { willReadFrequently: true }), fpc = $('facePrev').getContext('2d');
let faceImg = null, ft = { ox: 0, oy: 0, z: 1, rot: 0 };
const iw = im => im.naturalWidth || im.width, ih = im => im.naturalHeight || im.height;
function drawPhoto(ctx) { const s = FH/ih(faceImg)*ft.z*1.15; ctx.save(); ctx.translate(FW/2 + ft.ox, FH/2 + ft.oy); ctx.rotate(ft.rot*Math.PI/180); ctx.drawImage(faceImg, -iw(faceImg)*s/2, -ih(faceImg)*s/2, iw(faceImg)*s, ih(faceImg)*s); ctx.restore(); }
function oval(ctx) { ctx.beginPath(); ctx.ellipse(FW*OVAL.cx, FH*OVAL.cy, FW*OVAL.rx, FH*OVAL.ry, 0, 0, Math.PI*2); }
function renderFace() {
  if (!faceImg) return;
  fpc.clearRect(0, 0, FW, FH); fpc.globalAlpha = .35; drawPhoto(fpc); fpc.globalAlpha = 1;
  fpc.save(); oval(fpc); fpc.clip(); drawPhoto(fpc); fpc.restore();
  fpc.lineWidth = 3; fpc.strokeStyle = '#ffc21a'; oval(fpc); fpc.stroke();
  fpc.setLineDash([10, 8]); fpc.beginPath(); fpc.moveTo(FW*.1, FH*EYE); fpc.lineTo(FW*.9, FH*EYE); fpc.stroke(); fpc.setLineDash([]);
  fpc.fillStyle = '#ffc21a'; fpc.font = '700 20px sans-serif'; fpc.fillText('глаза', FW*.06, FH*EYE - 8);
  fcx.clearRect(0, 0, FW, FH); drawPhoto(fcx);
  fcx.globalCompositeOperation = 'destination-in';
  fcx.save(); fcx.translate(FW*OVAL.cx, FH*OVAL.cy); fcx.scale(1, (FH*OVAL.ry)/(FW*OVAL.rx));
  const g = fcx.createRadialGradient(0, 0, FW*OVAL.rx*.7, 0, 0, FW*OVAL.rx); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
  fcx.fillStyle = g; fcx.fillRect(-FW, -FH, FW*2, FH*2); fcx.restore(); fcx.globalCompositeOperation = 'source-over';
  if (viewer && hasFace) viewer.updateFaceTexture(faceCv);
}
function buildFaceDecal() {
  if (!viewer) return;
  if (!hasFace || !body) { viewer.setFace(null); return; }
  const m = body.mesh, fb = body.info.face, P = m.pos, N = m.nor, I = m.idx, map = new Map(), pos = [], nor = [], uv = [], idx = [];
  const inside = v => { const x = P[v*3], y = P[v*3+1], z = P[v*3+2]; return x >= fb.x0 && x <= fb.x1 && y >= fb.y0 && y <= fb.y1 && z > fb.cz && N[v*3+2] > 0.1; };
  const add = v => { if (map.has(v)) return map.get(v); const i = pos.length/3, o = 0.06;
    pos.push(P[v*3] + N[v*3]*o, P[v*3+1] + N[v*3+1]*o, P[v*3+2] + N[v*3+2]*o); nor.push(N[v*3], N[v*3+1], N[v*3+2]);
    uv.push((P[v*3] - fb.x0)/(fb.x1 - fb.x0), (P[v*3+1] - fb.y0)/(fb.y1 - fb.y0)); map.set(v, i); return i; };
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t+1], c = I[t+2]; if (inside(a) && inside(b) && inside(c)) idx.push(add(a), add(b), add(c)); }
  viewer.setFace({ pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint32Array(idx) }, faceCv);
}
function sampleSkin() {
  try { let r = 0, g = 0, b = 0, n = 0;
    for (const [px, py] of [[.3, .58], [.7, .58], [.5, .22]]) { const d = fcx.getImageData(FW*px - 12, FH*py - 12, 24, 24).data; for (let i = 0; i < d.length; i += 4) { if (d[i+3] < 200) continue; r += d[i]; g += d[i+1]; b += d[i+2]; n++; } }
    if (n < 50) return; look.skin = '#' + [r, g, b].map(v => Math.round(v/n).toString(16).padStart(2, '0')).join(''); store.set('pr-look', look); swatches(); renderStyle(); recolor();
  } catch (e) {}
}
function setFaceImg(img, persist = true) {
  faceImg = img; ft = { ox: 0, oy: 0, z: 1, rot: 0 }; $('fZoom').value = 1; $('fRot').value = 0; $('faceBox').hidden = false;
  const was = hasFace; hasFace = true; renderFace(); if (!was) requestBuild(); else buildFaceDecal();
  setTimeout(sampleSkin, 60); if (persist) saveFace();
  notify('Фото лица добавлено. Подвиньте его в превью: глаза на пунктир.', 'Лицо');
}
function saveFace() { try { const c = document.createElement('canvas'), s = Math.min(1, 640/Math.max(iw(faceImg), ih(faceImg))); c.width = iw(faceImg)*s; c.height = ih(faceImg)*s; c.getContext('2d').drawImage(faceImg, 0, 0, c.width, c.height); store.set('pr-face', { src: c.toDataURL('image/jpeg', .85), ft }); } catch (e) {} }
let ftSave; function saveFt() { clearTimeout(ftSave); ftSave = setTimeout(() => { const s = store.get('pr-face', null); if (s) { s.ft = ft; store.set('pr-face', s); } }, 400); }
$('faceFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; $('faceMsg').textContent = ''; loadImageFile(f, img => setFaceImg(img), m => { $('faceMsg').textContent = m; $('faceMsg').className = 'status err'; announce(m); }); };
$('faceCamBtn').onclick = async () => {
  if (!Cam.supported()) { $('faceFile').click(); return; }
  const c = await Cam.open({ facing: 'user', guide: 'face', timer: 3, title: 'Селфи' }); if (c) setFaceImg(c);
};
$('fZoom').oninput = e => { ft.z = +e.target.value; renderFace(); saveFt(); };
$('fRot').oninput = e => { ft.rot = +e.target.value; e.target.setAttribute('aria-valuetext', ft.rot + ' градусов'); renderFace(); saveFt(); };
$('faceDel').onclick = () => { faceImg = null; hasFace = false; $('faceBox').hidden = true; store.del('pr-face'); requestBuild(); notify('Лицо убрано.', 'Лицо'); };
{ const fp = $('facePrev'); let fd = null;
  fp.addEventListener('pointerdown', e => { fd = { x: e.clientX, y: e.clientY }; fp.setPointerCapture(e.pointerId); });
  fp.addEventListener('pointermove', e => { if (!fd || !faceImg) return; const k = FW/fp.clientWidth; ft.ox += (e.clientX - fd.x)*k; ft.oy += (e.clientY - fd.y)*k; fd = { x: e.clientX, y: e.clientY }; renderFace(); });
  const up = () => { if (fd) saveFt(); fd = null; }; fp.addEventListener('pointerup', up); fp.addEventListener('pointercancel', up);
  fp.addEventListener('wheel', e => { if (!faceImg) return; e.preventDefault(); ft.z = clamp(ft.z*(e.deltaY < 0 ? 1.05 : .95), .4, 4); $('fZoom').value = ft.z; renderFace(); saveFt(); }, { passive: false });
  fp.addEventListener('keydown', e => { const d = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] }[e.key]; if (!d || !faceImg) return; e.preventDefault(); ft.ox += d[0]; ft.oy += d[1]; renderFace(); saveFt(); });
}
const SKINS = [['#f3d9c6', 'очень светлая'], ['#e2b391', 'светлая'], ['#c99067', 'средняя'], ['#a46c45', 'смуглая'], ['#7b4b2d', 'тёмная'], ['#4f301e', 'очень тёмная']];
const HAIRS = [['#1e1712', 'чёрные'], ['#3b2a1f', 'тёмно-каштановые'], ['#7a5634', 'русые'], ['#c9a46b', 'светлые'], ['#9c3d1c', 'рыжие'], ['#a3a3a3', 'седые']];
const EYES = [['#5a3b22', 'карие'], ['#7a6a3a', 'ореховые'], ['#4d6a3a', 'зелёные'], ['#3f6a96', 'голубые'], ['#6b7680', 'серые']];
function swatches() {
  for (const [box, list, key, label] of [['skinSw', SKINS, 'skin', 'Кожа'], ['hairSw', HAIRS, 'hair', 'Волосы'], ['eyeSw', EYES, 'eyes', 'Глаза']]) {
    const el = $(box); el.innerHTML = '';
    list.forEach(([c, name], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
      const on = look[key].toLowerCase() === c; b.setAttribute('aria-checked', on); b.tabIndex = on || (!list.some(x => x[0] === look[key].toLowerCase()) && i === 0) ? 0 : -1;
      b.onclick = () => { look[key] = c; store.set('pr-look', look); swatches(); renderStyle(); if (key === 'eyes') setEyes(); else recolor(); announce(`${label}: ${name}`); el.querySelector('[aria-checked="true"]').focus(); };
      b.onkeydown = e => { if (e.key.startsWith('Arrow')) { e.preventDefault(); const j = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length; el.children[j].click(); } };
      el.appendChild(b);
    });
  }
}
function setEyes() { if (viewer) viewer.setEyeColor(lin(look.eyes).map(v => Math.pow(v, 1/2.2))); }

/* ================= загрузка фото ================= */
function loadImageFile(file, ok, fail) {
  if (!file) { fail('Фото не выбрано.'); return; }
  if (file.type && !/^image\//.test(file.type)) { fail('Это не изображение. Выберите фото JPG или PNG.'); return; }
  const done = img => { const k = Math.min(1, 1600/Math.max(iw(img), ih(img)));
    const c = document.createElement('canvas'); c.width = Math.round(iw(img)*k); c.height = Math.round(ih(img)*k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c); };
  const viaReader = () => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => done(im); im.onerror = () => fail('Не удалось открыть фото. Формат HEIC не поддерживается — выберите JPG.'); im.src = r.result; }; r.onerror = () => fail('Не удалось прочитать файл.'); r.readAsDataURL(file); };
  try { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { done(im); URL.revokeObjectURL(u); }; im.onerror = () => { URL.revokeObjectURL(u); viaReader(); }; im.src = u; } catch (e) { viaReader(); }
}

/* ================= скан ================= */
const shots = { front: null, side: null };
let scanVals = null;
const sStatus = (kind, text, cls) => { const el = document.querySelector(`[data-status="${kind}"]`); el.textContent = text || ''; el.className = 'status' + (cls ? ' ' + cls : ''); if (text) announce(text); };
for (const kind of ['front', 'side']) {
  document.querySelector(`[data-file="${kind}"]`).onchange = e => { const f = e.target.files[0]; e.target.value = ''; loadImageFile(f, img => useShot(kind, img), m => sStatus(kind, m, 'err')); };
  document.querySelector(`[data-cam="${kind}"]`).onclick = async () => {
    if (!Cam.supported()) { document.querySelector(`[data-file="${kind}"]`).click(); return; }
    const c = await Cam.open({ facing: 'environment', guide: 'body', timer: 10, title: kind === 'front' ? 'Фото спереди' : 'Фото сбоку' });
    if (c) useShot(kind, c);
  };
}
async function useShot(kind, img) {
  shots[kind] = { img, det: null };
  if (kind === 'front' && window.PhotoFit) PhotoFit.usePhoto(img); // фото спереди становится проекцией
  const cv = document.querySelector(`[data-prev="${kind}"]`); drawPreview(kind);
  cv.hidden = false;
  try {
    const det = await Scan.detect(img, t => sStatus(kind, t));
    shots[kind].det = det; sStatus(kind, 'Фигура найдена.', 'ok'); analyze();
  } catch (e) {
    sStatus(kind, e.message, 'err');
    if (kind === 'front') { showManualOffer(); }
  }
}
function showManualOffer() { $('scanRes').hidden = false; $('scanRows').innerHTML = '<tr><td colspan="3">Автоматический скан не сработал. Нажмите «Поправить вручную» и отметьте точки на фото.</td></tr>'; $('scanApply').hidden = true; }
function drawPreview(kind, ov, labels) {
  const s = shots[kind], cv = document.querySelector(`[data-prev="${kind}"]`); if (!s) return;
  const W = Math.min(cv.parentElement.clientWidth || 360, 520), sc = W/iw(s.img), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W*dpr; cv.height = ih(s.img)*sc*dpr; cv.style.height = (ih(s.img)*sc) + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (s.det) Scan.drawOverlay(g, s.img, s.det, ov, sc*iw(s.img)/s.det.w, labels); else g.drawImage(s.img, 0, 0, W, ih(s.img)*sc);
}
function analyze() {
  const f = shots.front; if (!f || !f.det) return;
  try {
    const r = Scan.measure(f.det, shots.side && shots.side.det, M.height, gender);
    scanVals = {}; for (const k in r.values) scanVals[k] = clampF(k, r.values[k]);
    drawPreview('front', r.overlay, { chest: `${scanVals.chest} см`, waist: `${scanVals.waist} см`, hips: `${scanVals.hips} см` });
    if (shots.side && shots.side.det && r.overlay.side) { const sd = r.overlay.side; drawPreview('side', { rows: { chest: sd.c, waist: sd.w, hips: sd.h } }); }
    showScanTable(r.usedSide ? 'по двум фото' : 'по фото спереди');
  } catch (e) { sStatus('front', e.message, 'err'); showManualOffer(); }
}
let scanQuiet = false; // скан из «Моего фото» показывает свою карточку — без лишнего сообщения
function showScanTable(how) {
  $('scanRes').hidden = false; $('scanApply').hidden = false;
  $('scanRows').innerHTML = ['chest', 'waist', 'hips', 'shoulders', 'inseam'].map(k => `<tr><td>${NAMES[k]}</td><td>${scanVals[k]} см</td><td>${M[k]} см</td></tr>`).join('');
  if (!scanQuiet) notify(`Скан готов ${how}: ` + ['chest', 'waist', 'hips'].map(k => `${NAMES[k].toLowerCase()} ${scanVals[k]}`).join(', ') + '. Нажмите «Применить мерки».', 'Скан');
}
$('scanApply').onclick = () => {
  if (!scanVals) return; Object.assign(M, scanVals); syncInputs(); updateResult(); requestBuild();
  showScanTable(''); notify(`Мерки из скана применены. Размер ${sizes().letter}.`, 'Скан');
};
/* для «Моего фото»: мерки по уже распознанной фигуре */
window.ProScan = {
  measure(img, det) {
    shots.front = { img, det }; scanVals = null; scanQuiet = true;
    try { const r = Scan.measure(det, null, M.height, gender); scanVals = {}; for (const k in r.values) scanVals[k] = clampF(k, r.values[k]);
      showScanTable('по фото спереди'); try { drawPreview('front', r.overlay, { chest: `${scanVals.chest} см`, waist: `${scanVals.waist} см`, hips: `${scanVals.hips} см` }); } catch (e) {} }
    finally { scanQuiet = false; }
    return { values: { ...scanVals }, current: { ...M }, names: NAMES };
  },
  apply() { if (!scanVals) return null; Object.assign(M, scanVals); syncInputs(); updateResult(); requestBuild(); showScanTable(''); return sizes(); },
  size: () => sizes()
};
$('editH').onclick = () => { selectTab('t-measure'); setTimeout(() => $('n-height').focus(), 50); };

/* ручная разметка — запасной путь */
const MAN = ['макушку', 'пол между стопами', 'левый край плеч', 'правый край плеч', 'левый край груди (у подмышек)', 'правый край груди', 'левый край талии (самое узкое)', 'правый край талии', 'левый край бёдер (самое широкое)', 'правый край бёдер', 'пах (где сходятся ноги)'];
let mPts = [], mAim = null, mScale = 1, mImg = null, mLast = null;
const mcv = $('manCv'), mctx = mcv.getContext('2d');
$('scanManual').onclick = () => {
  if (!shots.front) { sStatus('front', 'Сначала добавьте фото спереди.', 'err'); return; }
  mImg = shots.front.img; mPts = []; mAim = null; mLast = document.activeElement; $('manual').hidden = false; $('manDone').hidden = true;
  requestAnimationFrame(() => { layoutMan(); manStep(); $('manClose').focus(); });
};
function closeMan() { $('manual').hidden = true; if (mLast) mLast.focus(); }
$('manClose').onclick = closeMan;
$('manual').addEventListener('keydown', e => { if (e.key === 'Escape') closeMan(); });
function layoutMan() { const W = mcv.parentElement.clientWidth || 600, H = Math.max(360, innerHeight*.66); mScale = Math.min(W/iw(mImg), H/ih(mImg)); const dpr = Math.min(2, devicePixelRatio || 1);
  mcv.style.width = iw(mImg)*mScale + 'px'; mcv.style.height = ih(mImg)*mScale + 'px'; mcv.width = iw(mImg)*mScale*dpr; mcv.height = ih(mImg)*mScale*dpr; mctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawMan(); }
function manStep() { const t = mPts.length < MAN.length ? `Отметьте <b>${MAN[mPts.length]}</b> — точка ${mPts.length + 1} из ${MAN.length}.` : 'Все точки отмечены. Нажмите «Готово».'; $('manStep').innerHTML = t; $('manUndo').disabled = !mPts.length; $('manDone').hidden = mPts.length < MAN.length; announce($('manStep').textContent); }
function drawMan() {
  const w = iw(mImg)*mScale, h = ih(mImg)*mScale; mctx.clearRect(0, 0, w, h); mctx.drawImage(mImg, 0, 0, w, h);
  mctx.strokeStyle = '#ffc21a'; mctx.lineWidth = 3;
  for (const i of [2, 4, 6, 8]) if (mPts[i + 1]) { mctx.beginPath(); mctx.moveTo(mPts[i].x*mScale, mPts[i].y*mScale); mctx.lineTo(mPts[i + 1].x*mScale, mPts[i + 1].y*mScale); mctx.stroke(); }
  mPts.forEach((p, i) => { const x = p.x*mScale, y = p.y*mScale; mctx.fillStyle = '#ffc21a'; mctx.beginPath(); mctx.arc(x, y, 8, 0, 7); mctx.fill(); mctx.fillStyle = '#16181d'; mctx.font = '700 10px sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle'; mctx.fillText(i + 1, x, y); });
  if (mAim) { const ax = mAim.x*mScale, ay = mAim.y*mScale, R = Math.min(72, w*.22), cx = ax < w/2 ? w - R - 8 : R + 8, cy = R + 8, sr = R/(3*mScale);
    mctx.strokeStyle = '#ff3b6b'; mctx.lineWidth = 1; mctx.beginPath(); mctx.moveTo(ax, 0); mctx.lineTo(ax, h); mctx.moveTo(0, ay); mctx.lineTo(w, ay); mctx.stroke();
    mctx.save(); mctx.beginPath(); mctx.arc(cx, cy, R, 0, 7); mctx.clip(); mctx.drawImage(mImg, mAim.x - sr, mAim.y - sr, sr*2, sr*2, cx - R, cy - R, R*2, R*2);
    mctx.beginPath(); mctx.moveTo(cx - R, cy); mctx.lineTo(cx + R, cy); mctx.moveTo(cx, cy - R); mctx.lineTo(cx, cy + R); mctx.stroke(); mctx.restore();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(cx, cy, R, 0, 7); mctx.stroke(); }
}
const aimAt = e => { const r = mcv.getBoundingClientRect(); mAim = { x: clamp((e.clientX - r.left)/mScale, 0, iw(mImg)), y: clamp((e.clientY - r.top)/mScale, 0, ih(mImg)) }; drawMan(); };
mcv.addEventListener('pointerdown', e => { if (mPts.length >= MAN.length) return; e.preventDefault(); try { mcv.setPointerCapture(e.pointerId); } catch (_) {} aimAt(e); });
mcv.addEventListener('pointermove', e => { if (mAim) { e.preventDefault(); aimAt(e); } });
mcv.addEventListener('pointerup', () => { if (!mAim) return; mPts.push(mAim); mAim = null; drawMan(); manStep(); });
mcv.addEventListener('pointercancel', () => { mAim = null; drawMan(); });
mcv.addEventListener('contextmenu', e => e.preventDefault());
$('manUndo').onclick = () => { mPts.pop(); drawMan(); manStep(); };
$('manDone').onclick = () => {
  const p = mPts, fh = Math.abs(p[1].y - p[0].y); if (fh < 20) { $('manStep').textContent = 'Макушка и пол слишком близко — отмените точки и отметьте заново.'; return; }
  const k = M.height/fh, w = i => Math.abs(p[i + 1].x - p[i].x)*k, per = (a, b) => { a /= 2; b /= 2; return Math.PI*(3*(a + b) - Math.sqrt((3*a + b)*(a + 3*b))); };
  const fF = gender === 'f';
  scanVals = { shoulders: clampF('shoulders', w(2)*.95), chest: clampF('chest', per(w(4), w(4)*(fF ? .74 : .71))*1.04), waist: clampF('waist', per(w(6), w(6)*(fF ? .76 : .8))*1.02),
    hips: clampF('hips', per(w(8), w(8)*(fF ? .78 : .74))*1.03), inseam: clampF('inseam', Math.abs(p[1].y - p[10].y)*k) };
  closeMan(); showScanTable('по отмеченным точкам');
};
addEventListener('resize', () => { if (!$('manual').hidden && mImg) layoutMan(); });

/* ================= реалистичная модель: загрузка ================= */
const idb = {
  open() { return new Promise((ok, no) => { try { const r = indexedDB.open('proekciya', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } }); },
  async put(k, v) { const db = await this.open(); return new Promise((ok, no) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(v, k); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); },
  async get(k) { const db = await this.open(); return new Promise((ok, no) => { const r = db.transaction('files').objectStore('files').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async del(k) { const db = await this.open(); return new Promise(ok => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(k); tx.oncomplete = ok; tx.onerror = ok; }); }
};
function tplMsg(t, cls) { $('tplMsg').textContent = t || ''; $('tplMsg').className = 'status' + (cls ? ' ' + cls : ''); if (t) announce(t); }
const baseName = n => n.split(/[\\/]/).pop().toLowerCase();
const blobImage = b => new Promise((ok, no) => { const u = URL.createObjectURL(b), im = new Image(); im.onload = () => ok(im); im.onerror = () => { URL.revokeObjectURL(u); no(new Error('картинка')); }; im.src = u; });
async function templateFromFiles(files) {
  const map = new Map(files.map(f => [baseName(f.name), f.blob || f]));
  const obj = [...map.keys()].find(n => n.endsWith('.obj')); if (!obj) throw new Error('Среди файлов нет .obj');
  return HumanTemplate.load(async n => { const b = map.get(baseName(n)); return b ? await b.text() : null; }, async n => { const b = map.get(baseName(n)); if (!b) throw new Error('нет ' + n); return blobImage(b); }, obj);
}
async function templateFromUrl(name) { // www/models/man.obj — встроено в приложение
  const head = await fetch('models/' + name + '.obj', { method: 'HEAD' }).catch(() => null); if (!head || !head.ok) return null;
  const getText = async n => { const r = await fetch('models/' + baseName(n)); return r.ok ? r.text() : null; };
  const getImage = async n => { for (const p of ['models/textures/' + baseName(n), 'models/' + baseName(n)]) { const r = await fetch(p).catch(() => null); if (r && r.ok) return blobImage(await r.blob()); } throw new Error('нет ' + n); };
  return HumanTemplate.load(getText, getImage, name + '.obj');
}
function applyModelUI() {
  for (const b of document.querySelectorAll('[data-model]')) { b.setAttribute('aria-checked', b.dataset.model === (useTemplate() ? 'real' : 'built')); }
  document.querySelector('[data-model="real"]').disabled = !templates[gender];
  $('tplDel').hidden = !templates[gender] || templates[gender].builtin;
  if (!templates[gender]) tplMsg(`Реалистичная модель (${gender === 'm' ? 'мужчина' : 'женщина'}) ещё не загружена.`);
  else if (!$('tplMsg').classList.contains('err')) tplMsg(`Модель ${gender === 'm' ? 'мужчины' : 'женщины'} загружена${templates[gender].builtin ? ' (встроена в приложение)' : ''}.`, 'ok');
}
for (const b of document.querySelectorAll('[data-model]')) b.onclick = () => {
  if (b.dataset.model === 'real' && !templates[gender]) { tplMsg('Сначала загрузите модель из MakeHuman.', 'err'); return; }
  prefs.model = b.dataset.model; savePrefs(); applyModelUI(); requestBuild();
  announce(b.dataset.model === 'real' ? 'Реалистичная модель' : 'Встроенная модель');
};
$('tplFile').onchange = async e => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  tplMsg('Читаю модель…');
  try {
    const t = await templateFromFiles(files); templates[gender] = t;
    await idb.put('tpl-' + gender, files.map(f => ({ name: f.name, blob: f }))).catch(() => {});
    prefs.model = 'real'; savePrefs(); tplMsg('Модель загружена и подогнана под ваши мерки.', 'ok'); applyModelUI(); requestBuild();
  } catch (err) { tplMsg('Не удалось загрузить модель: ' + err.message + ' Нужен экспорт OBJ из MakeHuman в A-позе.', 'err'); }
};
$('tplDel').onclick = async () => { await idb.del('tpl-' + gender).catch(() => {}); templates[gender] = null; prefs.model = 'built'; savePrefs(); tplMsg('Модель удалена.'); applyModelUI(); requestBuild(); };
async function loadTemplates() {
  for (const g of ['m', 'f']) {
    try { const saved = await idb.get('tpl-' + g); if (saved && saved.length) { templates[g] = await templateFromFiles(saved); continue; } } catch (e) {}
    try { const t = await templateFromUrl(g === 'm' ? 'man' : 'woman'); if (t) { t.builtin = true; templates[g] = t; } } catch (e) { console.warn(e); }
  }
  applyModelUI(); if (useTemplate()) requestBuild();
}

/* ================= стилист ================= */
const month = new Date().getMonth();
const stylePrefs = Object.assign({ style: 'casual', season: [11, 0, 1].includes(month) ? 'winter' : [5, 6, 7].includes(month) ? 'summer' : 'mid', ct: 'auto' }, store.get('pr-style', {}));
let styleRec = null;
function radioGroup(el, list, value, onPick) {
  el.innerHTML = '';
  list.forEach(([v, name], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.textContent = name;
    b.setAttribute('aria-checked', v === value); b.tabIndex = v === value ? 0 : -1;
    b.onclick = () => onPick(v, name);
    b.onkeydown = e => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); const j = (i + d + list.length) % list.length; onPick(list[j][0], list[j][1]); el.children[j].focus(); };
    el.appendChild(b);
  });
}
function renderStyle() {
  const r = sizes();
  styleRec = Stylist.recommend({ gender, M, shape: shapeName(), look, style: stylePrefs.style, season: stylePrefs.season, typeOverride: stylePrefs.ct, sizes: r, jeans: jeans() });
  const R = styleRec;
  $('ctName').textContent = R.typeName; $('ctAbout').textContent = R.about + (stylePrefs.ct === 'auto' ? ' · определено автоматически' : '');
  $('ctSel').value = stylePrefs.ct;
  $('palette').innerHTML = R.palette.map(([c, n]) => `<li style="background:${c}" title="${n}"><span class="sr">${n}</span></li>`).join('');
  $('ctAvoid').textContent = 'Лучше избегать у лица: ' + R.avoidColors + '.';
  $('advShape').textContent = shapeName(); $('advFocus').textContent = R.focus; $('advAvoid').textContent = 'Избегать: ' + R.avoid; $('advHeight').textContent = R.height;
  radioGroup($('styleChips'), Stylist.STYLES, stylePrefs.style, v => { stylePrefs.style = v; store.set('pr-style', stylePrefs); renderStyle(); announce('Стиль: ' + Stylist.STYLES.find(s => s[0] === v)[1] + '. Образы обновлены.'); });
  radioGroup($('seasonSeg'), Stylist.SEASONS, stylePrefs.season, v => { stylePrefs.season = v; store.set('pr-style', stylePrefs); renderStyle(); announce('Сезон: ' + Stylist.SEASONS.find(s => s[0] === v)[1] + '. Образы обновлены.'); });
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  $('outfits').innerHTML = R.outfits.map((o, n) => `
    <article class="outfit${outfit && outfitTitle === o.title ? ' on' : ''}" aria-labelledby="oh${n}">
      <div class="o-head"><h3 id="oh${n}">${esc(o.title)}</h3><span class="o-strip" aria-hidden="true">${o.items.map(i => `<i style="background:${i.color}"></i>`).join('')}</span></div>
      <ul class="o-items">${o.items.map(i => `<li><span class="dot" style="background:${i.color}" aria-hidden="true"></span><div><b>${esc(i.name)}</b>
        <small>${i.slotName} · ${esc(i.colorName)}${i.size ? ' · ' + esc(i.size) : ''}</small>${i.note ? `<small class="fit">${esc(i.note)}</small>` : ''}</div></li>`).join('')}</ul>
      <div class="row"><button type="button" data-read="${n}">Прочитать</button><button type="button" data-shop="${n}">Найти в магазинах</button><button type="button" data-cart="${n}">В корзину</button></div>
    </article>`).join('');
  $('outfitOff').hidden = !outfit;
}
$('outfits').addEventListener('click', e => {
  const ca = e.target.closest('[data-cart]');
  if (ca && styleRec && window.Cart) { (async () => { const o = styleRec.outfits[+ca.dataset.cart]; let n = 0;
    for (const i of o.items) { const kind = i.slot === 'bottom' ? (/джинс/i.test(i.name) ? 'jeans' : 'bottom') : i.slot === 'acc' ? 'acc' : i.slot;
      if (await Cart.add({ title: `${i.name} (${i.colorName})`, kind, hex: i.color, sl: /футболк|поло|шорт|коротк|топ\b|майк/i.test(i.name) ? 's' : 'l', query: `${i.name} ${i.colorName}` }, true)) n++; }
    notify(`Образ «${o.title}» в корзине: вещей ${n}.`, 'Корзина'); })(); return; }
  const sh = e.target.closest('[data-shop]'); if (sh && styleRec && window.ProShop) { ProShop.showOutfit(styleRec.outfits[+sh.dataset.shop].items); return; }
  const t = e.target.closest('[data-try],[data-read]'); if (!t || !styleRec) return;
  const o = styleRec.outfits[+(t.dataset.try ?? t.dataset.read)];
  if (t.dataset.read !== undefined) { const txt = Stylist.speakOutfit(o); say(txt, true); announce(txt); return; }
  outfit = o.model; outfitTitle = o.title; store.set('pr-outfit', outfit); store.set('pr-outfit-title', outfitTitle);
  setView('clothes', true); renderStyle();
  if (!isWide()) setSheet(false);
  notify(`Образ «${o.title}» на модели.`, 'Стилист');
});
$('outfitOff').onclick = () => { outfit = null; outfitTitle = ''; store.del('pr-outfit'); store.del('pr-outfit-title'); recolor(); renderStyle(); notify('Образ снят. В режиме «Одежда» — базовый комплект.', 'Стилист'); };
$('ctSel').onchange = e => { stylePrefs.ct = e.target.value; store.set('pr-style', stylePrefs); renderStyle(); announce('Цветотип: ' + styleRec.typeName + '. Образы обновлены.'); };

/* ================= вкладки и панель ================= */
const tabs = [...document.querySelectorAll('[role="tab"]')];
const isWide = () => matchMedia('(min-width: 900px)').matches;
function setSheet(open) { $('sheet').dataset.open = open; $('grab').setAttribute('aria-expanded', open); }
function selectTab(id, focus) {
  const t = $(id), active = t.getAttribute('aria-selected') === 'true';
  if (active && !isWide()) { setSheet($('sheet').dataset.open !== 'true'); return; }
  for (const b of tabs) { const on = b === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; $(b.getAttribute('aria-controls')).hidden = !on; }
  setSheet(true); $('sheetBody').scrollTop = 0;
  if (id !== 't-measure') unhl(true);
  if (focus) t.focus();
  if (id === 't-scan') $('scanH').textContent = M.height;
}
tabs.forEach((t, i) => {
  t.onclick = () => selectTab(t.id);
  t.onkeydown = e => { const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key]; if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length].id, true); } };
});
$('grab').onclick = () => setSheet($('sheet').dataset.open !== 'true');
{ let sy = null; $('grab').addEventListener('pointerdown', e => sy = e.clientY); addEventListener('pointerup', e => { if (sy == null) return; const d = e.clientY - sy; sy = null; if (Math.abs(d) > 30) setSheet(d < 0); }); }

/* ================= доступность ================= */
function applyPrefs() {
  root.classList.toggle('big', prefs.big); root.classList.toggle('hc', prefs.hc); root.classList.toggle('wizard', prefs.wizard);
  if (prefs.theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = prefs.theme;
  for (const [id, k] of [['tgTts', 'tts'], ['tgWiz', 'wizard'], ['tgBig', 'big'], ['tgHc', 'hc'], ['tgTapes', 'tapes'], ['tgCap', 'captions']]) $(id).setAttribute('aria-pressed', prefs[k]);
  for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-checked', b.dataset.themeSet === prefs.theme);
  $('spinBtn').setAttribute('aria-pressed', prefs.spin);
  if (viewer) {
    viewer.setAuto(prefs.spin && !matchMedia('(prefers-reduced-motion: reduce)').matches); viewer.showTapes(prefs.tapes);
    const dark = prefs.hc || prefs.theme === 'dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    viewer.setTheme(dark ? 'dark' : 'light');
  }
  { const dark = prefs.hc || prefs.theme === 'dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('neon', dark && !prefs.hc);
    const tb = $('themeBtn'); if (tb) { tb.setAttribute('aria-pressed', dark); tb.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема'); } }
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = getComputedStyle(root).getPropertyValue('--surface').trim() || '#16181d';
}
const toggle = (id, k, on, off) => { $(id).onclick = () => { prefs[k] = !prefs[k]; savePrefs(); applyPrefs(); const t = prefs[k] ? on : off; if (t) { announce(t); if (k === 'tts' && prefs.tts) say(t); } }; };
toggle('tgTts', 'tts', 'Озвучка включена. Подсказки и результат будут звучать вслух.', 'Озвучка выключена.');
toggle('tgBig', 'big', 'Крупный текст включён.', 'Крупный текст выключен.');
toggle('tgHc', 'hc', 'Высокий контраст включён.', 'Высокий контраст выключен.');
toggle('tgTapes', 'tapes', 'Ленты показаны.', 'Ленты скрыты.');
toggle('tgCap', 'captions', 'Субтитры включены.', 'Субтитры выключены.');
$('tgWiz').onclick = () => { prefs.wizard = !prefs.wizard; savePrefs(); applyPrefs(); if (prefs.wizard) { cur = 0; selectTab('t-measure'); showStep(); } else announce('Показаны все мерки сразу.'); };
$('themeBtn').onclick = () => { const dark = root.classList.contains('neon') || prefs.theme === 'dark'; prefs.theme = dark ? 'light' : 'dark'; savePrefs(); applyPrefs(); announce(dark ? 'Светлая тема.' : 'Тёмная тема.'); };
for (const b of document.querySelectorAll('[data-theme-set]')) b.onclick = () => { prefs.theme = b.dataset.themeSet; savePrefs(); applyPrefs(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyPrefs);
if (!Native.canListen) $('voiceBtn').title = 'Голосовой ввод доступен в приложении и в Chrome';

/* ================= запуск ================= */
Cam.init();
setGender(gender); syncInputs(); swatches(); applyPrefs(); setView(viewMode, true); updateResult(); setEyes();
if (prefs.wizard) showStep(false);
{ const s = store.get('pr-face', null);
  if (s && s.src) { const im = new Image(); im.onload = () => { faceImg = im; ft = Object.assign({ ox: 0, oy: 0, z: 1, rot: 0 }, s.ft); $('fZoom').value = ft.z; $('fRot').value = ft.rot; $('faceBox').hidden = false; hasFace = true; renderFace(); requestBuild(); }; im.src = s.src; } }
const PHOTO_MODE = (window.PROEKCIYA_CONFIG || {}).mode3d === false;
if (PHOTO_MODE) { document.body.classList.add('photo-mode'); $('fitRoom').hidden = false; }
requestBuild(); if (!PHOTO_MODE) loadTemplates();
if (!isWide() && innerHeight < 560) setSheet(false);
if (!Native.isNative && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
