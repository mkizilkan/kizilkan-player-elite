#!/usr/bin/env node
/**
 * v16.14.2 — MPV BUILD/RUNTIME PACKAGING HARD-GATE
 * Dependency satırını başarı saymaz. Gradle'ın resolve ettiği gerçek 1.0.0 AAR
 * veya mergeReleaseNativeLibs çıktısı bulunmadan PASS vermez.
 */
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os');
const root=path.resolve(__dirname,'..');
const gradle=fs.readFileSync(path.join(root,'frontend/modules/mpv-player/android/build.gradle'),'utf8');
if(!gradle.includes("dev.jdtech.mpv:libmpv:1.0.0")){console.error('FAIL — libmpv 1.0.0 dependency yok');process.exit(1)}
const candidates=[];
const cache=path.join(os.homedir(),'.gradle','caches','modules-2','files-2.1','dev.jdtech.mpv','libmpv','1.0.0');
function walk(dir,depth=0){if(depth>5||!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir)){const p=path.join(dir,n);let st;try{st=fs.statSync(p)}catch{continue} if(st.isDirectory())walk(p,depth+1);else if(/\.aar$/i.test(n))candidates.push(p)}}
walk(cache);
const mergedRoots=[path.join(root,'frontend/android/app/build/intermediates/merged_native_libs/release'),path.join(root,'frontend/android/app/build/intermediates/merged_jni_libs/release')];
let entries=[];
if(candidates.length){
 const aar=candidates[0];
 try{entries=cp.execFileSync('unzip',['-Z1',aar],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean)}catch(e){console.error('FAIL — AAR açılamadı',aar);process.exit(1)}
 console.log('AAR',aar);
} else {
 for(const r of mergedRoots){walk(r);}
 if(!mergedRoots.some(fs.existsSync)){
   console.error('BLOCKED — Gradle resolved AAR veya mergeReleaseNativeLibs çıktısı yok. Önce dependency-resolved Android release/prebuild çalıştırılmalı.');
   process.exit(2);
 }
}
if(entries.length){
 const abis=[...new Set(entries.map(x=>/^jni\/([^/]+)\//.exec(x)?.[1]).filter(Boolean))];
 const mpv=entries.filter(x=>/^jni\/[^/]+\/libmpv\.so$/.test(x));
 const cxx=entries.filter(x=>/^jni\/[^/]+\/libc\+\+_shared\.so$/.test(x));
 if(!mpv.length){console.error('FAIL — AAR içinde libmpv.so yok');process.exit(1)}
 if(!abis.includes('arm64-v8a')){console.error('FAIL — arm64-v8a libmpv yok');process.exit(1)}
 console.log('✓ libmpv.so',mpv.length,'ABI:',abis.join(','));
 console.log(cxx.length?'✓ libc++_shared.so AAR içinde mevcut':'ℹ libc++_shared.so başka dependency/packaging katmanından gelebilir; merged output ayrıca doğrulanmalı');
 console.log('TEMIZ — MPV 1.0.0 resolved AAR/JNI gate');
 process.exit(0);
}
// merged native libs path mode
const all=[];function collect(dir){if(!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir)){const p=path.join(dir,n);const st=fs.statSync(p);if(st.isDirectory())collect(p);else all.push(p)}}
mergedRoots.forEach(collect);
const mpv=all.filter(p=>path.basename(p)==='libmpv.so');
const cxx=all.filter(p=>path.basename(p)==='libc++_shared.so');
if(!mpv.length||!cxx.length){console.error(`FAIL — merged native libs eksik: libmpv=${mpv.length} libc++_shared=${cxx.length}`);process.exit(1)}
console.log(`✓ merged release native libs: libmpv=${mpv.length}, libc++_shared=${cxx.length}`);
console.log('TEMIZ — MPV release merged-native-libs gate');
