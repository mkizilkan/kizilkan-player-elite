#!/usr/bin/env node
/**
 * v18.7.38 — "Hesabı Düzenle" (edit-playlist) klavye kaydırması (#2b).
 * CİHAZ KANITI (13.11.2026, v18.7.37-dev): Kullanıcı düzenleme ekranında kullanıcı adı
 * alanına dokununca klavye alanı örttü (şifre/MAC/seri de aynı). Kök neden koddan:
 * KeyboardAvoidingView Android'de behavior=undefined (no-op) + alanlarda odak kaydırması
 * yoktu. v18.7.37 #2 yalnız add-playlist'i düzeltmişti; düzenleme ekranı eksik kalmıştı.
 * Düzeltme add-playlist ile aynı desen: KAV "height" + revealField (odaklanan alanı
 * klavyenin üstüne kaydır) + kritik alanlarda onFocus.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

// --- Beş sürüm alanı (ileri uyumlu) ---
const app = JSON.parse(rd('frontend/app.json'));
const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180738, `expo.version (${ver}) >= 18.7.38 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code
  && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

const edit = rd('frontend/app/edit-playlist.tsx');

// --- #2b: KAV behavior'ına DOKUNULMADI (check-v1711 "height" layout sorununu kilitliyor);
//         düzeltme KAV'dan BAĞIMSIZ, odak kaydırmasıyla yapılır. ---
need(/behavior=\{Platform\.OS === "ios" \? "padding" : undefined\}/.test(edit),
  '#2b: KAV behavior değişmemeli (check-v1711 undefined bekliyor)');

// --- #2b: odak kaydırma altyapısı (asıl düzeltme) ---
need(/const revealField = React\.useCallback/.test(edit), '#2b: revealField fonksiyonu yok');
need(/scrollResponderScrollNativeHandleToKeyboard/.test(edit), '#2b: odak kaydırma çağrısı yok');
need(/<ScrollView ref=\{formScrollRef\}/.test(edit), '#2b: ScrollView formScrollRef almıyor');

// --- #2b: kritik alanlarda onFocus kaydırması ---
for (const id of ['edit-xt-server-input', 'edit-xt-user-input', 'edit-xt-pass-input',
                  'edit-st-portal-input', 'edit-st-mac-input', 'edit-st-serial-input',
                  'edit-server-code-input']) {
  const re = new RegExp(`testID="${id}"[\\s\\S]{0,120}?onFocus=\\{revealField\\}`);
  need(re.test(edit), `#2b: ${id} onFocus={revealField} yok (klavye altında kalır)`);
}

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.38 düzenleme ekranı klavye kaydırması (#2b) TEMİZ');
