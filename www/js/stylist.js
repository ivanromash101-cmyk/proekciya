/* Стилист: цветотип, советы по фигуре и росту, готовые образы по стилю и сезону.
 * Работает без интернета — все правила здесь. */
(function (root) {
'use strict';

/* ---------- цветотипы ---------- */
const PALETTES = {
  spring: { name: 'Весна', about: 'тёплые, светлые и чистые цвета',
    dark: ['#6e5038', 'кофейный'], mid: ['#d6b991', 'песочный'], light: ['#f4ecdc', 'слоновая кость'], denim: ['#7f9fc6', 'светлый деним'],
    a: [['#ef7a5c', 'коралловый'], ['#2fb3a5', 'бирюзовый'], ['#7fae62', 'весенний зелёный'], ['#f2c14e', 'золотисто-жёлтый'], ['#f3a98b', 'персиковый']],
    avoid: 'чёрный у лица, холодный серый, фуксию' },
  summer: { name: 'Лето', about: 'холодные, мягкие, приглушённые цвета',
    dark: ['#454b58', 'графитовый'], mid: ['#9eacbc', 'серо-голубой'], light: ['#f0eee9', 'молочный'], denim: ['#6a85a8', 'средний деним'],
    a: [['#c58b9b', 'пыльная роза'], ['#5d8ea1', 'морская волна'], ['#a49ac9', 'лавандовый'], ['#9cb29b', 'шалфей'], ['#a95a78', 'приглушённый малиновый']],
    avoid: 'оранжевый, горчичный, чисто-белый и чёрный' },
  autumn: { name: 'Осень', about: 'тёплые, глубокие, природные цвета',
    dark: ['#4a3326', 'шоколадный'], mid: ['#8b7d55', 'хаки'], light: ['#eee1c6', 'кремовый'], denim: ['#3e506b', 'тёмный деним'],
    a: [['#b4553b', 'терракотовый'], ['#c99530', 'горчичный'], ['#6b7139', 'оливковый'], ['#7b2f37', 'бордовый'], ['#2f6a6a', 'тёмно-бирюзовый']],
    avoid: 'ледяные пастели, неоновые и холодные розовые' },
  winter: { name: 'Зима', about: 'холодные, яркие и контрастные цвета',
    dark: ['#16171b', 'чёрный'], mid: ['#8a8e96', 'холодный серый'], light: ['#f8f8f6', 'белый'], denim: ['#2c3f68', 'индиго'],
    a: [['#c3172b', 'красный'], ['#2050c0', 'королевский синий'], ['#0f7a56', 'изумрудный'], ['#c01a7c', 'фуксия'], ['#bfe2f2', 'ледяной голубой']],
    avoid: 'бежевый, оранжевый, горчичный, приглушённые тёплые тона' }
};
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255)/255, g = (n >> 8 & 255)/255, b = (n & 255)/255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn)/2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d/(1 - Math.abs(2*l - 1)); h = mx === r ? ((g - b)/d) % 6 : mx === g ? (b - r)/d + 2 : (r - g)/d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s, l };
}
/* Определяет цветотип по цвету кожи, волос и глаз. */
function colorType(look) {
  const sk = hsl(look.skin), hr = hsl(look.hair), ey = hsl(look.eyes);
  let warm = (sk.h - 22)/8;                                       // кожа с желтизной — тёплая, с розовым — холодная
  if (hr.s > 0.35 && hr.h > 8 && hr.h < 45 && hr.l > 0.2) warm += 1;  // рыжие и золотистые волосы
  if (hr.s < 0.12) warm -= 1;                                     // пепельные, седые
  if (ey.h > 25 && ey.h < 100) warm += 0.4; else if (ey.h > 180) warm -= 0.6; // ореховые/зелёные vs голубые/серые
  const contrast = Math.abs(sk.l - hr.l), lightHair = hr.l > 0.45;
  const redHair = hr.s > 0.45 && hr.h > 8 && hr.h < 30 && hr.l > 0.2;
  let type;
  if (contrast > 0.55 && hr.l < 0.16 && !redHair) type = 'winter';       // светлая кожа и очень тёмные волосы
  else if (warm >= 0) type = lightHair ? 'spring' : 'autumn';
  else type = lightHair ? 'summer' : contrast > 0.42 ? 'winter' : 'summer';
  return { type, warm, contrast };
}

