#!/usr/bin/env bash
# One-time setup for the browser tests (npm run e2e).
# Everything it downloads stays inside this project folder, and it never needs root:
#   - a headless Chromium for Playwright, under node_modules/playwright-core/.local-browsers
#   - on Linux only, if the system lacks them, the two libraries Chromium needs (NSS and NSPR),
#     unpacked into .local/chromium-libs
# On macOS the Chromium download is all that is needed.
set -euo pipefail
cd "$(dirname "$0")/.."

export PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install --only-shell chromium

if [ "$(uname -s)" != "Linux" ]; then
  echo "Browser installed. Nothing else is needed on this system."
  exit 0
fi

if ldconfig -p | grep -q 'libnss3\.so' && ldconfig -p | grep -q 'libnspr4\.so'; then
  echo "libnss3 and libnspr4 are installed system-wide. Nothing else to do."
  exit 0
fi

if [ -f .local/chromium-libs/libnss3.so ] && [ -f .local/chromium-libs/libnspr4.so ]; then
  echo "libnss3 and libnspr4 are already unpacked in .local/chromium-libs."
  exit 0
fi

if ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg >/dev/null 2>&1; then
  echo "libnss3 or libnspr4 is missing and this is not a Debian/Ubuntu system."
  echo "Install your distribution's NSS and NSPR packages, then run the browser tests."
  exit 1
fi

echo "libnss3 or libnspr4 is not installed system-wide. Unpacking local copies (no root needed)."
mkdir -p .local/debs .local/chromium-libs
(cd .local/debs && apt-get download libnss3 libnspr4)
for package in .local/debs/*.deb; do
  dpkg -x "$package" .local/debs/unpacked
done
find .local/debs/unpacked -name '*.so*' -exec cp -a {} .local/chromium-libs/ \;
echo "Unpacked into .local/chromium-libs. playwright.config.ts picks this folder up by itself."
