# DÜZELTME YORUMU — v15.2.27-RC3

GitHub Actions RC2 build logunda doğrulanan hata:
`frontend/src/utils/stalker.ts(1202,28): error TS2345`

Kök neden, opsiyonel `serial?: string` alanının ternary recovery object spread içinde `string | undefined` olarak genişlemesiydi. `buildUrl` yalnız `Record<string,string>` kabul ettiği için CI'nın gerçek TypeScript project gate'i build'i doğru biçimde durdurdu.

RC3'te recovery request map açık `Record<string,string>` olarak oluşturulur. Opsiyonel `serial` ve session token yalnız dolu string ise eklenir; `long_lived=1` korunur. Bu düzeltme runtime davranışını zayıflatmaz ve TypeScript güvenliğini gevşetmez.