/* ---------- фигура ---------- */
const FIT = {
  f: {
    'Песочные часы': { focus: 'Подчёркивайте талию — это ваше главное преимущество.', top: 'по фигуре, с запахом или V-вырезом', bottom: 'высокая посадка, по фигуре', dress: 'приталенное, с запахом или поясом', outer: 'приталенный, с поясом', avoid: 'Бесформенный оверсайз и прямые мешковатые вещи скрывают пропорции.' },
    'Груша': { focus: 'Акцент наверх: светлый или яркий верх, тёмный спокойный низ.', top: 'светлый или яркий, вырез-лодочка, детали на плечах', bottom: 'тёмный, прямой или слегка расклешённый', dress: 'А-силуэт, акцент на плечах и декольте', outer: 'до середины бедра или ниже, с выраженным плечом', avoid: 'Светлые обтягивающие низы, карманы и детали на бёдрах, короткие куртки по линии бёдер.' },
    'Перевёрнутый треугольник': { focus: 'Уравновесьте плечи: простой верх, объём и цвет внизу.', top: 'простой, с V-вырезом, без объёма на плечах', bottom: 'объёмный или светлый: широкие брюки, трапеция', dress: 'с V-вырезом и расклешённой юбкой', outer: 'без подплечников, реглан', avoid: 'Подплечники, рукава-фонарики, горизонтальные полосы на груди.' },
    'Яблоко': { focus: 'Вытягивайте силуэт: вертикали, V-вырез, ткани, которые не облегают живот.', top: 'свободный, с V-вырезом, длиной до бедра', bottom: 'прямой, средняя посадка', dress: 'прямое или ампир, из плотной ткани', outer: 'прямой, длинный, без пояса', avoid: 'Пояс на талии, облегающий трикотаж, короткие объёмные куртки.' },
    'Прямоугольник': { focus: 'Создайте талию: пояса, баска, многослойность.', top: 'с баской, драпировкой или под пояс', bottom: 'высокая посадка, юбки с объёмом', dress: 'с поясом или запахом', outer: 'с поясом, жакет с вытачками', avoid: 'Прямые вещи одной длины от плеч до бёдер.' }
  },
  m: {
    'Атлетическая': { focus: 'Подчеркните V-силуэт: вещи по фигуре, а не в обтяжку.', top: 'приталенный (slim fit)', bottom: 'зауженный или прямой', outer: 'короткий, по фигуре', avoid: 'Мешковатые вещи — они прибавляют объём в талии.' },
    'Округлая': { focus: 'Вытягивайте силуэт: однотонный тёмный верх, вертикальные линии.', top: 'прямой крой (regular fit), однотонный', bottom: 'прямой, средняя посадка', outer: 'однобортный, длиной до бедра', avoid: 'Облегающее, горизонтальные полосы, короткие куртки по талии.' },
    'Треугольник': { focus: 'Расширьте плечи: структурные плечи, светлый верх, тёмный низ.', top: 'светлый, с деталями на груди', bottom: 'тёмный, прямой', outer: 'с чётким плечом, бомбер, пиджак', avoid: 'Узкие светлые брюки и куртки, заканчивающиеся на бёдрах.' },
    'Прямая': { focus: 'Добавьте объём плечам и многослойность.', top: 'по фигуре, многослойно', bottom: 'прямой или чуть зауженный', outer: 'с объёмом на плечах', avoid: 'Однотонные образы без слоёв выглядят плоско.' }
  }
};
function heightTip(g, h) {
  if ((g === 'm' && h < 170) || (g === 'f' && h < 160)) return 'Невысокий рост: образ в одном цвете, высокая посадка, укороченная верхняя одежда, обувь в тон низу.';
  if ((g === 'm' && h > 188) || (g === 'f' && h > 176)) return 'Высокий рост: можно длинные пальто, контрастные слои, широкие брюки и крупные детали.';
  return 'Средний рост: подходят любые длины, следите за балансом верха и низа.';
}

