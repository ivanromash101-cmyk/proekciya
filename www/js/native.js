/* Мост к возможностям телефона. В Android-приложении (Capacitor) используются
 * родные плагины: голос Android, распознавание речи, «Поделиться», файлы.
 * В браузере — веб-аналоги. */
(function (root) {
'use strict';
const Cap = root.Capacitor;
const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plugin = name => { try { return isNative && Cap.registerPlugin ? Cap.registerPlugin(name) : null; } catch (e) { return null; } };
const TTS = plugin('TextToSpeech'), SR = plugin('SpeechRecognition'), Share = plugin('Share'), FS = plugin('Filesystem');

const webSynth = 'speechSynthesis' in root ? root.speechSynthesis : null;
let ruVoice = null;
function pickVoice() { if (webSynth) ruVoice = webSynth.getVoices().find(v => /^ru/i.test(v.lang)) || null; }
if (webSynth) { pickVoice(); webSynth.onvoiceschanged = pickVoice; }

const WebSR = root.SpeechRecognition || root.webkitSpeechRecognition;

root.Native = {
  isNative,
  canSpeak: !!(TTS || webSynth),
  canListen: !!(SR || WebSR),
  async speak(text) {
    if (TTS) { try { await TTS.stop(); } catch (e) {} try { await TTS.speak({ text, lang: (root.I18N ? root.I18N.voice() : 'ru-RU'), rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' }); return true; } catch (e) {} }
    if (webSynth) { try { webSynth.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = root.I18N ? root.I18N.voice() : 'ru-RU'; const vv = webSynth.getVoices().find(v => v.lang.replace('_', '-').toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase())); if (vv) u.voice = vv; else if (ruVoice && u.lang.startsWith('ru')) u.voice = ruVoice; webSynth.speak(u); return true; } catch (e) {} }
    return false;
  },
  stopSpeaking() { if (TTS) TTS.stop().catch(() => {}); if (webSynth) webSynth.cancel(); },
  /* Слушает одну фразу на русском. Возвращает текст или бросает ошибку с понятным сообщением. */
  async listen() {
    if (SR) {
      const av = await SR.available().catch(() => ({ available: false }));
      if (!av.available) throw new Error('Распознавание речи недоступно. Установите приложение «Google» и голосовой ввод.');
      const perm = await SR.requestPermissions().catch(() => null);
      if (perm && perm.speechRecognition === 'denied') throw new Error('Нет доступа к микрофону. Разрешите его в настройках приложения.');
      const r = await SR.start({ language: 'ru-RU', maxResults: 1, prompt: 'Назовите мерки', partialResults: false, popup: true });
      const m = r && r.matches && r.matches[0]; if (!m) throw new Error('Не расслышал. Попробуйте ещё раз.'); return m;
    }
    if (!WebSR) throw new Error('Голосовой ввод здесь недоступен. Нажмите на поле и используйте микрофон на клавиатуре.');
    return new Promise((ok, fail) => {
      let rec; try { rec = new WebSR(); } catch (e) { fail(new Error('Голосовой ввод недоступен.')); return; }
      rec.lang = 'ru-RU'; rec.interimResults = false; rec.maxAlternatives = 1;
      let got = false;
      rec.onresult = e => { got = true; ok(e.results[0][0].transcript); };
      rec.onerror = e => fail(new Error(/not-allowed|service/.test(e.error) ? 'Нет доступа к микрофону. Разрешите его для этого сайта.' : 'Не расслышал. Попробуйте ещё раз.'));
      rec.onend = () => { if (!got) fail(new Error('Не расслышал. Попробуйте ещё раз.')); };
      try { rec.start(); } catch (e) { fail(new Error('Голосовой ввод недоступен.')); }
    });
  },
  /* Поделиться текстом (мессенджер, почта). */
  async shareText(title, text) {
    if (Share) { await Share.share({ title, text, dialogTitle: title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
    await navigator.clipboard.writeText(text); return 'copied';
  },
  /* Сохранить текстовый файл. На телефоне файл открывается в окне «Поделиться» — можно сохранить на диск или отправить. */
  async saveText(filename, text) {
    if (FS && Share) {
      const r = await FS.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: filename, files: [r.uri], dialogTitle: 'Сохранить мерки' });
      return 'shared';
    }
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    return 'downloaded';
  }
};
})(typeof self !== 'undefined' ? self : this);
