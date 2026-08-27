# Regresyon Denetimi v15.2.10-RC1

1. Scan başlar başlamaz analiz modalı görünür.
2. Pause/Resume/Stop aynı runId’yi kontrol eder.
3. Stop açık HttpURLConnection bağlantılarını disconnect eder ve executor shutdownNow çağırır.
4. Tarama tamamlanınca modal açık kalır; seçim olmadan import/route yoktur.
5. PIN’li profil process restart sonrası /profile-select kapısını atlayamaz.
