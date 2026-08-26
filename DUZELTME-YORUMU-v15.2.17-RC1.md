# DÜZELTME YORUMU — v15.2.17-RC1

Gerçek cihazdaki toplu analiz crash'inde OOM/ANR/native-crash kanıtı yoktu; Android `CRASH` raporladı ve scan flight recorder boş kaldı. Kaynak incelemesinde unified jobs JSON'unun Android Intent extras içinde taşındığı görüldü. v15.2.17 bu büyük Binder payload yolunu kaldırır, app-private staging + candidate dedupe kullanır ve crash öncesi/sonrası kanıt zincirini güçlendirir. MAG portal bağlantısı için de ham fallback yerine endpoint/HTTP/response-type katmanlı teşhis eklenir.
