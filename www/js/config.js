/* Настройки «Проекции».
 * chatUrl — адрес сервера ИИ-стилиста (Cloudflare Worker из папки server/), например
 *   'https://proekciya-stylist.ВАШ-НИК.workers.dev'
 * Пусто — чат работает в демо-режиме, без интернета. */
window.PROEKCIYA_CONFIG = {
  chatUrl: '',
  // false — главный экран: примерочная по фото; true — 3D-модель (фото — вид «Моё фото»)
  mode3d: true,
  // удаление фона с фото пользователя: модуль BiRefNet (tools/bg_remover) через сервер приложения.
  // Пусто — только быстрый способ (MediaPipe).
  bgUrl: 'api/remove-background'
};

// В Android-приложении нет ноутбучного сервера: адреса 'api/…' там не работают —
// фон убирается встроенным способом, магазины рядом ищутся напрямую.
(function () {
  var C = window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) { window.PROEKCIYA_CONFIG.native = true; window.PROEKCIYA_CONFIG.bgUrl = ''; }
})();