/* ---------- образы ----------
   slot: top, bottom, dress, outer, shoes, acc
   роли цвета: dark, mid, light, denim, a0..a4
   model: как показать на 3D — sl: рукав s/l, bt: низ t брюки / sh шорты / sk юбка / d платье, ol: j куртка / c пальто */
const S = ['summer'], MID = ['mid'], W = ['winter'], SM = ['summer', 'mid'], MW = ['mid', 'winter'], ALL = ['summer', 'mid', 'winter'];
const LIB = {
  m: {
    casual: [
      { t: 'Свитшот и джинсы', s: MID, items: [['top', 'Свитшот', 'a1'], ['bottom', 'Прямые джинсы', 'denim'], ['outer', 'Рабочая куртка (овершот)', 'mid'], ['shoes', 'Кеды', 'light'], ['acc', 'Рюкзак', 'dark']], model: { top: 'a1', sl: 'l', bot: 'denim', bt: 't', out: 'mid', ol: 'j', sh: 'light' } },
      { t: 'Поло и чиносы', s: S, items: [['top', 'Трикотажное поло', 'a0'], ['bottom', 'Чиносы', 'light'], ['shoes', 'Замшевые мокасины', 'dark'], ['acc', 'Солнцезащитные очки', 'dark']], model: { top: 'a0', sl: 's', bot: 'light', bt: 't', sh: 'dark' } },
      { t: 'Тёплый кэжуал', s: W, items: [['top', 'Свитер крупной вязки', 'a3'], ['bottom', 'Джинсы', 'denim'], ['outer', 'Парка', 'dark'], ['shoes', 'Кожаные ботинки', 'dark'], ['acc', 'Шапка-бини', 'a3']], model: { top: 'a3', sl: 'l', bot: 'denim', bt: 't', out: 'dark', ol: 'c', sh: 'dark' } },
      { t: 'Рубашка навыпуск', s: SM, items: [['top', 'Оксфордская рубашка', 'light'], ['bottom', 'Чиносы', 'mid'], ['shoes', 'Кеды', 'light'], ['acc', 'Часы на кожаном ремешке', 'dark']], model: { top: 'light', sl: 'l', bot: 'mid', bt: 't', sh: 'light' } }
    ],
    smart: [
      { t: 'Пиджак без галстука', s: MID, items: [['top', 'Футболка или тонкий джемпер', 'light'], ['bottom', 'Шерстяные брюки', 'dark'], ['outer', 'Мягкий пиджак без подкладки', 'mid'], ['shoes', 'Лоферы', 'dark'], ['acc', 'Кожаный ремень в тон обуви', 'dark']], model: { top: 'light', sl: 'l', bot: 'dark', bt: 't', out: 'mid', ol: 'j', sh: 'dark' } },
      { t: 'Лён летом', s: S, items: [['top', 'Льняная рубашка', 'light'], ['bottom', 'Льняные или хлопковые брюки', 'mid'], ['shoes', 'Лоферы без носков', 'dark'], ['acc', 'Плетёный ремень', 'mid']], model: { top: 'light', sl: 's', bot: 'mid', bt: 't', sh: 'dark' } },
      { t: 'Водолазка и пальто', s: W, items: [['top', 'Тонкая водолазка', 'dark'], ['bottom', 'Брюки со стрелками', 'mid'], ['outer', 'Пальто до колена', 'a4'], ['shoes', 'Челси', 'dark'], ['acc', 'Шерстяной шарф', 'a0']], model: { top: 'dark', sl: 'l', bot: 'mid', bt: 't', out: 'a4', ol: 'c', sh: 'dark' } }
    ],
    business: [
      { t: 'Классический костюм', s: ALL, items: [['top', 'Рубашка', 'light'], ['bottom', 'Костюмные брюки', 'dark'], ['outer', 'Пиджак костюма', 'dark'], ['shoes', 'Оксфорды', 'dark'], ['acc', 'Галстук', 'a1']], model: { top: 'light', sl: 'l', bot: 'dark', bt: 't', out: 'dark', ol: 'j', sh: 'dark' } },
      { t: 'Строго без галстука', s: SM, items: [['top', 'Рубашка с воротником кент', 'light'], ['bottom', 'Брюки', 'mid'], ['outer', 'Блейзер', 'dark'], ['shoes', 'Дерби', 'dark'], ['acc', 'Портфель', 'dark']], model: { top: 'light', sl: 'l', bot: 'mid', bt: 't', out: 'dark', ol: 'j', sh: 'dark' } },
      { t: 'Костюм и пальто', s: W, items: [['top', 'Рубашка', 'light'], ['bottom', 'Брюки из шерсти', 'dark'], ['outer', 'Пальто честерфилд', 'mid'], ['shoes', 'Оксфорды', 'dark'], ['acc', 'Кожаные перчатки', 'dark']], model: { top: 'light', sl: 'l', bot: 'dark', bt: 't', out: 'mid', ol: 'c', sh: 'dark' } }
    ],
    sport: [
      { t: 'Для зала', s: ALL, items: [['top', 'Футболка из дышащей ткани', 'a1'], ['bottom', 'Шорты для тренировок', 'dark'], ['shoes', 'Кроссовки для зала', 'light'], ['acc', 'Спортивная сумка', 'dark']], model: { top: 'a1', sl: 's', bot: 'dark', bt: 'sh', sh: 'light' } },
      { t: 'Спорт в городе', s: MID, items: [['top', 'Худи', 'mid'], ['bottom', 'Джоггеры', 'dark'], ['outer', 'Ветровка', 'a0'], ['shoes', 'Беговые кроссовки', 'light'], ['acc', 'Кепка', 'dark']], model: { top: 'mid', sl: 'l', bot: 'dark', bt: 't', out: 'a0', ol: 'j', sh: 'light' } },
      { t: 'Зимняя пробежка', s: W, items: [['top', 'Термокофта и флис', 'a2'], ['bottom', 'Утеплённые тайтсы', 'dark'], ['outer', 'Лёгкий пуховик', 'dark'], ['shoes', 'Кроссовки с протектором', 'dark'], ['acc', 'Шапка и перчатки', 'a2']], model: { top: 'a2', sl: 'l', bot: 'dark', bt: 't', out: 'dark', ol: 'j', sh: 'dark' } }
    ],
    street: [
      { t: 'Оверсайз и карго', s: MID, items: [['top', 'Оверсайз-футболка', 'light'], ['bottom', 'Брюки карго', 'mid'], ['outer', 'Бомбер', 'dark'], ['shoes', 'Массивные кроссовки', 'light'], ['acc', 'Кепка', 'dark']], model: { top: 'light', sl: 's', bot: 'mid', bt: 't', out: 'dark', ol: 'j', sh: 'light' } },
      { t: 'Летний стрит', s: S, items: [['top', 'Футболка с принтом', 'a0'], ['bottom', 'Шорты-карго', 'mid'], ['shoes', 'Кроссовки', 'light'], ['acc', 'Сумка через плечо', 'dark']], model: { top: 'a0', sl: 's', bot: 'mid', bt: 'sh', sh: 'light' } },
      { t: 'Зимний стрит', s: W, items: [['top', 'Худи', 'a3'], ['bottom', 'Широкие джинсы', 'denim'], ['outer', 'Объёмный пуховик', 'dark'], ['shoes', 'Высокие кроссовки', 'light'], ['acc', 'Бини', 'dark']], model: { top: 'a3', sl: 'l', bot: 'denim', bt: 't', out: 'dark', ol: 'j', sh: 'light' } }
    ],
    evening: [
      { t: 'Вечерний костюм', s: ALL, items: [['top', 'Рубашка', 'light'], ['bottom', 'Брюки', 'dark'], ['outer', 'Пиджак из шерсти или бархата', 'dark'], ['shoes', 'Лакированные оксфорды', 'dark'], ['acc', 'Платок в нагрудный карман', 'a3']], model: { top: 'light', sl: 'l', bot: 'dark', bt: 't', out: 'dark', ol: 'j', sh: 'dark' } },
      { t: 'Свидание', s: MW, items: [['top', 'Рубашка', 'a4'], ['bottom', 'Джинсы', 'denim'], ['outer', 'Кожаная куртка', 'dark'], ['shoes', 'Челси', 'dark'], ['acc', 'Часы', 'mid']], model: { top: 'a4', sl: 'l', bot: 'denim', bt: 't', out: 'dark', ol: 'j', sh: 'dark' } },
      { t: 'Летний вечер', s: S, items: [['top', 'Рубашка с коротким рукавом', 'a2'], ['bottom', 'Брюки', 'light'], ['shoes', 'Лоферы', 'dark'], ['acc', 'Браслет', 'mid']], model: { top: 'a2', sl: 's', bot: 'light', bt: 't', sh: 'dark' } }
    ]
  },
  f: {
    casual: [
      { t: 'Джинсы и тренч', s: MID, items: [['top', 'Полосатый лонгслив', 'light'], ['bottom', 'Прямые джинсы', 'denim'], ['outer', 'Тренч', 'mid'], ['shoes', 'Кеды', 'light'], ['acc', 'Сумка-шопер', 'dark']], model: { top: 'light', sl: 'l', bot: 'denim', bt: 't', out: 'mid', ol: 'c', sh: 'light' } },
      { t: 'Платье-рубашка', s: S, items: [['dress', 'Платье-рубашка миди', 'a1'], ['shoes', 'Сандалии', 'mid'], ['acc', 'Плетёная сумка', 'mid']], model: { top: 'a1', sl: 's', bot: 'a1', bt: 'd', sh: 'mid' } },
      { t: 'Свитер и юбка миди', s: W, items: [['top', 'Свитер', 'a3'], ['bottom', 'Юбка миди', 'dark'], ['outer', 'Пальто', 'mid'], ['shoes', 'Высокие сапоги', 'dark'], ['acc', 'Шарф', 'a0']], model: { top: 'a3', sl: 'l', bot: 'dark', bt: 'sk', out: 'mid', ol: 'c', sh: 'dark' } },
      { t: 'Футболка и широкие брюки', s: SM, items: [['top', 'Базовая футболка', 'light'], ['bottom', 'Широкие брюки', 'a2'], ['shoes', 'Мюли или кеды', 'light'], ['acc', 'Небольшая сумка', 'dark']], model: { top: 'light', sl: 's', bot: 'a2', bt: 't', sh: 'light' } }
    ],
    smart: [
      { t: 'Блуза и брюки', s: SM, items: [['top', 'Шёлковая блуза', 'a0'], ['bottom', 'Брюки со стрелками', 'mid'], ['shoes', 'Лоферы', 'dark'], ['acc', 'Тонкий ремень', 'dark']], model: { top: 'a0', sl: 'l', bot: 'mid', bt: 't', sh: 'dark' } },
      { t: 'Жакет и платье', s: MID, items: [['dress', 'Трикотажное платье миди', 'dark'], ['outer', 'Жакет', 'light'], ['shoes', 'Лодочки на невысоком каблуке', 'dark'], ['acc', 'Серьги', 'a3']], model: { top: 'dark', sl: 'l', bot: 'dark', bt: 'd', out: 'light', ol: 'j', sh: 'dark' } },
      { t: 'Водолазка и пальто', s: W, items: [['top', 'Водолазка', 'light'], ['bottom', 'Юбка-карандаш или прямые брюки', 'dark'], ['outer', 'Пальто', 'a4'], ['shoes', 'Ботильоны', 'dark'], ['acc', 'Структурная сумка', 'dark']], model: { top: 'light', sl: 'l', bot: 'dark', bt: 'sk', out: 'a4', ol: 'c', sh: 'dark' } }
    ],
    business: [
      { t: 'Брючный костюм', s: ALL, items: [['top', 'Блуза или топ', 'light'], ['bottom', 'Брюки костюма', 'dark'], ['outer', 'Пиджак костюма', 'dark'], ['shoes', 'Лодочки', 'dark'], ['acc', 'Деловая сумка', 'mid']], model: { top: 'light', sl: 'l', bot: 'dark', bt: 't', out: 'dark', ol: 'j', sh: 'dark' } },
      { t: 'Платье-футляр', s: SM, items: [['dress', 'Платье-футляр', 'a4'], ['outer', 'Жакет', 'dark'], ['shoes', 'Лодочки', 'dark'], ['acc', 'Часы', 'mid']], model: { top: 'a4', sl: 'l', bot: 'a4', bt: 'd', out: 'dark', ol: 'j', sh: 'dark' } },
      { t: 'Костюм и пальто', s: W, items: [['top', 'Шёлковая блуза', 'light'], ['bottom', 'Брюки', 'mid'], ['outer', 'Пальто', 'dark'], ['shoes', 'Ботильоны', 'dark'], ['acc', 'Кожаные перчатки', 'dark']], model: { top: 'light', sl: 'l', bot: 'mid', bt: 't', out: 'dark', ol: 'c', sh: 'dark' } }
    ],
    sport: [
      { t: 'Для зала', s: ALL, items: [['top', 'Спортивный топ и футболка', 'a1'], ['bottom', 'Леггинсы', 'dark'], ['shoes', 'Кроссовки', 'light'], ['acc', 'Бутылка для воды', 'a1']], model: { top: 'a1', sl: 's', bot: 'dark', bt: 't', sh: 'light' } },
      { t: 'Спортивный костюм', s: MID, items: [['top', 'Худи', 'a2'], ['bottom', 'Джоггеры', 'a2'], ['outer', 'Ветровка', 'light'], ['shoes', 'Кроссовки', 'light'], ['acc', 'Кепка', 'dark']], model: { top: 'a2', sl: 'l', bot: 'a2', bt: 't', out: 'light', ol: 'j', sh: 'light' } },
      { t: 'Зимой на прогулку', s: W, items: [['top', 'Флисовая кофта', 'a3'], ['bottom', 'Утеплённые леггинсы', 'dark'], ['outer', 'Пуховик', 'mid'], ['shoes', 'Зимние кроссовки', 'dark'], ['acc', 'Повязка на голову', 'a3']], model: { top: 'a3', sl: 'l', bot: 'dark', bt: 't', out: 'mid', ol: 'c', sh: 'dark' } }
    ],
    street: [
      { t: 'Худи и карго', s: MID, items: [['top', 'Оверсайз-худи', 'a2'], ['bottom', 'Брюки карго', 'mid'], ['outer', 'Бомбер', 'dark'], ['shoes', 'Массивные кроссовки', 'light'], ['acc', 'Сумка на пояс', 'dark']], model: { top: 'a2', sl: 'l', bot: 'mid', bt: 't', out: 'dark', ol: 'j', sh: 'light' } },
      { t: 'Топ и шорты', s: S, items: [['top', 'Укороченный топ или футболка', 'light'], ['bottom', 'Джинсовые шорты', 'denim'], ['shoes', 'Кеды', 'light'], ['acc', 'Кепка', 'a0']], model: { top: 'light', sl: 's', bot: 'denim', bt: 'sh', sh: 'light' } },
      { t: 'Зимний стрит', s: W, items: [['top', 'Свитшот', 'light'], ['bottom', 'Широкие джинсы', 'denim'], ['outer', 'Объёмный пуховик', 'a1'], ['shoes', 'Высокие кроссовки', 'dark'], ['acc', 'Бини', 'dark']], model: { top: 'light', sl: 'l', bot: 'denim', bt: 't', out: 'a1', ol: 'j', sh: 'dark' } }
    ],
    evening: [
      { t: 'Платье-комбинация', s: SM, items: [['dress', 'Платье-комбинация миди', 'a3'], ['outer', 'Жакет на плечи', 'dark'], ['shoes', 'Босоножки на каблуке', 'dark'], ['acc', 'Клатч', 'mid']], model: { top: 'a3', sl: 's', bot: 'a3', bt: 'd', sh: 'dark' } },
      { t: 'Маленькое платье', s: MW, items: [['dress', 'Платье по фигуре', 'dark'], ['outer', 'Пальто', 'mid'], ['shoes', 'Лодочки', 'dark'], ['acc', 'Яркие серьги', 'a0']], model: { top: 'dark', sl: 'l', bot: 'dark', bt: 'd', out: 'mid', ol: 'c', sh: 'dark' } },
      { t: 'Комбинезон', s: ALL, items: [['dress', 'Комбинезон с широкими брюками', 'a4'], ['shoes', 'Туфли на каблуке', 'dark'], ['acc', 'Клатч', 'light']], model: { top: 'a4', sl: 's', bot: 'a4', bt: 't', sh: 'dark' } }
    ]
  }
};
const STYLES = [['casual', 'Повседневный'], ['smart', 'Смарт-кэжуал'], ['business', 'Деловой'], ['sport', 'Спортивный'], ['street', 'Уличный'], ['evening', 'Вечерний']];
const SEASONS = [['summer', 'Лето'], ['mid', 'Весна/осень'], ['winter', 'Зима']];
const SLOT = { top: 'Верх', bottom: 'Низ', dress: 'Платье', outer: 'Верхняя одежда', shoes: 'Обувь', acc: 'Аксессуар' };

