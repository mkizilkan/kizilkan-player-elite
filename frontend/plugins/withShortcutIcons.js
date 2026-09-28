/**
 * KIZILKAN PLAYER — withShortcutIcons (v18.6.0)
 * ===========================================================================
 * Ana ekran kısayollarının (uygulama simgesine uzun basma) SİMGELERİ.
 *
 * SORUN (cihaz gözlemi): kısayollarda Android sistem simgeleri (android.R.drawable)
 * kullanılıyordu; birçok başlatıcı bunları çizmiyor → kısayolların yanı boş kutu.
 *
 * ÇÖZÜM: uygulamanın kendi simgeleri. Android 8+ için uyarlanabilir simge (zemin
 * #0A0000 + kırmızı #E30A17 glif; başlatıcı kendi şekline kırpar), Android 7.1 için
 * düz vektör. Native kod bunları getIdentifier ile bulur (modül uygulamanın R sınıfını
 * göremez). Glifler Material Icons (Apache 2.0) yollarıdır.
 * ===========================================================================
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const RED = '#E30A17';
const BG = '#0A0000';
const GLYPHS = {
  search: 'M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z',
  star: 'M12,17.27L18.18,21l-1.64,-7.03L22,9.24l-7.19,-0.61L12,2 9.19,8.63 2,9.24l5.46,4.73L5.82,21z',
  guide: 'M17,12h-5v5h5v-5zM16,1v2H8V1H6v2H5c-1.11,0 -1.99,0.9 -1.99,2L3,19c0,1.1 0.89,2 2,2h14c1.1,0 2,-0.9 2,-2V5c0,-1.1 -0.9,-2 -2,-2h-1V1h-2zM19,19H5V8h14v11z',
  multiview: 'M3,3v8h8V3H3zM9,9H5V5h4v4zM3,13v8h8v-8H3zM9,19H5v-4h4v4zM13,3v8h8V3h-8zM19,9h-4V5h4v4zM13,13v8h8v-8h-8zM19,19h-4v-4h4v4z',
};

// Uyarlanabilir simge ön yüzü: 108dp tuval, görünür alan ortadaki 72dp; glif 24→48dp (ortalı).
const fg = (d) => `<?xml version="1.0" encoding="utf-8"?>
<!-- KIZILKAN v18.6.0: kısayol simgesi (withShortcutIcons) -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <group android:translateX="30" android:translateY="30" android:scaleX="2" android:scaleY="2">
    <path android:fillColor="${RED}" android:pathData="${d}"/>
  </group>
</vector>
`;
const adaptive = (name) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/kizilkan_shortcut_bg"/>
  <foreground android:drawable="@drawable/ksc_${name}_fg"/>
</adaptive-icon>
`;
// Android 7.1 (uyarlanabilir simge yok): koyu daire zemin + glif.
const legacy = (d) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="48dp" android:height="48dp" android:viewportWidth="48" android:viewportHeight="48">
  <path android:fillColor="${BG}" android:pathData="M24,0a24,24 0,1 1,0 48a24,24 0,1 1,0 -48z"/>
  <group android:translateX="12" android:translateY="12">
    <path android:fillColor="${RED}" android:pathData="${d}"/>
  </group>
</vector>
`;

module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      const dirs = {
        drawable: path.join(res, 'drawable'),
        anydpi: path.join(res, 'mipmap-anydpi-v26'),
        values: path.join(res, 'values'),
      };
      Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));
      for (const [name, d] of Object.entries(GLYPHS)) {
        fs.writeFileSync(path.join(dirs.drawable, `ksc_${name}_fg.xml`), fg(d));
        fs.writeFileSync(path.join(dirs.drawable, `ksc_${name}_legacy.xml`), legacy(d));
        fs.writeFileSync(path.join(dirs.anydpi, `ksc_${name}.xml`), adaptive(name));
      }
      fs.writeFileSync(
        path.join(dirs.values, 'kizilkan_shortcut_colors.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="kizilkan_shortcut_bg">${BG}</color>\n</resources>\n`,
      );
      return cfg;
    },
  ]);
