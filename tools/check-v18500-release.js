#!/usr/bin/env node
/**
 * v18.5.0 — Sürüm kapısı (kanıtlı hataların geri gelmemesi).
 *  1) Proxy açık + havuz boş → istek gönderilmeden "bulunamadı" SAYILMAZ (servis bekler, JS sorar/hata verir).
 *  2) İki aşamalı test (TCP → yargıç) + anonimlik + yük sınırı + tazeleme.
 *  3) Tanı raporu olay dizilerini 80'e KESMEZ.
 *  4) Medya Merkezi performans mimarisi (önbellekli satır + sabit düzen + toplu küçük resim).
 */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const pool = rd('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/ScanProxyPool.kt');
const svc = rd('frontend/modules/panel-scan/android/src/main/java/expo/modules/panelscan/PanelScanService.kt');
const add = rd('frontend/app/add-playlist.tsx');
const code = rd('frontend/src/utils/serverCode.ts');
const diag = rd('frontend/src/utils/diagnostics.ts');
const mc = rd('frontend/app/media-center.tsx');
const fail = [];
const need = (c, m) => { if (!c) fail.push(m); };

// 1) Boş havuz
need(/fun isEmptyPool\(\): Boolean/.test(pool), 'ScanProxyPool.isEmptyPool yok');
need(/while \(ScanProxyPool\.enabled && sel == null\)/.test(svc), 'probePhysical boş/tükenmiş havuzda beklemiyor (sessiz yanlış negatif riski)');
need(/pauseForProxy\(if \(ScanProxyPool\.isEmptyPool\(\)\) "SCAN_PROXY_EMPTY" else "SCAN_PROXY_EXHAUSTED"/.test(svc), 'duraklatma sebebi (EMPTY/EXHAUSTED) yok');
need(/ScanProxyPool\.release\(sel\)/.test(svc), 'probePhysical proxy yük sayacını bırakmıyor');
need(/await confirmScanProxyReady\(\);\s*await confirmBackgroundScanProtection\(\);/.test(add), 'tarama başlamadan boş havuz sorusu yok');
need(/proxyState\.enabled && \(proxyState\.alive \|\| 0\) === 0/.test(code), 'JS keşfi boş havuzda açık hata vermiyor');

// 2) Test motoru
need(/private fun tcpAlive\(/.test(pool) && /T\.stage = "tcp"/.test(pool) && /T\.stage = "verify"/.test(pool), 'iki aşamalı test (tcp → verify) yok');
need(/JUDGE_URL = "http:\/\/httpbin\.org\/get"/.test(pool) && /"elite"/.test(pool) && /"anonymous"/.test(pool) && /"transparent"/.test(pool), 'anonimlik sınıflandırması yok');
need(/PER_PROXY_INFLIGHT/.test(pool) && /fun release\(sel: Selection\?\)/.test(pool), 'proxy başına yük sınırı yok');
need(/fun refreshPoolIfStale\(/.test(pool) && /ScanProxyPool\.refreshPoolIfStale\(applicationContext\)/.test(svc), 'tarama öncesi tazeleme yok');
need(/GOOD_FILE/.test(pool) && /good\[key\] = entry/.test(pool), 'kalıcı iyi proxy listesi yok');

// 3) Tanı raporu
need(/function selectExportEvents\(/.test(diag) && /\(payload as any\)\.events = exportEvents\.map/.test(diag), 'rapor olayları hâlâ 80\'e kesiliyor');
need(/EXPORT_PER_DOMAIN_MIN/.test(diag), 'alan başına olay kotası yok');

// 4) Medya Merkezi
need(/const MediaRow = memo\(/.test(mc) && /const GridRow = memo\(/.test(mc), 'satırlar önbellekli değil');
need(/getItemLayout=\{getItemLayout\}/.test(mc), 'sabit düzen (getItemLayout) yok');
need(/pendingThumbsRef/.test(mc) && /setTimeout\(\(\) => \{\s*flushTimerRef\.current = null;/.test(mc), 'küçük resimler toplu işlenmiyor');
need(/MEDIA_CENTER_TAB_SWITCH/.test(mc), 'sekme geçiş telemetrisi yok');

if (fail.length) { console.log(fail.map(f => '✗ ' + f).join('\n')); console.log('BAŞARISIZ'); process.exit(1); }
console.log('PASS: v18.5.0 proxy/medya/tanı sürüm kapısı TEMİZ');
