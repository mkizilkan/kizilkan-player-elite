/**
 * EKSİK NOKTA-IMPORT DENETLEYİCİSİ (8. araç)
 *
 * Yakaladığı hata: react-native'den gelen bir bileşen/nesne KULLANILIYOR ama
 * import edilmemiş.  Örn:  <Modal ...>  ya da  Alert.alert(...)
 *
 * DOĞDUĞU OLAY: v7.6.0'da kanal önizleme paneli eklenirken Modal, Pressable
 * ve Image import edilmemişti — bu denetim üçünü de yakaladı.
 * Daha önce de Alert, Platform, KeyboardAvoidingView eksiklikleri bulmuştu.
 *
 * NOT: Bu denetim başlangıçta bash döngüsüydü; kalıcı olsun diye dosyaya
 * çevrildi (v8.7.2).
 */
const fs = require("fs");
const path = require("path");

/** react-native'den import edilmesi gereken, sık unutulan isimler. */
const WATCH = [
  "Alert", "Platform", "BackHandler", "TextInput", "Dimensions",
  "KeyboardAvoidingView", "Modal", "Pressable", "Image", "ScrollView",
  "FlatList", "ActivityIndicator", "StyleSheet", "TouchableOpacity",
  "Linking", "Share", "Vibration", "Appearance", "PixelRatio",
];

/**
 * Bilerek atlananlar: dinamik import ile alınanlar.
 * (Örn. Share, index.tsx'te `await import("react-native")` ile kullanılıyor.)
 */
const DYNAMIC_OK = new Set(["Share", "Linking"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

let problems = 0;

for (const file of [...walk("app"), ...walk("src")]) {
  const src = fs.readFileSync(file, "utf8");

  // import bloğu: dosyanın ilk ~80 satırı yeterli
  const head = src.split("\n").slice(0, 80).join("\n");

  for (const name of WATCH) {
    // Kullanım: <Modal ...>  veya  Alert.alert(...)
    const usedAsJsx = new RegExp(`<${name}[\\s/>]`).test(src);
    const usedAsObj = new RegExp(`\\b${name}\\.[a-zA-Z]`).test(src);
    if (!usedAsJsx && !usedAsObj) continue;

    // Dinamik import ile alınıyorsa atla
    if (DYNAMIC_OK.has(name) && new RegExp(`import\\(["']react-native["']\\)`).test(src)) continue;

    // Import edilmiş mi? (isim, import bloğunda geçiyor mu)
    const imported = new RegExp(`\\b${name}\\b`).test(head);
    if (!imported) {
      console.log(`  EKSİK IMPORT  ${file}  ->  ${name}`);
      problems++;
    }
  }
}

console.log(
  problems === 0
    ? "\nTEMIZ — eksik nokta-import yok"
    : `\n${problems} EKSİK IMPORT`
);
