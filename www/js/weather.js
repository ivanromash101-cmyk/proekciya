/* Погода на сегодня и совет, что надеть. Прогноз — Open-Meteo (без ключа) по местоположению из geo.js.
 * Текст собирается на языке программы и может читаться вслух (кнопкой или при первом касании утром).
 * Подключается после geo.js. */
(function () {
'use strict';
const T = t => (window.I18N ? I18N.tr(t) : t);
const KEY = 'pr-weather', PREF = 'pr-weather-speak';
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- тексты на шести языках ---------- */
const L = {
  ru: { today: (c, a, b) => `Сегодня${c ? ' в ' + c : ''} от ${a} до ${b} °C`, feels: v => `ощущается до ${v}`,
    sky: { clear: 'ясно', cloudy: 'облачно', fog: 'туман', drizzle: 'морось', rain: 'дождь', snow: 'снег', showers: 'ливни', storm: 'гроза' },
    rainP: (p, h) => `вероятность осадков ${p} %${h ? ', больше всего около ' + h : ''}`, wind: v => `ветер до ${v} км/ч`, adv: 'Совет', and: ' и ',
    cl: { frost: 'тёплый пуховик или зимнее пальто, шапку, шарф и перчатки, зимнюю обувь', cold: 'тёплую куртку или пальто, свитер и закрытую обувь', cool: 'лёгкую куртку или тренч и вещи с длинным рукавом', mild: 'свитшот, кардиган или джинсовую куртку', warm: 'футболку и лёгкие брюки или юбку', hot: 'лёгкую дышащую одежду из льна или хлопка, кепку и солнечные очки',
      rain: 'возьмите зонт или непромокаемую куртку и обувь, которая не промокнет', wind: 'выберите вещь, которая защищает от ветра', layers: 'одевайтесь слоями — днём и вечером большая разница', uv: 'нужен солнцезащитный крем' }, wear: 'наденьте' },
  en: { today: (c, a, b) => `Today${c ? ' in ' + c : ''} from ${a} to ${b} °C`, feels: v => `feels like up to ${v}`,
    sky: { clear: 'clear', cloudy: 'cloudy', fog: 'fog', drizzle: 'drizzle', rain: 'rain', snow: 'snow', showers: 'showers', storm: 'thunderstorms' },
    rainP: (p, h) => `${p} % chance of rain${h ? ', most likely around ' + h : ''}`, wind: v => `wind up to ${v} km/h`, adv: 'Tip', and: ' and ',
    cl: { frost: 'a warm puffer or winter coat, a hat, scarf and gloves, and winter boots', cold: 'a warm jacket or coat, a jumper and closed shoes', cool: 'a light jacket or trench coat and long sleeves', mild: 'a sweatshirt, cardigan or denim jacket', warm: 'a T-shirt and light trousers or a skirt', hot: 'light breathable linen or cotton clothes, a cap and sunglasses',
      rain: 'take an umbrella or a waterproof jacket and shoes that stay dry', wind: 'choose something windproof', layers: 'dress in layers: day and evening differ a lot', uv: 'use sunscreen' }, wear: 'wear' },
  nl: { today: (c, a, b) => `Vandaag${c ? ' in ' + c : ''} van ${a} tot ${b} °C`, feels: v => `voelt als tot ${v}`,
    sky: { clear: 'helder', cloudy: 'bewolkt', fog: 'mist', drizzle: 'motregen', rain: 'regen', snow: 'sneeuw', showers: 'buien', storm: 'onweer' },
    rainP: (p, h) => `${p} % kans op neerslag${h ? ', vooral rond ' + h : ''}`, wind: v => `wind tot ${v} km/u`, adv: 'Tip', and: ' en ',
    cl: { frost: 'een warme donsjas of winterjas, muts, sjaal en handschoenen, en winterschoenen', cold: 'een warme jas, een trui en dichte schoenen', cool: 'een lichte jas of trenchcoat en lange mouwen', mild: 'een sweater, vest of jeansjasje', warm: 'een T-shirt en een lichte broek of rok', hot: 'lichte, luchtige kleding van linnen of katoen, een pet en een zonnebril',
      rain: 'neem een paraplu of regenjas en schoenen die droog blijven', wind: 'kies iets dat tegen de wind beschermt', layers: 'kleed je in laagjes: dag en avond verschillen sterk', uv: 'gebruik zonnebrand' }, wear: 'trek aan' },
  fr: { today: (c, a, b) => `Aujourd'hui${c ? ' à ' + c : ''} de ${a} à ${b} °C`, feels: v => `ressenti jusqu'à ${v}`,
    sky: { clear: 'ciel dégagé', cloudy: 'nuageux', fog: 'brouillard', drizzle: 'bruine', rain: 'pluie', snow: 'neige', showers: 'averses', storm: 'orages' },
    rainP: (p, h) => `${p} % de risque de pluie${h ? ', surtout vers ' + h : ''}`, wind: v => `vent jusqu'à ${v} km/h`, adv: 'Conseil', and: ' et ',
    cl: { frost: 'une doudoune ou un manteau d’hiver, bonnet, écharpe et gants, et des chaussures d’hiver', cold: 'une veste chaude ou un manteau, un pull et des chaussures fermées', cool: 'une veste légère ou un trench et des manches longues', mild: 'un sweat, un cardigan ou une veste en jean', warm: 'un T-shirt et un pantalon léger ou une jupe', hot: 'des vêtements légers en lin ou coton, une casquette et des lunettes de soleil',
      rain: 'prenez un parapluie ou une veste imperméable et des chaussures qui restent sèches', wind: 'choisissez un vêtement coupe-vent', layers: 'superposez les couches : grande différence entre le jour et le soir', uv: 'mettez de la crème solaire' }, wear: 'portez' },
  de: { today: (c, a, b) => `Heute${c ? ' in ' + c : ''} ${a} bis ${b} °C`, feels: v => `gefühlt bis ${v}`,
    sky: { clear: 'klar', cloudy: 'bewölkt', fog: 'Nebel', drizzle: 'Nieselregen', rain: 'Regen', snow: 'Schnee', showers: 'Schauer', storm: 'Gewitter' },
    rainP: (p, h) => `Regenwahrscheinlichkeit ${p} %${h ? ', am ehesten gegen ' + h : ''}`, wind: v => `Wind bis ${v} km/h`, adv: 'Tipp', and: ' und ',
    cl: { frost: 'eine warme Daunenjacke oder einen Wintermantel, Mütze, Schal und Handschuhe sowie Winterschuhe', cold: 'eine warme Jacke oder einen Mantel, einen Pullover und geschlossene Schuhe', cool: 'eine leichte Jacke oder einen Trenchcoat und lange Ärmel', mild: 'ein Sweatshirt, eine Strickjacke oder Jeansjacke', warm: 'ein T-Shirt und eine leichte Hose oder einen Rock', hot: 'leichte, luftige Kleidung aus Leinen oder Baumwolle, eine Cap und eine Sonnenbrille',
      rain: 'nehmen Sie einen Schirm oder eine Regenjacke und Schuhe, die trocken bleiben', wind: 'wählen Sie etwas Winddichtes', layers: 'ziehen Sie sich im Zwiebellook an: Tag und Abend unterscheiden sich stark', uv: 'Sonnencreme auftragen' }, wear: 'tragen Sie' },
  pl: { today: (c, a, b) => `Dziś${c ? ' w ' + c : ''} od ${a} do ${b} °C`, feels: v => `odczuwalnie do ${v}`,
    sky: { clear: 'bezchmurnie', cloudy: 'pochmurno', fog: 'mgła', drizzle: 'mżawka', rain: 'deszcz', snow: 'śnieg', showers: 'przelotne opady', storm: 'burze' },
    rainP: (p, h) => `szansa opadów ${p} %${h ? ', najbardziej około ' + h : ''}`, wind: v => `wiatr do ${v} km/h`, adv: 'Rada', and: ' i ',
    cl: { frost: 'ciepłą kurtkę puchową lub zimowy płaszcz, czapkę, szalik i rękawiczki oraz zimowe buty', cold: 'ciepłą kurtkę lub płaszcz, sweter i zakryte buty', cool: 'lekką kurtkę lub trencz i długi rękaw', mild: 'bluzę, kardigan lub kurtkę jeansową', warm: 'T-shirt i lekkie spodnie lub spódnicę', hot: 'lekkie, przewiewne ubrania z lnu lub bawełny, czapkę z daszkiem i okulary przeciwsłoneczne',
      rain: 'weź parasol lub kurtkę przeciwdeszczową i buty, które nie przemakają', wind: 'wybierz coś chroniącego przed wiatrem', layers: 'ubierz się na cebulkę: dzień i wieczór bardzo się różnią', uv: 'użyj kremu z filtrem' }, wear: 'załóż' }
};
const lang = () => (window.I18N && L[I18N.lang] ? I18N.lang : 'ru');
const sky = code => code === 0 || code === 1 ? 'clear' : code <= 3 ? 'cloudy' : code <= 48 ? 'fog' : code <= 57 ? 'drizzle' : code <= 67 ? 'rain' : code <= 77 ? 'snow' : code <= 82 ? 'showers' : code <= 86 ? 'snow' : 'storm';
const ICON = { clear: '☀️', cloudy: '⛅', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', showers: '🌦️', storm: '⛈️' };
const t1 = v => { const r = Math.round(v); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r); };

function compose(w, city) {
  const l = L[lang()], d = w.daily, i = 0;
  const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i], fLo = d.apparent_temperature_min[i], fHi = d.apparent_temperature_max[i];
  const code = d.weather_code[i], rainP = d.precipitation_probability_max[i] ?? 0, wind = Math.round(d.wind_speed_10m_max[i] || 0), uv = d.uv_index_max[i] ?? 0;
  // час с наибольшей вероятностью осадков — только в дневное время
  let rainH = '';
  if (rainP >= 40 && w.hourly) { let best = -1, bi = -1; w.hourly.time.forEach((t, k) => { const h = +t.slice(11, 13), p = w.hourly.precipitation_probability[k] ?? 0; if (h >= 7 && h <= 22 && p > best) { best = p; bi = k; } }); if (bi >= 0) rainH = w.hourly.time[bi].slice(11, 16); }
  const parts = [`${l.today(city, t1(lo), t1(hi))}, ${l.sky[sky(code)]}`];
  if (Math.round(fHi) < Math.round(hi) - 2) parts[0] += `, ${l.feels(t1(fHi))}`;
  const facts = []; if (rainP >= 30) facts.push(l.rainP(rainP, rainH)); if (wind >= 30) facts.push(l.wind(wind));
  const feel = (fLo + fHi*2)/3; // день важнее утра
  const base = feel <= 0 ? 'frost' : feel <= 8 ? 'cold' : feel <= 14 ? 'cool' : feel <= 20 ? 'mild' : feel <= 25 ? 'warm' : 'hot';
  const extra = []; if (rainP >= 40 || /rain|showers|storm|drizzle/.test(sky(code))) extra.push(l.cl.rain); if (wind >= 35) extra.push(l.cl.wind); if (hi - lo >= 9) extra.push(l.cl.layers); if (uv >= 6) extra.push(l.cl.uv);
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const advice = `${l.adv}: ${l.wear} ${l.cl[base]}${extra.length ? '; ' + extra.join('; ') : ''}.`;
  return { icon: ICON[sky(code)], head: parts[0] + '.', facts: facts.length ? cap(facts.join(l.and)) + '.' : '', advice, speech: [parts[0] + '.', facts.length ? cap(facts.join(l.and)) + '.' : '', advice].filter(Boolean).join(' ') };
}

/* ---------- карточка во вкладке «Стиль» ---------- */
const panel = document.getElementById('p-style');
const card = document.createElement('section');
card.className = 'wx-card'; card.setAttribute('aria-labelledby', 'wxH');
card.innerHTML = `
  <div class="wx-top"><span class="wx-ico" id="wxIco" aria-hidden="true">🌤️</span><div><h2 class="sec-title" id="wxH">Погода и что надеть</h2><p class="wx-head" id="wxHead" data-noi18n></p></div></div>
  <p class="wx-facts" id="wxFacts" data-noi18n></p>
  <p class="wx-adv" id="wxAdv" data-noi18n></p>
  <p class="note" id="wxMsg" role="status"></p>
  <div class="wx-btns"><button type="button" class="primary" id="wxGo">Узнать погоду</button><button type="button" id="wxSay" hidden>Прочитать вслух</button></div>
  <label class="wx-auto"><input type="checkbox" id="wxAuto"> Каждое утро рассказывать прогноз при первом касании</label>`;
if (panel) panel.insertBefore(card, panel.firstChild);
const $w = id => document.getElementById(id);
let last = null;

async function fetchWeather(g) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,weather_code,wind_speed_10m_max,uv_index_max&hourly=precipitation_probability&timezone=auto&forecast_days=1`;
  const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status);
  const w = await r.json(); lsSet(KEY, { day: today(), lat: g.lat, lon: g.lon, w }); return w;
}
function show() {
  const g = window.Geo && Geo.get(), c = lsGet(KEY, null);
  if (!c || c.day !== today() || !g) { $w('wxGo').textContent = T(g ? 'Узнать погоду' : 'Определить местоположение и погоду'); $w('wxSay').hidden = true; return null; }
  last = compose(c.w, g.city);
  $w('wxIco').textContent = last.icon; $w('wxHead').textContent = last.head; $w('wxFacts').textContent = last.facts; $w('wxAdv').textContent = last.advice;
  $w('wxGo').textContent = T('Обновить'); $w('wxSay').hidden = false; $w('wxMsg').textContent = '';
  return last;
}
async function update(speak) {
  $w('wxGo').disabled = true; $w('wxMsg').textContent = T('Загружаю прогноз…');
  try {
    let g = window.Geo && Geo.get(); if (!g && window.Geo) g = await Geo.locate(); if (!g) throw new Error(T('Не удалось определить местоположение'));
    await fetchWeather(g); const r = show(); if (r && speak) say(r.speech, true);
  } catch (e) { $w('wxMsg').textContent = `${T('Прогноз не загрузился')}: ${e.message}`; }
  finally { $w('wxGo').disabled = false; }
}
$w('wxGo').onclick = () => update(false);
$w('wxSay').onclick = () => { if (last) say(last.speech, true); };
$w('wxAuto').checked = !!lsGet(PREF, false);
$w('wxAuto').onchange = e => lsSet(PREF, e.target.checked);
// утренний прогноз вслух: браузер разрешает голос только после касания
if (lsGet(PREF, false) && lsGet('pr-weather-said', '') !== today()) {
  const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true);
    lsSet('pr-weather-said', today()); const c = lsGet(KEY, null); if (c && c.day === today() && show()) say(last.speech, true); else update(true); };
  addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
}
show();
if (window.Geo) Geo.onChange(() => update(false));
if (window.I18N && I18N.onChange) I18N.onChange(show);
window.Weather = { update, get text() { return last; } };
})();
