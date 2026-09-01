/**
 * TAŞINABİLİR TypeScript ÇÖZÜCÜ (v9.12.0)
 * ---------------------------------------------------------------------------
 * Eskiden her denetleyici `require('/home/claude/verify/node_modules/typescript')`
 * gibi SABİT bir yol kullanıyordu; bu yol yalnızca tek bir geliştirme ortamında
 * vardı. Sonuç: denetleyiciler GitHub Actions'ta, Termux'ta veya başka bir
 * makinede çalışmıyordu ("typescript bulunamadı" → 7 denetim başarısız).
 *
 * Artık TypeScript birden çok stratejiyle çözülür; hiçbir ortama bağımlı değil.
 * Öncelik projenin kendi node_modules'ıdır (package.json'da typescript devDep).
 */
const path = require("path");

function loadTS() {
  const tryPaths = [
    // 1) Normal Node çözümlemesi (tools/node_modules ve üst dizinler)
    null,
    // 2) Çalışılan dizin (denetle.js genelde frontend/ içinden çağrılır)
    [path.join(process.cwd(), "node_modules")],
    // 3) tools'un kardeşi frontend/ ve repo kökü node_modules
    [
      path.join(__dirname, "..", "frontend", "node_modules"),
      path.join(__dirname, "..", "node_modules"),
    ],
    // 4) Geliştirme ortamı yedeği (varsa; yoksa sessizce atlanır)
    ["/home/claude/verify/node_modules"],
  ];

  for (const paths of tryPaths) {
    try {
      const resolved = paths
        ? require.resolve("typescript", { paths })
        : require.resolve("typescript");
      const ts = require(resolved);
      if (ts && typeof ts.createSourceFile === "function") return ts;
    } catch {
      /* bu stratejide bulunamadı, sıradakini dene */
    }
  }

  console.error(
    "HATA: 'typescript' modülü bulunamadı.\n" +
      "Çözüm: proje kökünde (frontend/) `yarn install` çalıştırın " +
      "(typescript zaten devDependency)."
  );
  process.exit(2);
}

module.exports = loadTS();
