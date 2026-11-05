/* Лёгкая фоновая музыка «Проекции».
 * Музыка не из файла: программа сама играет спокойный эмбиент (мягкие аккорды + редкие ноты с эхом)
 * через Web Audio — без скачиваний и без прав на чужие треки.
 * Включается только кнопкой (браузеры не дают звуку стартовать самому), выбор запоминается.
 * Пока голос программы что-то читает — музыка становится тише. */
(function () {
'use strict';
const KEY = 'pr-music', btn = document.getElementById('musicBtn'), tg = document.getElementById('tgMusic'), vol = document.getElementById('musicVol');
if (!btn) return;
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const saveS = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
const st = Object.assign({ on: false, vol: 0.5 }, load());

let ac = null, master = null, wet = null, timer = null, step = 0, nextT = 0;
const BEAT = 0.75; // секунда на долю — медленно и спокойно
// аккорды (частоты MIDI): Cmaj7 – Am7 – Fmaj7 – G6, по 8 долей каждый
const CHORDS = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 64]];
const SCALE = [72, 74, 76, 79, 81, 84, 86, 88]; // пентатоника до мажор — любые ноты звучат вместе мягко
const hz = m => 440*Math.pow(2, (m - 69)/12);

function impulse(sec) { // «комната» для эха: затухающий шум
  const n = Math.round(ac.sampleRate*sec), b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random()*2 - 1)*Math.pow(1 - i/n, 2.6); }
  return b;
}
function setup() {
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
  const rev = ac.createConvolver(); rev.buffer = impulse(3.5);
  wet = ac.createGain(); wet.gain.value = 0.55;
  wet.connect(rev); rev.connect(master); master.connect(comp); comp.connect(ac.destination);
}
function pad(midi, t, dur) { // мягкий аккордовый тон: два чуть расстроенных генератора за фильтром
  const g = ac.createGain(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.3;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 1.6); g.gain.setValueAtTime(0.045, t + dur - 1.8); g.gain.linearRampToValueAtTime(0, t + dur);
  for (const det of [-5, 6]) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(midi); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.1); }
  f.connect(g); g.connect(master); g.connect(wet);
}
function pluck(midi, t) { // редкая «капля» сверху
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + 2.4);
  o.connect(g); g.connect(master); g.connect(wet); o.start(t); o.stop(t + 2.5);
}
function bass(midi, t, dur) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = hz(midi - 12);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.1);
}
function schedule() { // планируем ноты на пару секунд вперёд
  while (nextT < ac.currentTime + 2) {
    const bar = Math.floor(step/8) % CHORDS.length, beat = step % 8, ch = CHORDS[bar];
    if (beat === 0) { const d = BEAT*8 + 1.5; ch.forEach(m => pad(m, nextT, d)); bass(ch[0], nextT, BEAT*8); }
    if (beat % 2 === 1 && Math.random() < 0.55) pluck(SCALE[Math.floor(Math.random()*SCALE.length)], nextT + Math.random()*0.15);
    nextT += BEAT; step++;
  }
}
const level = () => st.vol*0.35*(speaking() ? 0.3 : 1);
const speaking = () => { try { return !!(window.speechSynthesis && speechSynthesis.speaking); } catch (e) { return false; } };
function fadeTo(v, sec) { const t = ac.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(v, t + sec); }

async function start() {
  if (!ac) setup();
  if (ac.state !== 'running') await ac.resume();
  if (!timer) { nextT = ac.currentTime + 0.1; timer = setInterval(() => { schedule(); fadeTo(level(), 0.6); }, 500); schedule(); }
  fadeTo(level(), 2.5);
}
function stop() {
  if (!ac) return;
  fadeTo(0, 1.2);
  setTimeout(() => { if (!st.on && timer) { clearInterval(timer); timer = null; ac.suspend(); } }, 1300);
}
function ui() {
  btn.setAttribute('aria-pressed', st.on); btn.classList.toggle('playing', st.on); if (tg) tg.setAttribute('aria-pressed', st.on);
  const lab = (window.I18N ? I18N.tr(st.on ? 'Выключить музыку' : 'Включить музыку') : (st.on ? 'Выключить музыку' : 'Включить музыку'));
  btn.setAttribute('aria-label', lab); btn.title = lab;
  if (vol) vol.value = Math.round(st.vol*100);
}
const toggle = () => { st.on = !st.on; saveS(st); ui(); st.on ? start() : stop(); if (typeof announce === 'function') announce(st.on ? 'Музыка включена.' : 'Музыка выключена.'); };
btn.onclick = toggle; if (tg) tg.onclick = toggle;
if (vol) vol.oninput = () => { st.vol = vol.value/100; saveS(st); if (st.on && ac) fadeTo(level(), 0.3); };
// музыка была включена в прошлый раз — продолжаем с первого касания (сам звук браузер не пустит)
if (st.on) { const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); if (st.on) start(); };
  addEventListener('pointerdown', go, true); addEventListener('keydown', go, true); }
// свернули программу — тишина; вернулись — играем дальше
document.addEventListener('visibilitychange', () => { if (!ac || !st.on) return; if (document.hidden) ac.suspend(); else ac.resume(); });
ui();
if (window.I18N && I18N.onChange) I18N.onChange(ui);
window.Music = { get on() { return st.on; } };
})();
