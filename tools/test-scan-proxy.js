#!/usr/bin/env node
/**
 * v18.3.0 — Taramaya özel proxy: satır ayrıştırıcı birim testleri (SAF, Node).
 * scanProxyParse.ts'i transpile edip her rehber biçimini doğrular.
 */
const assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const norm = (x) => JSON.parse(JSON.stringify(x));
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend'), process.env.KIZILKAN_TEST_RUNTIME || ''] }));
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => { throw Error('scanProxyParse saf olmalı (import yok)'); }, console, Set, Number, parseInt, RegExp }, { filename: file });
  return exports;
}

const P = load('frontend/src/utils/scanProxyParse.ts');
let pass = 0;
const one = (line, expect) => {
  const r = P.parseProxyLine(line);
  assert.equal(r.length, 1, `tek giriş bekleniyordu: "${line}" → ${JSON.stringify(r)}`);
  assert.deepEqual(norm(r[0]), norm(expect), `"${line}" yanlış: ${JSON.stringify(r[0])}`);
  pass++;
};

// 1) ip:port (şema yok → http)
one('192.168.1.50:8080', { scheme: 'http', host: '192.168.1.50', port: 8080, user: undefined, pass: undefined });
// 2) http://ip:port
one('http://192.168.1.50:8080', { scheme: 'http', host: '192.168.1.50', port: 8080, user: undefined, pass: undefined });
// 3) https://ip:port
one('https://1.2.3.4:443', { scheme: 'https', host: '1.2.3.4', port: 443, user: undefined, pass: undefined });
// 4) socks4://
one('socks4://1.2.3.4:1080', { scheme: 'socks4', host: '1.2.3.4', port: 1080, user: undefined, pass: undefined });
// 5) socks5://
one('socks5://1.2.3.4:1080', { scheme: 'socks5', host: '1.2.3.4', port: 1080, user: undefined, pass: undefined });
// 6) socks:// → socks5
one('socks://1.2.3.4:1080', { scheme: 'socks5', host: '1.2.3.4', port: 1080, user: undefined, pass: undefined });
// 7) http + kimlik
one('http://ahmet:sifre123@192.168.1.50:8080', { scheme: 'http', host: '192.168.1.50', port: 8080, user: 'ahmet', pass: 'sifre123' });
// 8) socks5 + kimlik
one('socks5://ahmet:sifre123@192.168.1.50:1080', { scheme: 'socks5', host: '192.168.1.50', port: 1080, user: 'ahmet', pass: 'sifre123' });
// 9) şema yok + kimlik → http
one('user:pass@host.example.com:3128', { scheme: 'http', host: 'host.example.com', port: 3128, user: 'user', pass: 'pass' });
// 10) rotating gateway (domain + kimlik)
one('http://user:pass@proxy.example.com:3128', { scheme: 'http', host: 'proxy.example.com', port: 3128, user: 'user', pass: 'pass' });
// 11) domain uç nokta (rotating, kimliksiz)
one('gw.saglayici.com:7777', { scheme: 'http', host: 'gw.saglayici.com', port: 7777, user: undefined, pass: undefined });
// 12) satır sonu fazladan sütun atılır
one('1.2.3.4:8080  US-A elite', { scheme: 'http', host: '1.2.3.4', port: 8080, user: undefined, pass: undefined });
// 13) şifre içinde @ değil ama kullanıcı adı '.' — son '@' böler
one('socks5://ali.veli:p@10.0.0.1:1080', { scheme: 'socks5', host: '10.0.0.1', port: 1080, user: 'ali.veli', pass: 'p' });

// 14) port aralığı → çok giriş (rotating port range)
{
  const r = P.parseProxyLine('gw.saglayici.com:10000-10003');
  assert.equal(r.length, 4, 'port aralığı 4 giriş üretmeli: ' + JSON.stringify(r));
  assert.deepEqual(norm(r.map(e => e.port)), [10000, 10001, 10002, 10003]);
  assert.equal(r[0].host, 'gw.saglayici.com');
  pass++;
}
// 15) yorum ve boş satırlar atılır
assert.equal(P.parseProxyLine('# yorum').length, 0);
assert.equal(P.parseProxyLine('// yorum').length, 0);
assert.equal(P.parseProxyLine('   ').length, 0);
assert.equal(P.parseProxyLine('bozuk-satir').length, 0, 'port yoksa atılmalı');
pass++;

// 16) çok satır + tekilleştirme
{
  const txt = '1.2.3.4:8080\n1.2.3.4:8080\nsocks5://1.2.3.4:1080\n# yorum\n';
  const list = P.parseProxyText(txt);
  assert.equal(list.length, 2, 'tekilleştirme: ' + JSON.stringify(list));
  pass++;
}

// 17) maskeleme kimlik gizler
assert.equal(P.maskProxyEntry({ scheme: 'socks5', host: 'h', port: 1, user: 'u', pass: 'p' }), 'socks5://***:***@h:1');
assert.equal(P.maskProxyEntry({ scheme: 'http', host: 'h', port: 1 }), 'http://h:1');
pass++;

// 18) hedef http:// kimliği açığa çıkarır
assert.equal(P.targetExposesCredentials('http://panel.example.com'), true);
assert.equal(P.targetExposesCredentials('https://panel.example.com'), false);
pass++;

console.log(`PASS: scan-proxy parser — ${pass} test grubu TEMİZ`);
