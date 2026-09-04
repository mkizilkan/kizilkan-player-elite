/**
 * KIZILKAN PLAYER ELITE v17.0.12 — MPV native runtime C++ ABI/task-graph hardening.
 *
 * libmpv 1.0.0 is built against the libc++ shipped inside its own AAR. A generic
 * "pick any libc++_shared.so" rule can package another dependency's older C++
 * runtime and make libmpv fail at dlopen() with a missing std::__ndk1 symbol.
 * This plugin extracts the AAR-owned libc++ into an app-owned generated jniLibs
 * source before mergeNativeLibs. The final APK hard-gate separately proves that
 * libmpv's undefined C++ symbols are provided by the packaged libc++.
 */
const { withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEP = "implementation 'dev.jdtech.mpv:libmpv:1.0.0'";
const MARKER = '// KIZILKAN v17.0.10: libmpv-owned libc++ runtime';
const TASK_GRAPH_MARKER = '// KIZILKAN v17.0.12: explicit MPV libc++ producer-consumer task dependency';
const KEEP = [
  '',
  '# KIZILKAN PLAYER ELITE v16.14.8+ — libmpv runtime class keep',
  '-keep class dev.jdtech.mpv.** { *; }',
  '-keepclassmembers class dev.jdtech.mpv.** { *; }',
  '',
].join('\n');

const GRADLE = String.raw`
${MARKER}
def kizilkanMpvLibcxxDir = file("$buildDir/generated/kizilkanMpvLibcxx")
def kizilkanMpvAar = configurations.detachedConfiguration(
    dependencies.create("dev.jdtech.mpv:libmpv:1.0.0@aar")
)
def prepareKizilkanMpvLibcxx = tasks.register("prepareKizilkanMpvLibcxx") {
    outputs.dir(kizilkanMpvLibcxxDir)
    doLast {
        delete(kizilkanMpvLibcxxDir)
        def aar = kizilkanMpvAar.singleFile
        copy {
            from(zipTree(aar)) { include "jni/**/libc++_shared.so"; eachFile { f -> f.path = f.path.replaceFirst(/^jni\//, "") }; includeEmptyDirs = false }
            into(kizilkanMpvLibcxxDir)
        }
        def arm64 = file("$kizilkanMpvLibcxxDir/arm64-v8a/libc++_shared.so")
        if (!arm64.exists()) throw new GradleException("KIZILKAN MPV: libmpv 1.0.0 AAR arm64 libc++_shared.so içermiyor")
    }
}
android.sourceSets.main.jniLibs.srcDir(kizilkanMpvLibcxxDir)
android.packagingOptions.jniLibs.pickFirsts += ["**/libc++_shared.so"]
${TASK_GRAPH_MARKER}
tasks.configureEach { t ->
    if (t.name =~ /merge.*JniLibFolders/ || t.name =~ /merge.*NativeLibs/) {
        t.dependsOn(prepareKizilkanMpvLibcxx)
    }
}
`;

module.exports = function withMpvRuntime(config) {
  config = withAppBuildGradle(config, cfg => {
    let src = cfg.modResults.contents;
    if (!src.includes(DEP)) {
      const dependencies = /dependencies\s*\{/;
      if (!dependencies.test(src)) throw new Error('MPV runtime hardening: app build.gradle dependencies bloğu bulunamadı.');
      src = src.replace(dependencies, match => `${match}\n    ${DEP}`);
    }
    if (!src.includes(MARKER)) src += `\n${GRADLE}\n`;
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withDangerousMod(config, ['android', async cfg => {
    const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    let src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!src.includes('-keep class dev.jdtech.mpv.**')) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, src.replace(/\s*$/, '') + KEEP, 'utf8');
    }
    return cfg;
  }]);
  return config;
};
