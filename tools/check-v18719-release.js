#!/usr/bin/env node
/**
 * v18.7.19 — U4 kalıcılaştırma:
 * Oynatmadan türetilen Xtream kullanıcı adı/şifre (login portalde boş olduğunda tek kaynak) artık
 * storage'da saklanır (`kizilkan.streamCreds`) ve açılışta belleğe yüklenir → kart her açılışta gösterir
 * (eski bellek-içi harita yeniden açılışta kaybolup "Belirlenemedi" bırakıyordu). Değerler loglanmaz.
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

const stalker = rd('frontend/src/utils/stalker.ts');
const layout = rd('frontend/app/_layout.tsx');
const app = JSON.parse(rd('frontend/app.json'));

const ver = app.expo.version; const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(ver);
const code = m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0;
need(code >= 180719, `expo.version (${ver}) >= 18.7.19 değil`);
need(app.expo.ios.buildNumber === ver && Number(app.expo.android.versionCode) === code && app.expo.extra.kizilkanReleaseLabel === `GPT ELITE v${ver} RC1`, 'beş sürüm alanı tutarsız');
need(JSON.parse(rd('frontend/package.json')).version === ver, 'package.json sürümü farklı');

need(/const STREAM_CREDS_KEY = "kizilkan\.streamCreds"/.test(stalker), 'U4: storage anahtarı yok');
need(/function persistStreamDerivedCreds/.test(stalker) && /export async function hydrateStreamDerivedCredentials/.test(stalker), 'U4: persist/hydrate fonksiyonları yok');
need(/persistStreamDerivedCreds\(\); \}/.test(stalker), 'U4: türetme anında persist çağrısı yok');
need(/hydrateStreamDerivedCredentials\(\)/.test(layout), 'U4: açılışta hydrate çağrısı yok');
// Güvenlik: değer loglanmaz (yalnız uzunluk/boolean telemetri)
need(!/recordDiagnostic\([^)]*derived\.username/.test(stalker), 'GÜVENLİK: türetilen kullanıcı adı DEĞERİ loglanıyor olabilir');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.7.19 U4 türetilmiş kimlik kalıcılaştırma (storage + hydrate) TEMİZ');
