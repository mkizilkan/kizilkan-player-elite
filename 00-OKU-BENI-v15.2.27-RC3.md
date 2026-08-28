# KIZILKAN PLAYER ELITE v15.2.27-RC3

Bu RC3, GitHub Actions'ta RC2 ile görünür hale gelen gerçek TypeScript TS2345 hatasını düzeltir.

## Kök neden
`stalkerCreateLink()` içindeki recovery parametreleri ternary object + spread ile oluşturuluyordu. `StalkerCreds.serial` opsiyonel olduğu için TypeScript birleşim tipi `sn?: undefined` üretebiliyor ve `buildUrl(..., Record<string,string>)` çağrısı TS2345 ile duruyordu.

## Düzeltme
- `recoveryParams` açıkça `Record<string,string>` olarak kuruldu.
- `serial` ve `token` yalnız dolu string ise request parametrelerine ekleniyor.
- `long_lived=1` recovery davranışı korunuyor.
- `as any`, type assertion ile susturma veya HARD gate gevşetme yapılmadı.
- RC1 MAG playback/pagination/progress/emergency-controls ve RC2 CI TypeScript resolver düzeltmeleri korunuyor.
- Yeni RC3 hard gate, TS2345 üreten eski ternary recovery yapısının geri dönmesini engelliyor.
