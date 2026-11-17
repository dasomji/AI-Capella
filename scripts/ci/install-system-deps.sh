#!/usr/bin/env bash
# Installs the server sandbox / PDF tools the suites need: python3, libseccomp2, poppler-utils.
# Fast path: skip what the runner image already has and try without `apt-get update`
# (the slow, flaky part: 9–45 s in CI history); fall back to update + install when the
# package index is stale.
set -euo pipefail
packages=(python3 libseccomp2 poppler-utils)
missing=()
for p in "${packages[@]}"; do
  dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q 'install ok installed' || missing+=("$p")
done
if [ "${#missing[@]}" -eq 0 ]; then
  echo "System packages already present: ${packages[*]}"
  exit 0
fi
echo "Installing: ${missing[*]}"
if ! sudo apt-get install -y "${missing[@]}"; then
  echo "::notice title=apt index refresh::Installing ${missing[*]} from the cached package index failed; running apt-get update and retrying."
  sudo apt-get update
  sudo apt-get install -y "${missing[@]}"
fi
command -v pdftoppm >/dev/null || { echo "::error title=System dependencies::pdftoppm (poppler-utils) is not on PATH after installation."; exit 1; }
