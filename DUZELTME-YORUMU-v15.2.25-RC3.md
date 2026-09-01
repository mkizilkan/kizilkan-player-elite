# DÜZELTME YORUMU — v15.2.25 RC3

- RC2'deki MAG254-first mimarisi ve learned MAG compatibility storage korunmuştur.
- TypeScript hard-gate `--project frontend/tsconfig.json --noEmit` semantiğine sabitlenmiştir.
- Gate, tsconfig veya yerel TypeScript bağımlılığı yoksa fail-closed davranır; kontrolü atlayıp başarı üretmez.
- `tools/denetle.js` RC3 proje-config TypeScript gate'ini master zincire ekler.
- Amaç Termux/GitHub/build ortamlarında aynı proje semantiğinin denetlenmesidir.
