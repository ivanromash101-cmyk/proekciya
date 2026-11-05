// Готовит Android-проект после `npx cap add android`:
//  - разрешения: камера (скан и селфи), микрофон (голосовой ввод), местоположение (магазины рядом, погода);
//  - доступ к сервисам распознавания и синтеза речи;
//  - Android 16 (API 36) — этого требует Google Play с 31 августа 2026;
//  - номер версии (VERSION_CODE / VERSION_NAME из окружения, иначе 1 / 2.1.0);
//  - подпись релизной сборки ключом из окружения (KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS).
import { readFile, writeFile, access } from 'node:fs/promises';
const exists = p => access(p).then(() => true, () => false);

// 1. AndroidManifest.xml
const mf = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(mf, 'utf8');
const perms = ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'];
for (const p of perms) if (!xml.includes(p)) xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
for (const f of ['android.hardware.camera', 'android.hardware.location.gps', 'android.hardware.microphone'])
  if (!xml.includes(`<uses-feature android:name="${f}"`))
    xml = xml.replace('</manifest>', `    <uses-feature android:name="${f}" android:required="false" />\n</manifest>`);
if (!xml.includes('android.speech.RecognitionService'))
  xml = xml.replace('</manifest>', `    <queries>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>
    </queries>
</manifest>`);
await writeFile(mf, xml);
console.log('✓ Разрешения: камера, микрофон, местоположение');

// 2. variables.gradle — версия Android SDK
const vg = 'android/variables.gradle';
if (await exists(vg)) {
  let v = await readFile(vg, 'utf8');
  v = v.replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 36').replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 36');
  await writeFile(vg, v);
  console.log('✓ compileSdk / targetSdk = 36');
}

// 3. app/build.gradle — номер версии и подпись
const bg = 'android/app/build.gradle';
let g = await readFile(bg, 'utf8');
const code = parseInt(process.env.VERSION_CODE || '1', 10) || 1;
const name = process.env.VERSION_NAME || '2.1.0';
g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);
if (!g.includes('signingConfigs')) {
  g = g.replace(/(\n\s*buildTypes\s*\{)/, `
    signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS") ?: "upload"
                keyPassword System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }$1`);
  g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1
            if (System.getenv("KEYSTORE_FILE")) signingConfig signingConfigs.release`);
}
await writeFile(bg, g);
console.log(`✓ Версия ${name} (код ${code}), подпись ${process.env.KEYSTORE_FILE ? 'включена' : 'не задана'}`);
