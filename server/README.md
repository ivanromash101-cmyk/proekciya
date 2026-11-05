# Сервер ИИ-стилиста

Маленький сервер-посредник между приложением и ИИ (Claude от Anthropic).
Три адреса: `/chat` — ответы стилиста в чате, `/search` — разбор запроса для поиска в магазинах,
`/tryon` — разбор фото товара для примерки на модели (вид вещи, цвет, крой).
Ключ API хранится только здесь — в приложение его класть нельзя.

## 1. Ключ Anthropic

1. Зарегистрируйтесь на https://console.anthropic.com и привяжите карту (Billing).
   Каждый ответ стилиста стоит доли цента; можно поставить месячный лимит расходов.
2. **API Keys → Create Key**, назовите `proekciya`. Скопируйте ключ (он начинается с `sk-ant-`).
   Никому его не присылайте и не вставляйте в файлы приложения.

## 2. Сервер на Cloudflare (бесплатно, без установки программ)

1. Зарегистрируйтесь на https://dash.cloudflare.com.
2. **Workers & Pages → Create → Create Worker**, имя `proekciya-stylist` → **Deploy**.
3. **Edit code**: удалите всё в редакторе и вставьте содержимое файла `worker.js` → **Deploy**.
4. Вернитесь к Worker'у: **Settings → Variables and Secrets → Add**:
   - тип **Secret**, имя `ANTHROPIC_API_KEY`, значение — ваш ключ → **Deploy**.
5. Скопируйте адрес Worker'а, например `https://proekciya-stylist.ivan.workers.dev`.
   Откройте его в браузере — должно показать `{"ok":true,...}`.

## 3. Подключить приложение

В файле `www/js/config.js` впишите адрес:

```js
window.PROEKCIYA_CONFIG = { chatUrl: 'https://proekciya-stylist.ivan.workers.dev' };
```

Обновите приложение (для телефона — заново соберите APK). Надпись «демо-режим» в чате сменится на «онлайн».

## Для разработчика

С установленным Node.js: `npx wrangler deploy` в этой папке и `npx wrangler secret put ANTHROPIC_API_KEY`.
Модель меняется переменной `MODEL` в `wrangler.toml`.

## ИИ-примерка (по желанию)

Чтобы на телефоне работала реалистичная примерка одежды на фото, добавьте ключ fal.ai:

```
npx wrangler secret put FAL_KEY
```

Сервер принимает `POST /vton` с фото человека и вещи и возвращает картинку. Фото нигде не сохраняются.

## Магазины рядом (по желанию)

```
npx wrangler secret put GOOGLE_PLACES_KEY
```

`POST /places { lat, lon, radius }` — магазины одежды рядом из Google Карт; без ключа — из OpenStreetMap.
