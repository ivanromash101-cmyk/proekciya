/* ИИ-примерка: ваше фото + фото вещи → вы в этой вещи (FASHN через fal.ai).
 * На ноутбуке запрос идёт через сервер программы (scripts/serve.mjs, ключ в файле fal.key),
 * на телефоне — через сервер ИИ-стилиста (config.chatUrl + /vton, ключ в секретах сервера).
 * Ключ никогда не лежит в приложении. Фото уходит в сервис только после согласия человека.
 * Подключается после app.js и photofit.js. */
(function () {
'use strict';
const CFG = window.PROEKCIYA_CONFIG || {};
const API = (CFG.chatUrl || '').replace(/\/$/, '');
const T = t => (window.I18N ? I18N.tr(t) : t);
const CAT = { top: 'tops', outer: 'tops', bottom: 'bottoms', jeans: 'bottoms', dress: 'one-pieces' };
const CONSENT = 'pr-ai-tryon-consent';

let endpoint, checked = null;
async function ready() { // где работает ИИ-примерка: локальный сервер или сервер в интернете
  if (checked) return checked;
  checked = (async () => {
    try { const r = await fetch('api/tryon-ai/status', { cache: 'no-store' }); if (r.ok && (await r.json()).ok) { endpoint = 'api/tryon-ai'; return true; } } catch (e) {}
    if (API) { try { const r = await fetch(API + '/vton'); if (r.ok && (await r.json()).ok) { endpoint = API + '/vton'; return true; } } catch (e) {} }
    return false;
  })();
  return checked;
}
const supports = kind => !!CAT[kind];

/* ---------- окно результата ---------- */
const stage = document.getElementById('stage') || document.body;
const view = document.createElement('section');
view.className = 'look-view'; view.hidden = true; view.setAttribute('aria-label', 'ИИ-примерка');
view.innerHTML = `
  <div class="lv-pics"><img class="lv-before" alt=""><img class="lv-after" alt=""><div class="lv-scan" aria-hidden="true"></div></div>
  <div class="lv-top"><span class="lv-badge">ИИ-примерка</span><b class="lv-title" data-noi18n></b></div>
  <p class="lv-msg" role="status"></p>
  <div class="lv-bar">
    <button type="button" class="lv-cmp" aria-pressed="false">До / после</button>
    <button type="button" class="lv-save">Сохранить снимок</button>
    <button type="button" class="lv-reset">С моего фото</button>
    <button type="button" class="primary lv-close">Закрыть</button>
  </div>`;
stage.appendChild(view);
const $v = s => view.querySelector(s), before = $v('.lv-before'), after = $v('.lv-after'), msg = $v('.lv-msg');
let lookData = null, busy = false; // текущий образ: следующая вещь надевается поверх него
function show(state) { view.hidden = false; view.dataset.state = state; $v('.lv-cmp').hidden = $v('.lv-save').hidden = state !== 'done'; }
$v('.lv-close').onclick = () => { view.hidden = true; };
$v('.lv-reset').onclick = () => { lookData = null; view.hidden = true; notify(T('Следующая вещь будет примерена на ваше исходное фото'), T('ИИ-примерка')); };
$v('.lv-cmp').onclick = e => { const on = view.classList.toggle('cmp'); e.currentTarget.setAttribute('aria-pressed', on); };
$v('.lv-save').onclick = async () => {
  if (!lookData) return;
  const blob = await (await fetch(lookData)).blob(), file = new File([blob], 'proekciya-primerka.png', { type: blob.type });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Проекция' }); return; } } catch (e) {}
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

/* ---------- согласие на отправку фото ---------- */
function consent() {
  try { if (localStorage.getItem(CONSENT) === 'yes') return Promise.resolve(true); } catch (e) {}
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'ai-consent'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="ac-box"><h3>ИИ-примерка</h3>
      <p>Чтобы показать вас в этой вещи, ваше фото и фото вещи будут отправлены в сервис ИИ-примерки FASHN (через fal.ai). Он вернёт готовую картинку. Одна примерка стоит около 7 центов.</p>
      <p class="note">Фото нужно только для этой примерки. Без согласия используется обычная примерка — вещь накладывается на фото прямо в программе.</p>
      <div class="ac-btns"><button type="button" class="primary" data-a="yes">Согласен, примерить</button><button type="button" data-a="no">Обычная примерка</button></div></div>`;
    document.body.appendChild(d); d.querySelector('[data-a="yes"]').focus();
    d.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return;
      const ok = b.dataset.a === 'yes'; if (ok) { try { localStorage.setItem(CONSENT, 'yes'); } catch (er) {} }
      d.remove(); res(ok); });
  });
}

/* ---------- примерка ---------- */
const shrink = (src, max) => new Promise((ok, no) => { const im = new Image(); im.onload = () => {
  const k = Math.min(1, max/Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.9)); };
  im.onerror = () => no(new Error('image')); im.src = src; });

/* true — примерено ИИ; false — надо использовать обычную примерку */
async function run({ garment, kind, title }) {
  if (busy) { notify(T('Подождите, идёт предыдущая примерка'), T('ИИ-примерка')); return true; }
  if (!supports(kind) || !(await ready())) return false;
  if (!window.PhotoFit || !PhotoFit.hasPerson) { notify(T('Сначала загрузите своё фото в полный рост'), T('ИИ-примерка')); if (window.PhotoFit) PhotoFit.open(); return true; }
  if (!(await consent())) return false;
  busy = true;
  const base = lookData || PhotoFit.personData(1536);
  before.src = base; after.removeAttribute('src'); $v('.lv-title').textContent = title || '';
  msg.textContent = `${T('ИИ примеряет вещь')}… ${T('обычно 10–30 секунд')}`;
  view.classList.remove('cmp'); $v('.lv-cmp').setAttribute('aria-pressed', 'false');
  show('busy'); if (typeof setSheet === 'function' && !(typeof isWide === 'function' && isWide())) setSheet(false);
  announce(T('ИИ примеряет вещь'));
  try {
    const body = JSON.stringify({ model_image: base, garment_image: await shrink(garment, 1024), category: CAT[kind] || 'auto' });
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error === 'no-key' ? T('Не задан ключ сервиса примерки') : r.status === 401 ? T('Ключ сервиса примерки не подходит или закончились деньги на счёте') : j.error === 'timeout' ? T('Сервис не ответил вовремя') : (j.error || ('HTTP ' + r.status))); }
    const blob = await r.blob();
    lookData = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    after.src = lookData; msg.textContent = ''; show('done');
    notify(`«${title || T('Вещь')}» — ${T('примерено')}. ${T('Следующая вещь из корзины наденется поверх')}.`, T('ИИ-примерка'));
  } catch (e) {
    msg.textContent = `${T('Примерка не получилась')}: ${e.message}`; show('err');
    notify(T('Примерка не получилась'), T('ИИ-примерка'));
  } finally { busy = false; }
  return true;
}
window.AITryOn = { ready, supports, run, get busy() { return busy; } };
ready();
})();
