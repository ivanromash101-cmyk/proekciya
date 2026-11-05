/* Приветствие при первом запуске: что умеет программа, как работает ИИ-стилист, выбор языка и пола.
 * Снова открывается кнопкой «О программе» на вкладке «Доступ». */
(function () {
'use strict';
const KEY = 'pr-welcome-v1';
const box = document.getElementById('welcome'); if (!box) return;
const $w = id => document.getElementById(id);

function greet() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Доброе утро!' : h >= 12 && h < 18 ? 'Добрый день!' : h >= 18 && h < 23 ? 'Добрый вечер!' : 'Доброй ночи!';
}
function syncLang() {
  const cur = window.I18N ? I18N.lang : 'ru';
  for (const b of $w('wLangs').children) b.setAttribute('aria-pressed', b.dataset.lang === cur);
}
function syncGender() { for (const g of ['m', 'f']) $w('wg-' + g).setAttribute('aria-pressed', gender === g); }

let lastFocus = null;
function open() {
  lastFocus = document.activeElement;
  $w('wGreet').textContent = greet();
  syncLang(); syncGender();
  box.hidden = false; document.body.classList.add('welcome-open');
  setTimeout(() => $w('wTitle').focus(), 30);
}
function close() {
  store.set(KEY, true);
  box.hidden = true; document.body.classList.remove('welcome-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

if (window.I18N) {
  $w('wLangs').innerHTML = I18N.langs.map(([c, name]) => `<button type="button" data-lang="${c}" lang="${c}" data-noi18n aria-pressed="false">${name}</button>`).join('');
  $w('wLangs').addEventListener('click', async e => { const b = e.target.closest('[data-lang]'); if (!b) return; await I18N.setLang(b.dataset.lang); syncLang(); });
  I18N.onChange(syncLang);
}
for (const g of ['m', 'f']) $w('wg-' + g).onclick = () => { chooseGender(g); syncGender(); };
$w('wStart').onclick = close;
$w('wClose').onclick = close;
box.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key !== 'Tab') return;
  const f = [...box.querySelectorAll('button, select, [tabindex="0"]')].filter(x => !x.disabled && x.offsetParent);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
});
const about = $w('aboutBtn'); if (about) about.onclick = open;
if (!store.get(KEY, false)) (window.I18N ? I18N.ready : Promise.resolve()).then(open);
window.ProWelcome = { open, close };
})();
