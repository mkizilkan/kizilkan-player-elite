#!/usr/bin/env node
/**
 * v18.7.12 — MAG çoklu-IP DNS failover davranış testi (gerçek modül, izole fixture'lar).
 * Cihaz kanıtı: goldensm32.xyz 5 A kaydı, yalnız 1'i canlı; sistem DNS ölü IP veriyor → timeout.
 * Test: DoH tüm A kayıtlarını verir; yalnız canlı IP yanıt verir; modül canlı IP'yi sabitler;
 * connectInfo bağlantıyı canlı IP'ye çevirir (Host hostname kalır); logicalUrl geri çevirir.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('./_ts');
const frontend = path.resolve(__dirname, '..', 'frontend');

function loadModule(fetchImpl, opts = {}) {
  const source = fs.readFileSync(path.join(frontend, 'src/utils/magHostFailover.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const diagnostics = [];
  const req = id => id === '@/src/utils/diagnostics'
    ? { recordDiagnostic: async (...a) => { diagnostics.push(a); } }
    : require(id);
  vm.runInNewContext(code, {
    exports, module: { exports }, require: req, console, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, fetch: fetchImpl,
  }, { filename: 'magHostFailover.ts' });
  if (!opts.keepDefault) exports._setHostFailoverEnabled(true); // VM'de navigator yok → testte açıkça aç
  return { m: exports, diagnostics };
}

const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) });
// DoH: iki A kaydı. Canlı = 2.2.2.2 (yanıt), ölü = 1.1.1.1 (AbortError).
function makeFetch(aRecords, liveIps, opts = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      calls.push({ url, headers: init.headers || {} });
      if (/dns\.google|cloudflare-dns/.test(url)) {
        if (opts.dohFail) throw new Error('doh down');
        return response({ Answer: aRecords.map(ip => ({ type: 1, data: ip })) });
      }
      // IP probe: http://<ip>:port/
      const ip = new URL(url).hostname;
      if (liveIps.includes(ip)) return response('ok');
      const e = new Error('aborted'); e.name = 'AbortError'; throw e; // ölü → timeout/abort
    },
  };
}

(async () => {
  let groups = 0;
  {
    // (a) Çoklu A kaydı, yalnız biri canlı → canlı IP sabitlenir; connectInfo/logicalUrl doğru.
    const f = makeFetch(['1.1.1.1', '2.2.2.2', '3.3.3.3'], ['2.2.2.2']);
    const { m, diagnostics } = loadModule(f.fetch);
    await m.ensureLiveHostIp('http://portal.test/c');
    const conn = m.connectInfo('http://portal.test/c/portal.php');
    assert.equal(conn.url, 'http://2.2.2.2/c/portal.php', 'bağlantı canlı IP\'ye çevrilmeli');
    assert.equal(conn.host, 'portal.test', 'Host başlığı hostname kalmalı');
    assert.equal(m.logicalUrl('http://2.2.2.2/c/portal.php'), 'http://portal.test/c/portal.php', 'finalUrl hostname\'e geri çevrilmeli');
    assert.ok(diagnostics.some(d => d[1] === 'MAG_HOST_IP_FAILOVER'), 'failover telemetrisi');
    // DoH tüm A kayıtlarını istedi + ölü/canlı yoklandı
    assert.ok(f.calls.some(c => /dns-json|dns\.google/.test(c.url) || /type=A/.test(c.url)), 'DoH çağrısı yapılmalı');
    console.log('PASS: multi-IP, only live pinned; connect->IP, Host kept, logical->hostname'); groups++;
  }
  {
    // (b) Tek A kaydı → failover gereksiz, connectInfo URL'i değiştirmez.
    const f = makeFetch(['9.9.9.9'], ['9.9.9.9']);
    const { m } = loadModule(f.fetch);
    await m.ensureLiveHostIp('http://single.test/c');
    { const c = m.connectInfo('http://single.test/c/portal.php'); assert.equal(c.url, 'http://single.test/c/portal.php'); assert.equal(c.host, undefined); }
    console.log('PASS: single A-record -> no failover'); groups++;
  }
  {
    // (c) HTTPS → SNI; failover dokunmaz.
    const f = makeFetch(['1.1.1.1', '2.2.2.2'], ['2.2.2.2']);
    const { m } = loadModule(f.fetch);
    await m.ensureLiveHostIp('https://secure.test/c');
    { const c = m.connectInfo('https://secure.test/c/portal.php'); assert.equal(c.url, 'https://secure.test/c/portal.php'); assert.equal(c.host, undefined); }
    console.log('PASS: https untouched (SNI)'); groups++;
  }
  {
    // (d) Hiçbir IP canlı değil → pin yok; connectInfo URL'i değiştirmez (güvenli).
    const f = makeFetch(['1.1.1.1', '3.3.3.3'], []);
    const { m, diagnostics } = loadModule(f.fetch);
    await m.ensureLiveHostIp('http://dead.test/c');
    { const c = m.connectInfo('http://dead.test/c'); assert.equal(c.url, 'http://dead.test/c'); assert.equal(c.host, undefined); }
    assert.ok(diagnostics.some(d => d[1] === 'MAG_HOST_IP_FAILOVER_NONE'), 'failover-none telemetrisi');
    console.log('PASS: no live IP -> no pin, url unchanged'); groups++;
  }
  {
    // (e) IP girişi → DoH/failover gereksiz.
    const f = makeFetch(['1.1.1.1', '2.2.2.2'], ['2.2.2.2']);
    const { m } = loadModule(f.fetch);
    await m.ensureLiveHostIp('http://5.5.5.5:8080/c');
    { const c = m.connectInfo('http://5.5.5.5:8080/c'); assert.equal(c.url, 'http://5.5.5.5:8080/c'); assert.equal(c.host, undefined); }
    console.log('PASS: literal IP input -> no failover'); groups++;
  }
  {
    // (f) DoH tamamen başarısız → pin yok, çökme yok.
    const f = makeFetch(['1.1.1.1', '2.2.2.2'], ['2.2.2.2'], { dohFail: true });
    const { m } = loadModule(f.fetch);
    await m.ensureLiveHostIp('http://dohdown.test/c');
    { const c = m.connectInfo('http://dohdown.test/c'); assert.equal(c.url, 'http://dohdown.test/c'); assert.equal(c.host, undefined); }
    console.log('PASS: DoH failure -> graceful no-op'); groups++;
  }
  {
    // (g) Varsayılan: React Native dışı ortamda (Node/VM test koşumları) failover KAPALI → hiç DoH
    // isteği yok, URL değişmez. Diğer MAG testlerinin fetch sayımları bu yüzden etkilenmez.
    const f = makeFetch(['1.1.1.1', '2.2.2.2'], ['2.2.2.2']);
    const { m } = loadModule(f.fetch, { keepDefault: true });
    await m.ensureLiveHostIp('http://portal.test/c');
    assert.equal(f.calls.length, 0, 'kapalıyken hiçbir ağ isteği yapılmamalı');
    const c = m.connectInfo('http://portal.test/c/portal.php');
    assert.equal(c.url, 'http://portal.test/c/portal.php'); assert.equal(c.host, undefined);
    console.log('PASS: disabled outside React Native -> zero requests, url unchanged'); groups++;
  }
  console.log(`PASS: MAG host failover — ${groups} behavior groups`);
})().catch(e => { console.error(e); process.exitCode = 1; });
