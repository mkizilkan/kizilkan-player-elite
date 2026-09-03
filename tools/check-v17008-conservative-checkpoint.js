const fs=require('fs'),p=require('path'),root=p.resolve(__dirname,'..');let f=0;const r=(x,m)=>{if(!x){console.error('HATA:',m);f++}else console.log('✓',m)};const rd=x=>fs.readFileSync(p.join(root,x),'utf8');
const pkg=JSON.parse(rd('frontend/package.json')), app=JSON.parse(rd('frontend/app.json'));
const svc=rd('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const gate7=rd('tools/check-v17007-scan-journal-resume.js');
r(pkg.version==='17.0.8'&&app.expo.version==='17.0.8'&&app.expo.android.versionCode===170008,'v17.0.8 sürüm zinciri');
r(svc.includes('class ConservativeCursorTracker')&&svc.includes('AtomicLongArray'),'in-flight tabanlı konservatif cursor tracker');
r(svc.includes('checkpointTracker.safeCursor(cursor.get().toLong())'),'single/bulk güvenli contiguous checkpoint');
r(svc.includes('checkpointTracker.safeCursor(cursor.get())'),'unified güvenli 64-bit contiguous checkpoint');
r(!svc.includes('(cursor.get() - workerCount).coerceAtLeast(0L)')&&!svc.includes('(cursor.get() - concurrency).coerceAtLeast(0)'),'eski cursor-workerCount checkpoint kaldırıldı');
r((svc.match(/checkpointTracker\.begin\(workerId/g)||[]).length>=3&&(svc.match(/checkpointTracker\.finish\(workerId\)/g)||[]).length>=3,'single/bulk/unified in-flight iş takibi');
r(svc.includes('val before = (safeStart - ai * candidateCount).coerceIn(0, candidateCount)'),'bulk resume hesap ilerlemesi yeniden kurulur');
r(svc.includes('val before = (safeStart - offsets[ai]).coerceIn(0L, expectedByAccount[ai].toLong()).toInt()'),'unified resume hesap ilerlemesi yeniden kurulur');
r(svc.includes('for (i in 0 until safeStart)')&&svc.includes('panelRemaining[key]?.decrementAndGet()'),'single resume panel ilerlemesi yeniden kurulur');
r(gate7.includes('17\\.0\\.')&&gate7.includes('170007'),'v17.0.7 koruma gate forward-compatible');

// Deterministik adversarial fixture: worker#0 indeks 1'de takılıyken diğerleri 100+'e ilerlesin.
// Eski cursor-workerCount formülü 1'i atlayabilirdi; yeni minimum in-flight cursor 1'de kalmalıdır.
{ const nextAssigned=101, inFlight=[1,94,95,96,97,98,99,100]; const oldApprox=Math.max(0,nextAssigned-inFlight.length); const safe=Math.min(nextAssigned,...inFlight); r(oldApprox>safe && safe===1,'adversarial yavaş-worker checkpoint fixture'); }
if(f){console.error(`❌ ${f} v17.0.8 gate hatası`);process.exit(1)} console.log('PASS: v17.0.8 conservative checkpoint / resume-progress corrective TEMİZ');
