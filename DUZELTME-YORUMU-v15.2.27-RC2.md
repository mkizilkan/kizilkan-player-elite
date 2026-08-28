# DÜZELTME YORUMU — v15.2.27-RC2

GitHub Actions build'i `Statik denetim (denetle.js) - HARD gate` adımında iki TypeScript project gate nedeniyle durdu. Bağımlılık kurulum adımı başarılı görünmesine rağmen eski gate'ler TypeScript CLI için tek bir fiziksel yolu şart koşuyordu ve `denetle.js` child stderr/stdout ayrıntısını gizliyordu.

RC2 düzeltmesi gate'i bypass etmez. CI dependency kurulumu devDependencies dahil ve frozen-lockfile olarak zorlanır; TypeScript CLI ayrı preflight ile kanıtlanır; iki eski gate taşınabilir resolver üzerinden aynı gerçek `tsc --project ... --noEmit` kontrolünü çalıştırır. Hata devam ederse gerçek compiler çıktısı CI logunda görünür.
