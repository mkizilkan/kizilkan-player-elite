#!/usr/bin/env node
/**
 * v18.4.0 — Medya Merkezi SAF model testleri (deviceMediaModel.ts).
 * Türkçe duyarsız arama, sıralama, gruplama, akıllı filtreler, kalite rozeti.
 */
const assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'frontend'), process.env.KIZILKAN_TEST_RUNTIME || ''] }));
const norm = x => JSON.parse(JSON.stringify(x));
function load(file) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => { throw Error('deviceMediaModel saf olmalı (import yok)'); }, console, Map, Set, Date, Math, String, Number, Array }, { filename: file });
  return exports;
}
const M = load('frontend/src/utils/deviceMediaModel.ts');
let pass = 0;
const it = (id, name, extra = {}) => ({ id, uri: `content://media/${id}`, name, size: 0, dateAdded: 0, dateModified: 0, mime: '', folder: '', ...extra });

// 1) Türkçe duyarsız normalleştirme
assert.equal(M.normalizeTr('İSTANBUL Şarkısı'), 'istanbul sarkisi');
assert.equal(M.normalizeTr('IĞDIR'), 'igdir');
assert.equal(M.normalizeTr('çocuk_gÜNÜ-2024.mp3'), 'cocuk gunu 2024 mp3');
pass++;

// 2) Arama: tüm kelimeler, sanatçı/albüm/klasör dahil, sıra fark etmez
const song = it(1, 'Gülpembe.mp3', { artist: 'Barış Manço', album: 'Sahibinden İhtiyaçtan', folder: 'Music' });
assert.equal(M.matchesQuery(song, 'baris'), true);
assert.equal(M.matchesQuery(song, 'gulpembe manco'), true);
assert.equal(M.matchesQuery(song, 'IHTIYACTAN'), true);
assert.equal(M.matchesQuery(song, 'tarkan'), false);
assert.equal(M.matchesQuery(song, ''), true);
pass++;

// 3) Sıralama: ad (Türkçe, sayısal), tarih azalan, süre
const list = [it(1, 'b10.mp4', { dateAdded: 3, duration: 5000 }), it(2, 'b2.mp4', { dateAdded: 1, duration: 9000 }), it(3, 'Çay.mp4', { dateAdded: 2, duration: 1000 })];
assert.deepEqual(norm(M.sortItems(list, 'name', false).map(x => x.name)), ['b2.mp4', 'b10.mp4', 'Çay.mp4']);
assert.deepEqual(norm(M.sortItems(list, 'date', true).map(x => x.id)), [1, 3, 2]);
assert.deepEqual(norm(M.sortItems(list, 'duration', false).map(x => x.id)), [3, 1, 2]);
pass++;

// 4) Gruplama: ay başlıkları (fotoğraf zaman çizelgesi) + albüm
const sep = Date.UTC(2026, 8, 15) / 1000, aug = Date.UTC(2026, 7, 10) / 1000;
const photos = [it(1, 'a.jpg', { dateModified: sep }), it(2, 'b.jpg', { dateModified: sep }), it(3, 'c.jpg', { dateModified: aug })];
const g = M.groupItems(photos, 'month');
assert.deepEqual(norm(g.map(s => [s.title, s.items.length])), [['Eylül 2026', 2], ['Ağustos 2026', 1]]);
const albums = M.groupItems([it(1, 'x', { album: 'A' }), it(2, 'y', { album: '<unknown>' }), it(3, 'z', { album: 'A' })], 'album');
assert.deepEqual(norm(albums.map(s => [s.title, s.items.length])), [['A', 2], ['Bilinmeyen albüm', 1]]);
assert.equal(M.groupItems(photos, 'none').length, 1);
pass++;

// 5) Kalite rozeti (dikey video dahil)
assert.equal(M.qualityBadge(3840, 2160), '4K');
assert.equal(M.qualityBadge(1080, 1920), 'FHD');
assert.equal(M.qualityBadge(1280, 720), 'HD');
assert.equal(M.qualityBadge(640, 360), null);
assert.equal(M.qualityBadge(0, 0), null);
pass++;

// 6) Akıllı filtreler
const vids = [it(1, 'kisa.mp4', { duration: 30000 }), it(2, 'film.mkv', { duration: 90 * 60000 }), it(3, 'Screen_2026.mp4', { folder: 'Screen recordings', duration: 120000 })];
assert.deepEqual(norm(M.applySmartFilter(vids, 'short').map(x => x.id)), [1]);
assert.deepEqual(norm(M.applySmartFilter(vids, 'long').map(x => x.id)), [2]);
assert.deepEqual(norm(M.applySmartFilter(vids, 'screen').map(x => x.id)), [3]);
const auds = [it(1, 'voice.opus', { duration: 8000 }), it(2, 'song.mp3', { duration: 200000 }), it(3, 'nodur.mp3')];
assert.deepEqual(norm(M.applySmartFilter(auds, 'hideShortAudio').map(x => x.id)), [2, 3]);
pass++;

// 7) Süre biçimi
assert.equal(M.fmtMs(185000), '3:05');
assert.equal(M.fmtMs(3723000), '1:02:03');
assert.equal(M.fmtMs(0), '');
pass++;

// 8) v18.5.0: önceden hesaplanan anahtarlar (arama/sıralama sonucu değişmemeli)
{
  const a = [it(1, 'Çiçek.mp3', { artist: 'Barış' }), it(2, 'arı.mp3'), it(3, 'Bal.mp3')];
  M.withSearchKeys(a);
  assert.equal(a[0]._k, 'cicek mp3 baris');
  assert.equal(a[0]._n, 'cicek mp3');
  assert.equal(M.matchesQuery(a[0], 'BARIS'), true);
  assert.deepEqual(norm(M.sortItems(a, 'name', false).map(x => x.id)), [2, 3, 1]);
  pass++;
}

console.log(`PASS: Medya Merkezi modeli — ${pass} test grubu TEMİZ`);
