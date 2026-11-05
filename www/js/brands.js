/* Размер под конкретный бренд по меркам тела.
 * Данные — официальные таблицы размеров брендов (обхваты тела, см). Источники указаны в src.
 * Подключается после app.js: пользуется M (мерки) и gender. */
(function () {
'use strict';
// [размер, верхняя граница диапазона] — берём наименьший размер, в который мерка помещается
const BR = {
  nike: { name: 'Nike', src: 'nike.com/size-fit',
    m: { top: { chest: [['XXS', 80], ['XS', 88.9], ['S', 95.3], ['M', 104.1], ['L', 111.8], ['XL', 123.2], ['2XL', 135.9], ['3XL', 147.3], ['4XL', 160]] },
         bottom: { waist: [['XXS', 64.8], ['XS', 73.7], ['S', 81.3], ['M', 88.9], ['L', 96.5], ['XL', 109.2], ['2XL', 120.7], ['3XL', 133.4], ['4XL', 144.8]],
                   hips: [['XXS', 80], ['XS', 88.9], ['S', 95.3], ['M', 104.1], ['L', 111.8], ['XL', 119.4], ['2XL', 128.3], ['3XL', 135.9], ['4XL', 148.6]] } },
    f: { top: { chest: [['XXS', 74.9], ['XS', 82.6], ['S', 90.2], ['M', 96.5], ['L', 104.1], ['XL', 113], ['XXL', 123.2]] },
         bottom: { waist: [['XXS', 59.7], ['XS', 66], ['S', 73.7], ['M', 80], ['L', 87.6], ['XL', 97.8], ['XXL', 108]],
                   hips: [['XXS', 83.8], ['XS', 90.2], ['S', 97.8], ['M', 104.1], ['L', 111.8], ['XL', 119.4], ['XXL', 127]] } } },
  adidas: { name: 'adidas', src: 'adidas size charts',
    m: { top: { chest: [['XS', 83.8], ['S', 94], ['M', 101.6], ['L', 111.8], ['XL', 121.9], ['2XL', 132.1], ['3XL', 147.3]] },
         bottom: { waist: [['XS', 73.7], ['S', 81.3], ['M', 88.9], ['L', 99.1], ['XL', 109.2], ['2XL', 119.4], ['3XL', 134.6]],
                   hips: [['XS', 86.4], ['S', 94], ['M', 101.6], ['L', 111.8], ['XL', 121.9], ['2XL', 129.5], ['3XL', 142.2]] } },
    f: { top: { chest: [['XXS', 75.9], ['XS', 81.3], ['S', 88.9], ['M', 94], ['L', 101.6], ['XL', 109.2], ['2XL', 116.8]] },
         bottom: { waist: [['XXS', 59.9], ['XS', 66], ['S', 71.1], ['M', 78.7], ['L', 86.4], ['XL', 94], ['2XL', 104.1]],
                   hips: [['XXS', 85.1], ['XS', 91.4], ['S', 96.5], ['M', 104.1], ['L', 109.2], ['XL', 116.8], ['2XL', 124.5]] } } },
  levis: { name: "Levi's", src: 'levi.com/info/sizechart',
    m: { top: { chest: [['S', 94], ['M', 101.6], ['L', 109.2], ['XL', 116.8]] },
         // джинсы: размер W → обхват талии и ягодиц тела; берём ближайший, где мерка не больше значения (+1,3 см допуск)
         jeans: { pts: true, waist: [[28, 71.1], [29, 73.7], [30, 76.2], [31, 78.7], [32, 81.3], [33, 83.8], [34, 86.4], [35, 89], [36, 91.4], [38, 96.5], [40, 101.6], [42, 106.7], [44, 111.8], [46, 116.7], [48, 121.9]],
                  hips: [[28, 87.5], [29, 90.2], [30, 92.7], [31, 95.3], [32, 97.8], [33, 100.3], [34, 103], [35, 105.5], [36, 108], [38, 113], [40, 118], [42, 123.2], [44, 128.3], [46, 133.5], [48, 138.5]],
                  len: h => h < 172.7 ? 30 : h < 182.8 ? 32 : h < 193 ? 34 : h < 198.1 ? 36 : 38 } },
    f: { top: { pts: true, chest: [['S', 89], ['M', 94], ['L', 100], ['XL', 108]] },
         jeans: { pts: true, waist: [[24, 64], [25, 66], [26, 69], [27, 72], [28, 74], [29, 77], [30, 79], [31, 83], [32, 87], [33, 90], [34, 96]],
                  hips: [[24, 86], [25, 89], [26, 91.5], [27, 94], [28, 96.5], [29, 99], [30, 101], [31, 105], [32, 109], [33, 113], [34, 118]],
                  len: h => h < 155 ? 28 : h < 162 ? 30 : h < 173 ? 32 : 34 } } },
  jackjones: { name: 'Jack & Jones', src: 'Jack & Jones size guide', alias: /jack\s*(&|and|en|und)?\s*jones|jack&jones|j&j/i,
    m: { top: { pts: true, chest: [['XS', 92], ['S', 96], ['M', 100], ['L', 104], ['XL', 112], ['XXL', 120]] },
         bottom: { pts: true, waist: [['XS', 76], ['S', 81], ['M', 86], ['L', 91], ['XL', 96], ['XXL', 101]] },
         jeans: { pts: true, waist: [[28, 76], [29, 78.6], [30, 81], [31, 83.5], [32, 86], [33, 88.5], [34, 91], [36, 96], [38, 101], [40, 106]] } } }
};
const ALIAS = { nike: /\bnike\b/i, adidas: /\badidas\b/i, levis: /levi'?s|\blevis\b|левис/i };

/* наименьший размер, в который мерка помещается; pts — в таблице точки, а не диапазоны */
function fit(table, v, pts) {
  if (!table || v == null) return null;
  const tol = pts ? 1.3 : 0;
  for (let i = 0; i < table.length; i++) if (v <= table[i][1] + tol) return { i, size: table[i][0], over: false };
  return { i: table.length - 1, size: table[table.length - 1][0], over: true };
}
const worst = (...r) => { const l = r.filter(Boolean); return l.length ? l.reduce((a, b) => (b.i > a.i ? b : a)) : null; }; // по самой большой мерке

function brandSizes(key, Mx, g) {
  const b = BR[key], t = b && b[g]; if (!t) return null;
  const out = { name: b.name, src: b.src };
  if (t.top) { const r = fit(t.top.chest, Mx.chest, t.top.pts); if (r) out.top = r.size + (r.over ? '+' : ''); }
  if (t.bottom) { const r = worst(fit(t.bottom.waist, Mx.waist, t.bottom.pts), fit(t.bottom.hips, Mx.hips, t.bottom.pts)); if (r) out.bottom = r.size + (r.over ? '+' : ''); }
  if (t.jeans) {
    const r = worst(fit(t.jeans.waist, Mx.waist, true), t.jeans.hips && fit(t.jeans.hips, Mx.hips, true));
    const L = t.jeans.len ? t.jeans.len(Mx.height) : Math.round(Mx.inseam/2.54);
    if (r) out.jeans = `W${r.size}${r.over ? '+' : ''} L${L}`, out.jW = r.size, out.jL = L;
  }
  return out;
}
const keyOf = text => { if (!text) return null; for (const k in BR) if ((BR[k].alias || ALIAS[k] || new RegExp(BR[k].name, 'i')).test(text)) return k; return null; };

window.Brands = {
  list: () => Object.keys(BR),
  name: k => BR[k] && BR[k].name,
  keyOf,
  sizes: (k, Mx, g) => brandSizes(k, Mx || M, g || gender),
  /* размер вещи данного вида для бренда из текста; null — бренд неизвестен или вида нет в таблице */
  forKind(text, kind) {
    const k = keyOf(text); if (!k) return null;
    const s = brandSizes(k, M, gender); if (!s) return null;
    if (kind === 'jeans' && s.jeans) return { label: s.jeans, z: `${s.jW}x${s.jL}`, brand: s.name };
    if ((kind === 'bottom') && s.bottom) return { label: s.bottom, z: s.bottom, brand: s.name };
    if ((kind === 'top' || kind === 'outer' || kind === 'dress') && s.top) return { label: s.top, z: s.top, brand: s.name };
    return null;
  }
};
})();
