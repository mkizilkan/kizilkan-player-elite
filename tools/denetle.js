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
    const clean = /TEMIZ|TEMİZ|YOK$/.test(last);
    if (!clean) { failed++; console.log(out.trim()); }
    console.log(`${clean ? "✓" : "✗"} ${label}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${label}  (çalıştırılamadı: ${e.message.split("\n")[0]})`);
  }
}

console.log(
  failed === 0
    ? "\n✅ TÜM DENETİMLER TEMİZ — paketlenebilir"
    : `\n❌ ${failed} DENETİM BAŞARISIZ — düzeltmeden paketleme`
);
process.exit(failed === 0 ? 0 : 1);
