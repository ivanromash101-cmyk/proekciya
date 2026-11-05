/* Скидки и распродажи: ИИ-агент ищет в интернете новости магазинов страны и говорит,
 * где и когда выгоднее купить. Нужен ИИ-сервер (config.chatUrl или ключ на ноутбуке).
 * Можно включить ежедневную проверку — результат приходит сообщением при первом запуске за день.
 * Подключается после geo.js и shop.js. */
(function () {
'use strict';
const CFG = window.PROEKCIYA_CONFIG || {};
const API = (CFG.chatUrl || '').replace(/\/$/, '');
const T = t => (window.I18N ? I18N.tr(t) : t);
const KEY = 'pr-deals', AUTO = 'pr-deals-auto';
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const today = () => new Date().toISOString().slice(0, 10);
const COUNTRY = { BE: 'Belgium', NL: 'Netherlands', DE: 'Germany', FR: 'France', PL: 'Poland', UK: 'United Kingdom', GB: 'United Kingdom', RU: 'Russia', ES: 'Spain', IT: 'Italy', PT: 'Portugal', AT: 'Austria', CH: 'Switzerland', IE: 'Ireland', SE: 'Sweden', DK: 'Denmark', CZ: 'Czechia', LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia' };
const ONLINE = { BE: ['Zalando', 'bol.com', 'Vinted', 'ASOS'], NL: ['Zalando', 'bol.com', 'ASOS'], DE: ['Zalando', 'About You', 'ASOS'], FR: ['Zalando', 'ASOS'], PL: ['Zalando', 'Allegro'], UK: ['ASOS', 'Amazon'], RU: ['Wildberries', 'Ozon', 'Lamoda'] };

const panel = document.getElementById('p-shop');
const box = document.createElement('section');
box.className = 'deals-box'; box.setAttribute('aria-labelledby', 'dealsH');
box.innerHTML = `
  <h2 class="sec-title" id="dealsH">Скидки и распродажи</h2>
  <p class="note" id="dealsLead">ИИ-агент ищет в интернете свежие новости магазинов вашей страны и подсказывает, где и когда купить дешевле.</p>
  <p class="deals-sum" id="dealsSum" data-noi18n></p>
  <ul class="deals-list" id="dealsList"></ul>
  <p class="deals-src" id="dealsSrc"></p>
  <p class="note" id="dealsMsg" role="status"></p>
  <div class="deals-btns"><button type="button" class="primary" id="dealsGo">Найти скидки</button></div>
  <label class="wx-auto"><input type="checkbox" id="dealsAuto"> Проверять скидки раз в день и сообщать</label>`;
const geoBox = panel && panel.querySelector('.geo-box');
if (panel) panel.insertBefore(box, geoBox ? geoBox.nextSibling : panel.firstChild);
const $d = id => document.getElementById(id);

function render(r) {
  if (!r) return;
  $d('dealsSum').textContent = r.summary || '';
  $d('dealsList').innerHTML = (r.deals || []).map(d => `<li>
    <div class="dl-top"><b data-noi18n>${esc(d.shop)}</b>${d.discount ? `<span class="dl-off" data-noi18n>${esc(d.discount)}</span>` : ''}</div>
    <span data-noi18n>${esc(d.what)}</span>${d.when ? ` <small data-noi18n>· ${esc(d.when)}</small>` : ''}
    ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(T('Подробнее'))}</a>` : ''}</li>`).join('');
  $d('dealsSrc').innerHTML = (r.sources || []).length ? `${esc(T('Источники'))}: ` + r.sources.slice(0, 6).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-noi18n>${esc((s.title || s.url).slice(0, 60))}</a>`).join(' · ') : '';
  $d('dealsMsg').textContent = `${T('Проверено')}: ${new Date(r.at).toLocaleString(window.I18N ? I18N.lang : 'ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}
async function find(auto) {
  if (!API) { $d('dealsMsg').textContent = T('Поиск скидок работает с ИИ-сервером: добавьте ключ (см. README, раздел «ИИ-стилист»).'); return null; }
  const g = window.Geo && Geo.get();
  const rg = g ? Geo.regionOf(g.country) : (document.getElementById('shopRegion') || {}).value || 'BE';
  const gr = (window.Geo && Geo.groupsOf(rg)) || {}; // для поиска скидок — главные магазины, без повторов
  const shops = [...new Set([...(gr.market || []), ...(gr.mass || []), ...(gr.sport || []).slice(0, 2), ...(gr.shoes || []).slice(0, 1)].map(s => s.name).concat(ONLINE[rg] || []))].slice(0, 14);
  $d('dealsGo').disabled = true; $d('dealsMsg').textContent = T('ИИ ищет скидки… обычно 20–60 секунд');
  try {
    const res = await fetch(API + '/deals', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: window.I18N ? I18N.lang : 'ru', cc: g ? g.country : rg, country: (g && g.countryName) || COUNTRY[rg] || rg, city: g ? g.city : '', shops }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    const r = { ...j, at: Date.now(), day: today() }; lsSet(KEY, r); render(r);
    const top = (r.deals || [])[0];
    notify(top ? `${T('Скидки')}: ${top.shop}${top.discount ? ' — ' + top.discount : ''}. ${r.summary || ''}` : (r.summary || T('Свежих скидок не найдено')), T('Скидки'));
    return r;
  } catch (e) { $d('dealsMsg').textContent = `${T('Не удалось найти скидки')}: ${e.message}`; return null; }
  finally { $d('dealsGo').disabled = false; }
}
$d('dealsGo').onclick = () => find(false);
$d('dealsAuto').checked = !!lsGet(AUTO, false);
$d('dealsAuto').onchange = e => lsSet(AUTO, e.target.checked);
const cached = lsGet(KEY, null);
if (cached) render(cached);
if (!API) { $d('dealsMsg').textContent = T('Поиск скидок работает с ИИ-сервером: добавьте ключ (см. README, раздел «ИИ-стилист»).'); }
// раз в день — сам, через несколько секунд после запуска (не мешает загрузке)
if (API && lsGet(AUTO, false) && (!cached || cached.day !== today())) setTimeout(() => find(true), 8000);
window.Deals = { find };
})();
