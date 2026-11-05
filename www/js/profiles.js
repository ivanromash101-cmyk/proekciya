/* «Мои мерки»: сохранённые мерки одного или нескольких людей.
 * Мерки на экране можно менять как угодно (вручную, сканом, сбросом) — сохранённая версия
 * меняется только кнопкой «Сохранить мерки». «Вернуть сохранённые» отменяет несохранённые правки.
 * Хранится только на этом устройстве. Подключается после app.js. */
(function () {
'use strict';
const $p = id => document.getElementById(id);
if (!$p('profiles') || !window.Body) return;
const KEY = 'pr-profiles';
const T = t => (window.I18N ? I18N.tr(t) : t);
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let db = load();
if (!db || !Array.isArray(db.list) || !db.list.length) { // первый запуск: текущие мерки становятся «Я», ещё не сохранены
  const cur = Body.get(); db = { active: null, list: [] };
  const me = { id: uid(), name: 'Я', g: cur.g, m: cur.m, saved: null }; db.list.push(me); db.active = me.id; persist();
}
const active = () => db.list.find(p => p.id === db.active) || db.list[0];
const same = (a, b) => { const k = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); for (const x of k) if (Number(a[x]) !== Number(b[x])) return false; return true; };
const dirty = () => { const p = active(), c = Body.get(); return !p.saved || p.g !== c.g || !same(p.m, c.m); };
const when = t => { try { return new Date(t).toLocaleString(window.I18N ? I18N.lang : 'ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

function render() {
  const p = active(), sel = $p('pfSel');
  sel.innerHTML = db.list.map(x => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${x.name.replace(/[<&"]/g, '')}</option>`).join('');
  sel.setAttribute('data-noi18n', '');
  const d = dirty(), st = $p('pfState');
  st.className = 'pf-state' + (d ? ' dirty' : ' ok');
  st.textContent = !p.saved ? T('Мерки ещё не сохранены') : d ? `${T('Есть несохранённые изменения')} · ${T('сохранено')} ${when(p.saved)}` : `${T('Сохранено')} ${when(p.saved)}`;
  $p('pfSave').textContent = T(p.saved ? 'Пересохранить мерки' : 'Сохранить мерки');
  $p('pfSave').disabled = !d;
  $p('pfRevert').hidden = !p.saved || !d;
  $p('pfDel').hidden = db.list.length < 2;
}
Body.onChange.push(render);

$p('pfSave').onclick = () => {
  const p = active(), c = Body.get(), first = !p.saved;
  p.g = c.g; p.m = c.m; p.saved = Date.now(); persist(); render();
  notify(first ? `${T('Мерки сохранены')}: ${p.name}` : `${T('Мерки пересохранены')}: ${p.name}`, T('Мои мерки'));
};
$p('pfRevert').onclick = () => { const p = active(); Body.set(p.g, p.m); render(); notify(T('Вернули сохранённые мерки'), T('Мои мерки')); };
$p('pfSel').onchange = e => {
  const cur = active();
  if (dirty() && cur.saved) { cur.draft = Body.get(); } // несохранённые правки не теряем — вернутся при обратном переключении
  db.active = e.target.value; const p = active(); persist();
  const src = p.draft || p; delete p.draft; Body.set(src.g, src.m); render();
  notify(`${T('Мерки')}: ${p.name}`, T('Мои мерки'));
};
// новый человек
const newRow = $p('pfNewRow');
$p('pfNew').onclick = () => { newRow.hidden = false; $p('pfName').value = ''; $p('pfName').focus(); };
$p('pfNewCancel').onclick = () => { newRow.hidden = true; };
const create = () => {
  const name = $p('pfName').value.trim(); if (!name) { $p('pfName').focus(); return; }
  const c = Body.get(); const p = { id: uid(), name, g: c.g, m: c.m, saved: null };
  db.list.push(p); db.active = p.id; persist(); newRow.hidden = true; render();
  notify(`${T('Новый человек')}: ${name}. ${T('Введите мерки и нажмите «Сохранить мерки»')}.`, T('Мои мерки'));
};
$p('pfNewOk').onclick = create; $p('pfName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); create(); } });
// переименовать
const renRow = $p('pfRenameRow');
$p('pfRenameBtn').onclick = () => { renRow.hidden = !renRow.hidden; $p('pfRename').value = active().name; if (!renRow.hidden) $p('pfRename').focus(); };
const rename = () => { const v = $p('pfRename').value.trim(); if (v) { active().name = v; persist(); } renRow.hidden = true; render(); };
$p('pfRenameOk').onclick = rename; $p('pfRename').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rename(); } });
// удалить (второе нажатие — подтверждение)
let delArmed = null;
$p('pfDel').onclick = () => {
  const b = $p('pfDel');
  if (!delArmed) { b.textContent = `${T('Точно удалить')} «${active().name}»?`; b.classList.add('armed'); delArmed = setTimeout(() => { delArmed = null; b.textContent = T('Удалить этого человека'); b.classList.remove('armed'); }, 4000); return; }
  clearTimeout(delArmed); delArmed = null; b.classList.remove('armed'); b.textContent = T('Удалить этого человека');
  const gone = active(); db.list = db.list.filter(p => p.id !== gone.id); db.active = db.list[0].id; persist();
  const p = active(); Body.set(p.g, p.m); render(); notify(`${T('Удалено')}: ${gone.name}`, T('Мои мерки'));
};
if (window.I18N && I18N.onChange) I18N.onChange(render);
render();
})();