/* Собирает рекомендации. sizes — результат расчёта размеров приложения. */
function recommend({ gender, M, shape, look, style, season, typeOverride, sizes, jeans }) {
  const ct = colorType(look), type = typeOverride && typeOverride !== 'auto' ? typeOverride : ct.type, pal = PALETTES[type];
  const fit = (FIT[gender] || FIT.m)[shape] || Object.values(FIT[gender])[0];
  const role = r => r === 'dark' ? pal.dark : r === 'mid' ? pal.mid : r === 'light' ? pal.light : r === 'denim' ? pal.denim : pal.a[+r.slice(1)];
  let list = (LIB[gender][style] || []).filter(o => o.s.includes(season));
  if (!list.length) list = LIB[gender][style] || [];
  const outfits = list.slice(0, 3).map(o => ({
    title: o.t,
    items: o.items.map(([slot, name, r]) => {
      const c = role(r), shirt = /рубашк|блуз/i.test(name), trousers = /брюк|джоггер|карго|леггинс|тайтс|чинос/i.test(name);
      const size = slot === 'top' ? `${sizes.letter}, ${sizes.top}${shirt && gender === 'm' ? ', воротник ' + sizes.collar + ', рукав ' + M.sleeve : ''}`
        : slot === 'bottom' ? (/джинс/i.test(name) ? jeans : /шорт|юбк/i.test(name) ? sizes.bottomTxt : `${sizes.bottomTxt}${trousers ? ', длина по шву ' + M.inseam + ' см' : ''}`)
        : slot === 'dress' ? `${sizes.letter}, ${sizes.top}` : slot === 'outer' ? `${sizes.letter}, рукав ${M.sleeve} см${season === 'winter' ? ' (на размер больше, если под свитер)' : ''}`
        : slot === 'shoes' ? sizes.shoeTxt
        : slot === 'acc' && /шапк|бини|кепк|повязк/i.test(name) ? `обхват ${sizes.hatTxt}` : slot === 'acc' && /перчат/i.test(name) ? sizes.letter : slot === 'acc' && /ремен/i.test(name) ? `длина ${Math.round(M.waist + 15)} см` : '';
      const note = slot === 'top' ? fit.top : slot === 'bottom' ? fit.bottom : slot === 'dress' ? (fit.dress || fit.top) : slot === 'outer' ? fit.outer : '';
      return { slot, slotName: SLOT[slot], name, color: c[0], colorName: c[1], size, note };
    }),
    model: Object.assign({}, o.model, { top: role(o.model.top)[0], bot: role(o.model.bot)[0], out: o.model.out ? role(o.model.out)[0] : null, sh: role(o.model.sh)[0] })
  }));
  return { type, typeName: pal.name, about: pal.about, auto: ct.type, palette: [pal.dark, pal.mid, pal.light, ...pal.a], avoidColors: pal.avoid,
    focus: fit.focus, avoid: fit.avoid, height: heightTip(gender, M.height), outfits };
}
function speakOutfit(o) {
  return `Образ «${o.title}». ` + o.items.map(i => `${i.slotName}: ${i.name}, цвет ${i.colorName}${i.size ? ', размер ' + i.size : ''}${i.note ? ', ' + i.note : ''}.`).join(' ');
}

root.Stylist = { recommend, colorType, speakOutfit, STYLES, SEASONS, PALETTES };
if (typeof module !== 'undefined') module.exports = root.Stylist;
})(typeof self !== 'undefined' ? self : this);
