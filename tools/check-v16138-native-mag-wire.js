const fs=require('fs'); const path=require('path'); const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const kt=read('frontend/modules/kizilkan-native-core/android/src/main/java/expo/modules/kizilkannativecore/KizilkanNativeCoreModule.kt');
const ts=read('frontend/src/utils/stalker.ts'); const mod=read('frontend/modules/kizilkan-native-core/index.ts'); const gradle=read('frontend/modules/kizilkan-native-core/android/build.gradle');
const checks=[
 ['native bridge',/AsyncFunction\("magExactRequest"\)/.test(kt)&&/magExactRequest: async/.test(mod)],
 ['OkHttp pinned',/okhttp:4\.12\.0/.test(gradle)&&/OkHttpClient\.Builder/.test(kt)],
 ['manual redirect boundary',/followRedirects\(false\)/.test(kt)&&/nextHeaders\.remove\("Authorization"\)/.test(kt)&&/nextHeaders\.remove\("Cookie"\)/.test(kt)],
 ['secure fingerprints',/SHA-256/.test(kt)&&/cookieFingerprint/.test(kt)&&/authorizationFingerprint/.test(kt)],
 ['pcap native routing',/NATIVE_OKHTTP/.test(ts)&&/MAG320_UA/.test(ts)&&/Europe%2FParis/.test(ts)],
 ['handshake exact no-js first',/wire-nojs[\s\S]{0,100}type:"stb", action:"handshake"/.test(ts)&&/profile === "pcap320-minimal"/.test(ts)],
 ['real rate-limit retained',/status===429/.test(ts)&&/MAG_RATE_LIMIT/.test(ts)],
 ['fallback retained',/mag254-encoded/.test(ts)&&/wire250/.test(ts)&&/golden/.test(ts)],
]; let bad=0; for(const [n,ok] of checks){console.log(`${ok?'✓':'✗'} ${n}`); if(!ok)bad++;} if(bad) process.exit(1); console.log('TEMIZ — v16.13.8 Native MAG exact-wire / secure telemetry / fallback preservation');
