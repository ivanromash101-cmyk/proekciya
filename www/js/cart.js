/* Корзина «Проекции»: понравившиеся вещи из поиска, примерки и образов стилиста.
 * Хранится на устройстве. Покупка — на сайте магазина: у вещи есть ссылка на товар (если клиент её вставил)
 * или поиск с его размером. Из корзины вещь можно снова надеть на модель или надеть всё сразу.
 * Подключается после app.js, tryon.js и shop.js. */
(function () {
'use strict';
const KEY = 'pr-cart', MAX = 60;
const $c = id => document.getElementById(id);
const box = $c('cartBox'); if (!box) return;
let items = store.get(KEY, []);
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
const save = () => { try { store.set(KEY, items); } catch (e) { items.forEach(i => { i.thumb = null; }); store.set(KEY, items); } };

/* уменьшенная картинка товара для корзины */
function thumbOf(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => { const k = 120/Math.max(im.width, im.height), c = document.createElement('canvas'); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.75)); };
    im.onerror = () => res(null); im.src = src;
  });
}

async function add(it, quiet) {
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: String(it.title || 'Вещь').slice(0, 80), kind: it.kind || 'top', hex: it.hex || null,
    sl: it.sl || null, cut: it.cut || null, ol: it.ol || null,
    size: it.size || (window.ProShop ? ProShop.sizeFor(it.kind) : ''), query: it.query || it.title || '',
    url: safeUrl(it.url || ''), thumb: await thumbOf(it.photo), own: !!it.own, added: Date.now()
  };
  const same = items.find(x => x.title === item.title && x.kind === item.kind && x.hex === item.hex && x.url === item.url);
  if (same) { if (!quiet) notify(`«${item.title}» уже в корзине.`, 'Корзина'); return false; }
  if (it.photo) { try { await idb.put('cart-img-' + item.id, it.photo); item.hasImg = true; } catch (e) {} }
  items.unshift(item); items = items.slice(0, MAX); save(); render();
  if (!quiet) notify(`«${item.title}» в корзине.`, 'Корзина');
  return true;
}
function remove(id) { items = items.filter(x => x.id !== id); idb.del('cart-img-' + id).catch(() => {}); save(); render(); }

function render() {
  const n = items.length;
  for (const b of document.querySelectorAll('.cart-count')) { b.textContent = n; b.hidden = !n; }
  $c('cartBtn').setAttribute('aria-label', 'Корзина: ' + n);
  $c('cartN').textContent = n;
  $c('cartEmpty').hidden = !!n;
  $c('cartClear').hidden = !n;
  $c('cartList').innerHTML = items.map(i => `
    <li class="cart-item">
      ${i.thumb ? `<img src="${esc(i.thumb)}" alt="" class="ci-pic">` : `<span class="ci-pic ci-sw" style="background:${esc(i.hex || '#ccc')}" aria-hidden="true"></span>`}
      <div class="ci-body">
        <b${i.own ? ' data-noi18n' : ''}>${esc(i.title)}</b>
        <small>${i.size ? `<span>Размер:</span> <span data-noi18n>${esc(i.size)}</span>` : ''}</small>
        <div class="ci-actions">
          ${i.url ? `<a class="small shop-btn" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Открыть товар</a>`
                  : `<button type="button" class="small" data-find="${i.id}">Найти в магазинах</button>`}
          <button type="button" class="small ghost" data-del="${i.id}" aria-label="Убрать из корзины"${i.own ? '' : ` title="${esc(i.title)}"`}>Убрать</button>
        </div>
      </div>
    </li>`).join('');
}

box.addEventListener('click', e => {
  const t = e.target.closest('[data-wear],[data-find],[data-del]'); if (!t) return;
  const id = t.dataset.wear || t.dataset.find || t.dataset.del, i = items.find(x => x.id === id); if (!i) return;
  if (t.dataset.del) { remove(id); announce(`«${i.title}» убрана из корзины.`); }
  else if (t.dataset.wear) wear(i);
  else if (t.dataset.find) ProShop.showItems([{ title: i.title, query: i.query, kind: i.kind }]);
});
async function wear(i) {
  // реалистичная ИИ-примерка на ваше фото — если сервис настроен и есть фото вещи
  if (window.AITryOn && AITryOn.supports(i.kind) && window.PhotoFit && PhotoFit.hasPerson) {
    const src = i.hasImg ? await idb.get('cart-img-' + i.id).catch(() => null) : null;
    if (!src) { TryOn.open({ kind: i.kind, hex: i.hex, title: i.title, url: i.url }); return; } // нужна фотография товара
    if (await AITryOn.run({ garment: src, kind: i.kind, title: i.title })) return;
  }
  if (window.PhotoFit && PhotoFit.active) {
    const src = i.hasImg ? await idb.get('cart-img-' + i.id).catch(() => null) : null;
    if (src) { await PhotoFit.addGarment({ src, kind: i.kind, title: i.title }); if (!isWide()) setSheet(false); }
    else TryOn.open({ kind: i.kind, hex: i.hex, title: i.title, url: i.url }); // нужна фотография товара
    return;
  }
  TryOn.apply({ kind: i.kind, hex: i.hex, sl: i.sl, cut: i.cut, ol: i.ol, title: i.title });
}
if ($c('cartAll')) $c('cartAll').onclick = async () => { // кнопка убрана из корзины
  if (window.PhotoFit && PhotoFit.active) {
    const withImg = items.filter(i => i.hasImg && TryOn.WEARABLE.includes(i.kind));
    if (!withImg.length) { notify('В корзине нет вещей с фото товара. Добавьте их через «Примерить товар по фото».', 'Корзина'); return; }
    for (const i of withImg.reverse()) await wear(i);
    return;
  }
  const order = ['dress', 'bottom', 'jeans', 'top', 'outer', 'shoes'];
  const wear = items.filter(i => TryOn.WEARABLE.includes(i.kind)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  // из одинаковых по виду вещей берём самую свежую
  const seen = new Set(), pick = []; for (const i of [...wear].sort((a, b) => b.added - a.added)) { const k = i.kind === 'jeans' ? 'bottom' : i.kind; if (!seen.has(k)) { seen.add(k); pick.push(i); } }
  pick.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const i of pick) TryOn.apply({ kind: i.kind, hex: i.hex, sl: i.sl, cut: i.cut, ol: i.ol, title: 'Образ из корзины' });
};
$c('cartClear').onclick = () => { for (const i of items) idb.del('cart-img-' + i.id).catch(() => {}); items = []; save(); render(); announce('Корзина очищена.'); };
$c('cartBtn').onclick = () => { selectTab('t-shop'); setSheet(true); setTimeout(() => box.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); };

render();
window.Cart = { add, remove, get items() { return items.slice(); } };
})();
