#!/usr/bin/env node
/**
 * KIZILKAN PLAYER — TÜM DENETİMLERİ ÇALIŞTIR
 * Kullanım:  cd frontend && node ../tools/denetle.js
 *
 * Bu betik kritik statik/fonksiyonel denetleyicileri sırayla çalıştırır. Her biri, geliştirme
 * sırasında GERÇEKTEN YAŞANMIŞ bir çökme/hata sınıfından sonra yazıldı.
 * Derleme öncesi çalıştırılırsa o hatalar bir daha kullanıcıya ulaşmaz.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const TOOLS = __dirname;
const PROJECT_ROOT = path.resolve(TOOLS, "..");
const FRONTEND_ROOT = path.join(PROJECT_ROOT, "frontend");
if (!fs.existsSync(path.join(FRONTEND_ROOT, "package.json"))) throw new Error("frontend/package.json bulunamadı");
if (process.cwd() !== FRONTEND_ROOT) process.chdir(FRONTEND_ROOT);
// TypeScript artık tools/_ts.js ile taşınabilir şekilde çözülür (sabit yol yok).

const CHECKS = [
  ["checkdefs.js",     "Tanımsız sembol (hook/JSX bileşeni)",   ""],
  ["checkcalls.js",    "Tanımsız fonksiyon çağrısı",            ""],
  ["checkctx.js",      "Tanımsız context value alanı",          "src/store/*.tsx"],
  ["checkdeps.js",     "Bayat kapanış (stale closure)",         "APP_SRC"],
  ["checkjsx.js",      "Tanımsız JSX prop değişkeni",           ""],
  ["checktdz.js",      "Kullanım-önce-tanım (const hoisting)",  ""],
  ["checkhooksrc.js",  "Yanlış hook kaynağı",                   ""],
  ["checkimports.js",  "Eksik nokta-import (Modal/Alert/…)",    ""],
  ["checkplayercore.js", "Player Core v15 kritik regresyon kapisi", ""],
  ["check-v15214-hardening.js", "v15.2.14 Stalker/Backup fonksiyonel fixture", ""],
  ["check-v15215-typescript-contract.js", "v15.2.15 Stalker Series TypeScript contract", ""],
  ["check-v15216-diagnostics.js", "v15.2.16 Tanılama/MAG session cache contract", ""],
  ["check-v15217-scan-transport.js", "v15.2.17 Scan transport/crash/MAG connection contract", ""],
  ["check-v15218-blackbox.js", "v15.2.18 State consistency / Black Box V2 contract", ""],
  ["check-v15219-corrective.js", "v15.2.19 Corrective gate/test compatibility contract", ""],
  ["check-v15220-flight-recorder.js", "v15.2.20 Flight Recorder v3 / TypeScript corrective contract", ""],
  ["check-v15220-typescript-semantic.js", "v15.2.20 Playlist Promise<void> semantic contract", ""],
  ["check-v15221-typescript-media3.js", "v15.2.21 Media3 EngineProfile semantic contract", ""],
  ["check-v15222-flight-recorder-mag.js", "v15.2.22 Flight Recorder V4 / MAG compatibility contract", ""],
  ["check-v15223-flight-recorder-mag.js", "v15.2.23 Flight Recorder V5 / total reset / MAG HTTP telemetry", ""],
  ["check-v15223-complete-corrective.js", "v15.2.23 RC2 P0 complete corrective contract", ""],
  ["check-v15224-mag-room-stall.js", "v15.2.24 MAG single-flight / Room verify / Media3 stall contract", ""],
  ["check-v15224-rc2-memory-native.js", "v15.2.24 RC2 memory / native paging / MAG compatibility contract", ""],
  ["check-v15224-rc3-gate-cwd.js", "v15.2.24 RC3 gate CWD invariance self-test", ""],
  ["check-v15224-rc3-tools-audit.js", "v15.2.24 RC3 tools JS syntax / rooted-path audit", ""],
  ["check-v15224-rc3-claude-memory-telemetry.js", "v15.2.24 RC3 Claude memory / telemetry / no-regression contract", ""],
  ["check-v15225-mag-architecture.js", "v15.2.25 MAG254 learned handshake / live-first / Room enrichment contract", ""],
  ["check-v15225-rc2-storage-contract.js", "v15.2.25 RC2 learned MAG storage TypeScript contract", ""],
  ["check-v15225-rc2-typescript-build.js", "v15.2.25 RC2 full TypeScript --noEmit build gate", ""],
  ["check-v15225-rc3-typescript-project.js", "v15.2.25 RC3 tsconfig-bound TypeScript project gate", ""],
  ["check-v15226-rc1-lockfile.js", "v15.2.26 RC1 lockfile/package integrity contract", ""],
  ["check-v15227-mag-playback-pagination-ui.js", "v15.2.27 MAG playback/pagination/progress/emergency-controls contract", ""],
  ["check-v15227-rc2-ci-tsc-fix.js", "v15.2.27 RC2 CI TypeScript HARD gate resolver/install contract", ""],
  ["check-v15227-rc3-stalker-ts2345-fix.js", "v15.2.27 RC3 Stalker create_link TS2345 type-safety contract", ""],
  ["check-v16121-pcap-mag-player-controls.js", "v16.12.1 PCAP MAG320 / stronger ban-safe / stale-frame / controls contract", ""],
  ["check-v16122-pcap-first-rate-limit-telemetry.js", "v16.12.2 PCAP-first / learned migration / rate-limit-aware cooldown / request telemetry", ""],
  ["check-v16130-db-health-telemetry.js", "v16.13.0 DB Health Center / safe maintenance / Flight Recorder V6", ""],
  ["check-v16131-native-blackbox-kotlin.js", "v16.13.1 NativeBlackBox Kotlin signature / ANR Flight Recorder fix", ""],
  ["check-v16135-category-mag-policy.js", "v16.13.5 selective category persistence / relaxed MAG self-ban", ""],
  ["check-v16136-playlist-management.js", "v16.13.6 playlist management / category reselect / duplicate / expiry", ""],
  ["check-v16137-build-corrective.js", "v16.13.7 CI build corrective / playlist styles / MAG legacy gate", ""],
  ["check-v16138-native-mag-wire.js", "v16.13.8 Native MAG exact-wire / secure telemetry", ""],
  ["check-v16139-ci-native-module-compat.js", "v16.13.9 CI fixture / TypeScript corrective", ""],
  ["check-v161310-catalog-mag-playlist-management.js", "v16.13.10 catalog / MAG runtime / playlist management corrective", ""],
  ["checktdzselftest.js", "TDZ denetleyici self-test (v14.2 crash)", ""],
];

let failed = 0;
console.log("═══ KIZILKAN PLAYER — DENETİM ═══\n");

for (const [file, label, argMode] of CHECKS) {
  let args = "";
  if (argMode === "src/store/*.tsx") args = "src/store/*.tsx src/theme/*.tsx";
  else if (argMode === "APP_SRC") {
    // Dosya adlarında parantez olabilir ((tabs) klasörü) -> tırnak şart.
    args = execSync(`find app src -name "*.tsx" -o -name "*.ts"`)
      .toString().trim().split("\n").map(p => JSON.stringify(p)).join(" ");
  }
  try {
    const out = execSync(`node ${path.join(TOOLS, file)} ${args}`, { encoding: "utf8" });
    const last = out.trim().split("\n").pop();
    const clean = /TEMIZ|TEMİZ|YOK$|^PASS[: ]/.test(last);
    if (!clean) { failed++; console.log(out.trim()); }
    console.log(`${clean ? "✓" : "✗"} ${label}`);
  } catch (e) {
    failed++;
    // v15.2.27-RC2 FIX: child gate'in gerçek stdout/stderr'ini gizleme.
    // CI ekranında yalnız "Command failed" görmek kök nedeni örter.
    const childOut = [e.stdout, e.stderr]
      .filter(Boolean)
      .map(v => Buffer.isBuffer(v) ? v.toString("utf8") : String(v))
      .join("\n")
      .trim();
    if (childOut) console.log(childOut);
    console.log(`✗ ${label}  (çalıştırılamadı: ${e.message.split("\n")[0]})`);
  }
}

console.log(
  failed === 0
    ? "\n✅ TÜM DENETİMLER TEMİZ — paketlenebilir"
    : `\n❌ ${failed} DENETİM BAŞARISIZ — düzeltmeden paketleme`
);
process.exit(failed === 0 ? 0 : 1);

