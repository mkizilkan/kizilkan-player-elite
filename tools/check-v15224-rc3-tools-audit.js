#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TOOLS = __dirname;
const files = fs.readdirSync(TOOLS)
  .filter((name) => name.endsWith(".js"))
  .sort();

if (files.length < 27) {
  console.error(`HATA — tools JS sayısı beklenenden düşük: ${files.length}`);
  process.exit(1);
}

for (const name of files) {
  const full = path.join(TOOLS, name);
  const result = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`HATA — JS syntax: ${name}`);
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(1);
  }
}

const rc2Gate = fs.readFileSync(path.join(TOOLS, "check-v15224-rc2-memory-native.js"), "utf8");
if (!rc2Gate.includes('const ROOT = path.resolve(__dirname, "..")')) {
  console.error("HATA — RC2 gate repo-root çözümleyicisi yok");
  process.exit(1);
}
if (/readFileSync\(\s*["']frontend\//.test(rc2Gate)) {
  console.error("HATA — RC2 gate tekrar CWD-relative frontend yolu kullanıyor");
  process.exit(1);
}

console.log(`TEMIZ — v15.2.24 RC3 tools audit: ${files.length} JS syntax + rooted path contract`);
