#!/usr/bin/env node
/**
 * v16.14.3 — MPV FAIL-CLOSED BUILD/RUNTIME PACKAGING HARD-GATE
 *
 * AAR'ın Maven/Gradle cache'te bulunması RELEASE PASS değildir.
 * PASS yalnız final APK içinde aynı desteklenen ABI için BOTH libmpv.so ve
 * libc++_shared.so bulunduğunda verilir. mergeReleaseNativeLibs çıktısı ara kanıttır.
 * Build artefact yoksa exit 2 = BLOCKED/NOT VERIFIED.
 */
const fs=require('fs'), path=require('path'), cp=require('child_process'), os=require('os');
const root=path.resolve(__dirname,'..');
const gradle=fs.readFileSync(path.join(root,'frontend/modules/mpv-player/android/build.gradle'),'utf8');
if(!gradle.includes("dev.jdtech.mpv:libmpv:1.0.0")){console.error('FAIL — libmpv 1.0.0 dependency yok');process.exit(1)}
const args=process.argv.slice(2);
const argVal=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:''};
const explicitApk=argVal('--apk');
const supported=['arm64-v8a','armeabi-v7a','x86_64','x86'];
const listZip=(file)=>cp.execFileSync('unzip',['-Z1',file],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
const verifyEntries=(entries,prefix,label)=>{
  const perAbi={};
  for(const abi of supported){
    const mpv=entries.includes(`${prefix}${abi}/libmpv.so`);
    const cxx=entries.includes(`${prefix}${abi}/libc++_shared.so`);
    if(mpv||cxx) perAbi[abi]={mpv,cxx};
  }
  const complete=Object.entries(perAbi).filter(([,v])=>v.mpv&&v.cxx).map(([abi])=>abi);
  if(!Object.values(perAbi).some(v=>v.mpv)){console.error(`FAIL — ${label}: libmpv.so yok`);return false}
  if(!Object.values(perAbi).some(v=>v.cxx)){console.error(`FAIL — ${label}: libc++_shared.so yok`);return false}
  if(!complete.length){console.error(`FAIL — ${label}: libmpv.so + libc++_shared.so aynı ABI altında eşleşmiyor`);return false}
  if(!complete.includes('arm64-v8a')){console.error(`FAIL — ${label}: arm64-v8a için tam MPV native çift yok`);return false}
  console.log(`✓ ${label}: complete ABI=${complete.join(',')}`);
  return true;
};

// Artifact-level evidence only: useful diagnosis, never release PASS.
const aarRoot=path.join(os.homedir(),'.gradle','caches','modules-2','files-2.1','dev.jdtech.mpv','libmpv','1.0.0');
const aars=[];
function collectByExt(dir,ext,out,depth=0){if(depth>8||!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir)){const p=path.join(dir,n);let st;try{st=fs.statSync(p)}catch{continue}if(st.isDirectory())collectByExt(p,ext,out,depth+1);else if(n.endsWith(ext))out.push(p)}}
collectByExt(aarRoot,'.aar',aars);
if(aars.length){
  try{
    const e=listZip(aars[0]);
    const hasMpv=e.some(x=>/^jni\/[^/]+\/libmpv\.so$/.test(x));
    const hasCxx=e.some(x=>/^jni\/[^/]+\/libc\+\+_shared\.so$/.test(x));
    console.log(`ℹ resolved AAR: libmpv=${hasMpv} libc++_shared=${hasCxx} (AAR-only release PASS değildir)`);
  }catch(e){console.error('FAIL — resolved AAR okunamadı');process.exit(1)}
}

const apkCandidates=[];
if(explicitApk) apkCandidates.push(path.resolve(explicitApk));
for(const d of [
  path.join(root,'frontend/android/app/build/outputs/apk/release'),
  path.join(root,'frontend/android/app/build/outputs/apk/debug'),
]) collectByExt(d,'.apk',apkCandidates);
const apk=apkCandidates.find(p=>fs.existsSync(p));
if(apk){
  let entries;try{entries=listZip(apk)}catch{console.error('FAIL — APK açılamadı: '+apk);process.exit(1)}
  if(!verifyEntries(entries,'lib/','FINAL APK')) process.exit(1);
  console.log('✓ final APK native packaging doğrulandı:',apk);
  console.log('TEMIZ — MPV 1.0.0 FINAL APK packaging VERIFIED');
  process.exit(0);
}

// Merged native libs are an intermediate proof. Validate strictly but do NOT call release verified.
const mergedRoots=[
  path.join(root,'frontend/android/app/build/intermediates/merged_native_libs/release'),
  path.join(root,'frontend/android/app/build/intermediates/merged_jni_libs/release'),
];
const files=[];function collectAll(dir){if(!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir)){const p=path.join(dir,n);const st=fs.statSync(p);st.isDirectory()?collectAll(p):files.push(p)}}
mergedRoots.forEach(collectAll);
if(files.length){
  const has=(abi,name)=>files.some(p=>p.includes(`${path.sep}${abi}${path.sep}`)&&path.basename(p)===name);
  const complete=supported.filter(abi=>has(abi,'libmpv.so')&&has(abi,'libc++_shared.so'));
  if(!complete.includes('arm64-v8a')){console.error('FAIL — merged release native libs arm64-v8a MPV/C++ çifti eksik');process.exit(1)}
  console.log(`✓ merged release native libs complete ABI=${complete.join(',')}`);
  console.error('BLOCKED — merged libs doğrulandı fakat final APK henüz yok; release VERIFIED sayılmadı.');
  process.exit(2);
}
console.error('BLOCKED — final APK/merged release native libs yok. Önce Android build alınmalı; AAR/dependency varlığı başarı sayılmadı.');
process.exit(2);
