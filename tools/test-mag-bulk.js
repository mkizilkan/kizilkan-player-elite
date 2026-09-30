#!/usr/bin/env node
/**
 * v18.7.0 — Çoklu MAC (MAG) modeli testleri (magBulk.ts).
 * MAC liste/aralık, çoklu DNS ayrıştırma (http'siz), portal keşif adayları, iş üretimi.
 */
const assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend'), process.env.KIZILKAN_TEST_RUNTIME || ''] }));
const norm = x => JSON.parse(JSON.stringify(x));
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => { throw Error('magBulk saf olmalı (import yok)'); }, console, Map, Set, Array, String, Number, Math, URL, parseInt }, { filename: file });
  return exports;
}
const M = load('frontend/src/utils/magBulk.ts');
let pass = 0;

// 1) MAC normalleştirme (çeşitli ayraç/biçim)
assert.equal(M.normalizeMacStrict('00:1a:79:aa:bb:cc'), '00:1A:79:AA:BB:CC');
assert.equal(M.normalizeMacStrict('001A79AABBCC'), '00:1A:79:AA:BB:CC');
assert.equal(M.normalizeMacStrict('00-1A-79-AA-BB-CC'), '00:1A:79:AA:BB:CC');
assert.equal(M.normalizeMacStrict('kısa'), null);
assert.equal(M.normalizeMacStrict('00:1A:79:AA:BB'), null);
pass++;

// 2) MAC listesi: virgül/boşluk/satır ayraç, tekilleştirme, geçersiz ayıklama
{
  const r = M.parseMacList('00:1A:79:00:00:01, 001A79000002\n00-1A-79-00-00-01  bozuk');
  assert.deepEqual(norm(r.macs), ['00:1A:79:00:00:01', '00:1A:79:00:00:02']); // 3.si 1.nin kopyası
  assert.deepEqual(norm(r.invalid), ['bozuk']);
  pass++;
}

// 3) MAC aralığı: bitiş ile ve adet ile; ters aralık hata; tavan kırpma
{
  const a = M.expandMacRange('00:1A:79:00:00:0A', { end: '00:1A:79:00:00:0C' });
  assert.deepEqual(norm(a.macs), ['00:1A:79:00:00:0A', '00:1A:79:00:00:0B', '00:1A:79:00:00:0C']);
  assert.equal(a.capped, false);
  const b = M.expandMacRange('00:1A:79:00:00:00', { count: 3 });
  assert.deepEqual(norm(b.macs), ['00:1A:79:00:00:00', '00:1A:79:00:00:01', '00:1A:79:00:00:02']);
  const c = M.expandMacRange('00:1A:79:00:00:05', { end: '00:1A:79:00:00:01' });
  assert.ok(c.error && c.macs.length === 0);
  const d = M.expandMacRange('00:1A:79:00:00:00', { count: 100000 });
  assert.equal(d.macs.length, M.MAG_MAX_MACS);
  assert.equal(d.capped, true);
  pass++;
}

// 4) int<->mac gidiş-dönüş (taşma sınırı 48-bit)
{
  const mac = 'AA:BB:CC:DD:EE:FF';
  assert.equal(M.intToMac(M.macToInt(mac)), mac);
  assert.equal(M.macToInt('bozuk'), null);
  pass++;
}

// 5) Portal/DNS ayrıştırma: http'siz, port opsiyonel, yol korunur, geçersiz ayıklama
{
  const r = M.parsePortalHosts('line.example.com:8080, http://iptv.test/c/  bozuk_host\nhttps://a.b:2095');
  assert.deepEqual(norm(r.hosts.map(h => [h.host, h.hasPort])), [
    ['http://line.example.com:8080', true],
    ['http://iptv.test/c', false],
    ['https://a.b:2095', true],
  ]);
  assert.deepEqual(norm(r.invalid), ['bozuk_host']);
  pass++;
}

// 6) Portal keşif adayları: port yoksa çok port×yol; port varsa yalnız o port; akıllı sıralama
{
  const noPort = M.portalDiscoveryCandidates({ raw: 'x', host: 'http://p.example.com', hasPort: false });
  assert.ok(noPort.length > 40, 'geniş port listesi denenmeli');
  assert.ok(noPort.every(u => u.startsWith('http://p.example.com:')));
  // v18.7.2: 8080 + /c/ EN ÖNDE; /c/ tüm portlarda süpürülür (yol-öncelikli), sonra /portal.php.
  assert.equal(noPort[0], 'http://p.example.com:8080/c/');
  const nPorts = M.MAG_DISCOVERY_PORTS.length;
  assert.ok(noPort.slice(0, nPorts).every(u => /\/c\/?$/.test(u)), 'ilk süpürme hep /c/ olmalı');
  assert.ok(noPort.slice(0, nPorts).some(u => /:80\/c\/?$/.test(u)) && noPort.slice(0, nPorts).some(u => /:443\/c\/?$/.test(u)));
  // /portal.php ilk süpürmeden SONRA gelir.
  assert.equal(noPort[nPorts], 'http://p.example.com:8080/portal.php');
  // Kullanıcının sorduğu portlar listede var mı (örnekler).
  for (const p of [8081, 8443, 25462, 3000, 9090, 88]) assert.ok(M.MAG_DISCOVERY_PORTS.includes(p), `port ${p} eksik`);
  // Kullanıcının sorduğu portal yolları listede var mı.
  for (const pth of ['/stalker_portal/c/', '/stalker_portal/server/', '/portal/', '/ministra/', '/ministra/c/', '/ministra/portal/', '/ministra/portal/c/']) assert.ok(M.MAG_DISCOVERY_PATHS.includes(pth), `yol ${pth} eksik`);

  const withPort = M.portalDiscoveryCandidates({ raw: 'x', host: 'http://p.example.com:2095/c', hasPort: true });
  assert.ok(withPort.every(u => u.includes(':2095')));
  assert.equal(withPort[0], 'http://p.example.com:2095/c'); // kullanıcı yolu ilk
  pass++;
}

// 7) İş üretimi: kartezyen + tavan
{
  const hosts = [{ raw: 'h1', host: 'http://h1:80', hasPort: true }, { raw: 'h2', host: 'http://h2:80', hasPort: true }];
  const macs = ['00:1A:79:00:00:01', '00:1A:79:00:00:02'];
  const j = M.buildMagBulkJobs(hosts, macs);
  assert.equal(j.jobs.length, 4);
  assert.deepEqual(norm(j.jobs[0]), { hostRaw: 'h1', portal: 'http://h1:80', mac: '00:1A:79:00:00:01', hasPort: true });
  const capped = M.buildMagBulkJobs(hosts, macs, 3);
  assert.equal(capped.jobs.length, 3);
  assert.equal(capped.capped, true);
  pass++;
}

console.log(`PASS: Çoklu MAC modeli — ${pass} test grubu TEMİZ`);
