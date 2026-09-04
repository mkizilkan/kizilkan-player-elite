#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('frontend/package.json')); const app=JSON.parse(read('frontend/app.json'));
const plugin=read('frontend/plugins/withMpvRuntime.js'); const denetle=read('tools/denetle.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)} console.log('✓ '+m)}
const semverAtLeast=(v,maj,min,pat)=>{const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)/);if(!m)return false;const a=m.slice(1).map(Number);return a[0]>maj||(a[0]===maj&&(a[1]>min||(a[1]===min&&a[2]>=pat)));};
ok(semverAtLeast(pkg.version,17,0,12)&&semverAtLeast(app.expo.version,17,0,12)&&semverAtLeast(app.expo.ios.buildNumber,17,0,12)&&Number(app.expo.android.versionCode)>=170012&&String(app.expo.extra?.kizilkanReleaseLabel||'').includes('v17.0.'),'v17.0.12+ sürüm zinciri');
ok(plugin.includes('def prepareKizilkanMpvLibcxx = tasks.register("prepareKizilkanMpvLibcxx")'),'MPV libc++ hazırlama taskı TaskProvider olarak tutuluyor');
ok(plugin.includes('outputs.dir(kizilkanMpvLibcxxDir)')&&plugin.includes('android.sourceSets.main.jniLibs.srcDir(kizilkanMpvLibcxxDir)'),'generated MPV libc++ JNI kaynağı ve output deklarasyonu korunuyor');
ok(plugin.includes('/merge.*JniLibFolders/')&&plugin.includes('t.dependsOn(prepareKizilkanMpvLibcxx)'),'merge*JniLibFolders explicit producer dependency mevcut');
ok(plugin.includes('/merge.*NativeLibs/')&&plugin.includes('t.dependsOn(prepareKizilkanMpvLibcxx)'),'merge*NativeLibs dependency koruması mevcut');
ok(plugin.includes('dev.jdtech.mpv:libmpv:1.0.0@aar')&&plugin.includes('libc++_shared.so'),'libmpv AAR-owned libc++ çözümü korunuyor');
ok(!plugin.includes('t.mustRunAfter(prepareKizilkanMpvLibcxx)'),'yalnız sıralama veren mustRunAfter kullanılmıyor');
ok(denetle.includes('["check-v17011-buildgate-multiscan-ui.js", "v17.0.11 build-gate + multi-account UI corrective hard-gate", ""]'),'v17.0.11 denetle girdisi yapısal olarak onarıldı');
ok(denetle.includes('["check-v17012-gradle-mpv-taskgraph.js", "v17.0.12 MPV libc++ Gradle task-graph corrective hard-gate", ""]'),'v17.0.12 gate denetle zincirine bağlı');
console.log('PASS: v17.0.12 MPV libc++ Gradle task-graph corrective contract TEMİZ');
