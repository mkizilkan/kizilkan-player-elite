#!/usr/bin/env node
/**
 * KIZILKAN PLAYER — TÜM DENETİMLERİ ÇALIŞTIR
 * Kullanım:  cd frontend && node ../tools/denetle.js
 *
 * Bu betik 10 statik denetleyiciyi sırayla çalıştırır. Her biri, geliştirme
 * sırasında GERÇEKTEN YAŞANMIŞ bir çökme/hata sınıfından sonra yazıldı.
 * Derleme öncesi çalıştırılırsa o hatalar bir daha kullanıcıya ulaşmaz.
 */
const { execSync } = require("child_process");
const path = require("path");

const TOOLS = __dirname;
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
