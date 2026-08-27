#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TOOLS = __dirname;
const ROOT = path.resolve(TOOLS, "..");
const FRONT = path.join(ROOT, "frontend");
const TARGET = path.join(TOOLS, "check-v15224-rc2-memory-native.js");

for (const required of [
  path.join(FRONT, "package.json"),
  path.join(FRONT, "app", "(tabs)", "index.tsx"),
  TARGET,
]) {
  if (!fs.existsSync(required)) {
    console.error("HATA — RC3 CWD self-test gerekli dosya yok:", required);
    process.exit(1);
  }
}

const cases = [
  ["repo-root", ROOT],
  ["frontend", FRONT],
  ["tools", TOOLS],
];

for (const [label, cwd] of cases) {
  const r = spawnSync(process.execPath, [TARGET], { cwd, encoding: "utf8" });
  if (r.status !== 0 || !/TEMIZ|TEMİZ/.test(`${r.stdout}\n${r.stderr}`)) {
    console.error(`HATA — RC2 gate CWD self-test başarısız (${label})`);
    if (r.stdout) console.error(r.stdout.trim());
    if (r.stderr) console.error(r.stderr.trim());
    process.exit(1);
  }
}

console.log("TEMIZ — v15.2.24 RC3 gate CWD invariance self-test (repo/frontend/tools)");
