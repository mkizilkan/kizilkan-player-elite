#!/usr/bin/env node
const fs=require('fs'),path=require('path'); const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'); const pkg=JSON.parse(read('frontend/package.json')); const app=JSON.parse(read('frontend/app.json'));
const ui=read('frontend/app/add-playlist.tsx'), host=read('frontend/src/player/PlayerHost.tsx'), oldGate=read('tools/check-v17003-mpv-room-tv-foundation.js');
function ok(c,m){if(!c){console.error('FAIL — '+m);process.exit(1)} console.log('✓ '+m)}
const parts=String(pkg.version||'').split('.').map(Number); const atLeast17011=parts.length===3&&parts.every(Number.isFinite)&&(parts[0]>17||(parts[0]===17&&(parts[1]>0||(parts[1]===0&&parts[2]>=11))));
ok(atLeast17011&&app.expo.version===pkg.version&&app.expo.ios.buildNumber===pkg.version&&app.expo.android.versionCode>=170011&&app.expo.extra?.kizilkanReleaseLabel===`GPT ELITE v${pkg.version} RC1`,'v17.0.11+ sürüm zinciri');
ok(oldGate.includes("v17003Parts")&&!oldGate.includes('/^17\\.0\\.[3-9]$/'),'v17.0.3 gate forward-semver');
ok(/AppState,\s*BackHandler,\s*}\s*from "react-native"/.test(host)&&!host.includes('import { BackHandler } from "react-native";'),'BackHandler ana react-native importunda');
const modal=ui.slice(ui.indexOf('visible={showBulkCandidates}'),ui.indexOf('visible={showDiscoveryMatches}'));
const scanControls=modal.indexOf('{!bulkScanFinished && ('); const list=modal.indexOf('<SectionList'); const dns=modal.indexOf('DNS: {bulkUseAllValidatedHosts'); const select=modal.indexOf('Tümünü Seç');
ok(scanControls>=0&&scanControls<list&&dns>=0&&dns<list&&select>=0&&select<list,'çoklu hesap kritik aksiyonları virtualized listenin üstünde');
ok(!modal.includes('bulkNativeScanRef.current || !!bulkPreparationAbortRef.current || bulkScanPaused || bulkScanStopping'),'Durdur görünürlüğü ref mount koşulundan bağımsız');
ok(modal.includes('disabled={bulkAdding || bulkScanStopping || !bulkScanRunIdRef.current}')&&modal.includes('Hazırlanıyor'),'Duraklat hazırlık güvenliği korunuyor');
ok(modal.includes('selectedBulkCandidateKeys.length===0 || !bulkScanFinished')&&modal.includes('Taramanın Bitmesini Bekleyin'),'ekleme tarama bitene kadar kilitli');
ok(modal.includes('<SectionList')&&modal.includes('bulkAccountProgress.map')&&modal.includes('bulkCandidates.map'),'SectionList hesap+aday sanallaştırması korunuyor');
ok(ui.includes('maxHeight: "92%"')&&ui.includes('bulkFoundBadgeText'),'modal alanı ve Bulunan vurgusu korunuyor');
console.log('PASS: v17.0.11 build-gate + multi-account UI corrective contract TEMİZ');
