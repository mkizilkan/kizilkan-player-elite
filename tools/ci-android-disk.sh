#!/usr/bin/env bash
# Only the disposable GitHub-hosted Linux image may be trimmed.
set -euo pipefail

mode="${1:-check}"
if [[ "$mode" != prepare && "$mode" != check && "$mode" != report ]]; then
  echo 'Usage: ci-android-disk.sh prepare|check|report' >&2
  exit 2
fi
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux ]]; then
  echo 'Refusing disk operations outside a disposable GitHub-hosted Linux runner.' >&2
  exit 2
fi
workspace="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
min_gib="${KIZILKAN_MIN_FREE_GIB:-24}"
[[ "$min_gib" =~ ^[1-9][0-9]*$ && -d "$workspace" ]] || { echo 'Invalid disk budget/workspace' >&2; exit 2; }

report() {
  df -h "$workspace"
  for dir in "$workspace/frontend/node_modules" "$workspace/frontend/android" "${HOME}/.gradle" "${ANDROID_HOME:-/usr/local/lib/android/sdk}"; do
    if [[ -d "$dir" ]]; then du -sh "$dir" || true; fi
  done
}

if [[ "$mode" == prepare ]]; then
  echo 'Disk before Android preparation:'
  report
  # Fixed allowlist: tools unused by this Android build. Keep Java, Node, SDK,
  # licenses, build-tools, CMake, platform-tools and all four target ABIs.
  for unused in /usr/share/dotnet /usr/local/share/powershell /opt/ghc /usr/local/.ghcup /usr/share/swift /usr/local/lib/swift /usr/local/share/boost /usr/local/share/vcpkg /opt/hostedtoolcache/CodeQL /opt/az; do
    if [[ -d "$unused" ]]; then
      du -sh "$unused" || true
      sudo rm -rf -- "$unused"
    fi
  done
  # The image carries other NDKs/emulators. Keep the exact Expo 54 NDK; if
  # absent, Gradle installs it using the retained SDK manager and licenses.
  sdk="$(realpath -m "${ANDROID_HOME:-/usr/local/lib/android/sdk}")"
  if [[ "$sdk" == /usr/local/lib/android/sdk ]]; then
    sudo rm -rf -- "$sdk/system-images"
    for ndk in "$sdk"/ndk/*; do
      [[ -d "$ndk" && ! -L "$ndk" ]] || continue
      version="${ndk##*/}"
      if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$version" != 27.1.12297006 ]]; then
        sudo rm -rf -- "$ndk"
      fi
    done
  else
    echo "SDK outside the known image directory; SDK cleanup skipped."
  fi
fi

report
if [[ "$mode" == report ]]; then exit 0; fi
free_kib="$(df -Pk "$workspace" | awk 'NR==2 {print $4}')"
[[ "$free_kib" =~ ^[0-9]+$ ]] || { echo 'Cannot determine available disk space' >&2; exit 2; }
required_kib=$((min_gib * 1024 * 1024))
echo "Android disk budget: ${free_kib} KiB available; ${min_gib} GiB required."
if (( free_kib < required_kib )); then
  echo "::error::Insufficient runner disk space before Gradle: need ${min_gib} GiB. See disk report; APK build was not started."
  exit 1
fi
