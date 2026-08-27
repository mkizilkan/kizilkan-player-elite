# DÜZELTME YORUMU — v15.2.22 RC1

Gerçek cihaz testinde iki ana alan hedeflendi: Flight Recorder'ın olay kaybını azaltmak/tam sıfırlamayı güvenilir yapmak ve önceki sürümlerde çalışan MAG portal uyumluluğunu genişletmek.

MAG tarafında mevcut implementasyon silinmedi. Endpoint discovery, session cache, profile varyantları, VOD/Series ve create_link zinciri korunarak genişletildi. Canlı katalog `get_all_channels` boş/hatalı olduğunda kontrollü `get_ordered_list` fallback'ine geçer. Live, VOD ve Series birbirinden izole edildi; tek bölümün hatası mevcut diğer içeriği çöpe atmaz. Üç bölüm de başarısızsa hata yine kullanıcıya yüzeye çıkar.

Flight Recorder V4 kapasitesi yükseltildi, eski V3/V2 kayıtlarının okunabilirliği korunurken tam temizleme V4 ve legacy depoları birlikte kapsayacak hale getirildi. Android sisteminin ApplicationExitInfo geçmişi uygulama tarafından silinemediğinden, temizleme anı epoch olarak kalıcı saklanır ve önceki exit kayıtları yeni rapora dahil edilmez.
