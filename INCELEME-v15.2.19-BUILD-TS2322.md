# v15.2.19 BUILD TS2322 KÖK NEDEN İNCELEMESİ

GitHub Actions gerçek `npx tsc --noEmit` kapısı:

`src/store/PlaylistContext.tsx(531,21): TS2322 Type 'Promise<boolean | void>' is not assignable to type 'Promise<void>'.`

Kaynak sözleşmesi:
- `storage.setItem()` dönüşü `Promise<boolean>`.
- `activeSwitchWriteQueue` tipi `useRef<Promise<void>>(Promise.resolve())`.
- v15.2.19 `.then(() => storage.setItem(key, id))` kullandığı için zincirin resolved tipi boolean'a genişliyordu.

v15.2.20 düzeltmesi:
```ts
.then(async () => {
  await storage.setItem(key, id);
});
```
Async callback explicit değer döndürmediği için dönüş `Promise<void>` olur.

Ek koruma:
- `check-v15220-flight-recorder.js` eski kırık kalıbı yasaklıyor.
- `check-v15220-typescript-semantic.js` gerçek PlaylistContext persist bloğunu kaynak dosyadan çıkarıp TypeScript compiler API ile `Promise<void>` assignment sözleşmesinde semantik olarak derliyor.
