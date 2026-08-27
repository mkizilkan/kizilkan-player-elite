#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let bad = 0;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const need = (rel, token, label) => {
  if (!read(rel).includes(token)) { console.error("HATA:", label); bad++; }
};
const forbid = (rel, token, label) => {
  if (read(rel).includes(token)) { console.error("HATA:", label); bad++; }
};

const idx = "frontend/app/(tabs)/index.tsx";
const scan = "frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt";
const stalk = "frontend/src/utils/stalker.ts";

need(idx, "KizilkanNativeCore.available ? (nativeSummary?.channels", "Room summary canonical live count");
forbid(idx, "canlı sayfa sorgusu başarısız; legacy hydrate", "Room failure must not full-hydrate live catalog");
forbid(idx, "VOD/Series sayfa sorgusu başarısız; legacy hydrate", "Room failure must not full-hydrate library");
forbid(scan, "val work = ArrayList<Work>()", "scan must not materialize candidate×account Work matrix");
need(scan, "fun resolveWork(index: Int): Pair<Int, Int>", "scan cursor resolver");
need(scan, "val start = (matches.size - 200).coerceAtLeast(0)", "bounded periodic scan snapshot");
need(stalk, "STALKER_COMPAT_ATTEMPT", "MAG compatibility telemetry");
need(stalk, "mag250-encoded", "encoded MAC compatibility");
need(stalk, "mag254-encoded", "MAG254 compatibility");
forbid(stalk, "ses.compatProfile),120000", "120s MAG page timeout removed");

if (bad) {
  console.error(`❌ ${bad} v15.2.24 RC2 gate hatası`);
  process.exit(1);
}
console.log("TEMIZ — v15.2.24 RC2 memory/native/MAG compatibility corrective contract");
