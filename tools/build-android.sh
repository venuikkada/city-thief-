#!/usr/bin/env bash
# Builds the Android app: CityThief.apk (the game inside, works offline, Indian English voices).
# Needs (Ubuntu): sudo apt-get install android-sdk-build-tools android-sdk-platform-23 dalvik-exchange aapt apksigner zipalign
# Usage: tools/build-android.sh <out-folder> <keystore.jks>   (password in the env var CT_KS_PASS)
# Keep the keystore safe: updates of the app must be signed with the same key.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$1"; KS="$2"; PASS="${CT_KS_PASS:?set CT_KS_PASS}"
SDK=/usr/lib/android-sdk; BT="$SDK/build-tools/29.0.3"; JAR="$SDK/platforms/android-23/android.jar"
B="$OUT/build"; rm -rf "$B"; mkdir -p "$B/res" "$B/assets" "$B/classes"
cp -r "$REPO/android/res/." "$B/res/"
# App icon in every screen density.
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  n=${d%%:*}; s=${d##*:}; mkdir -p "$B/res/mipmap-$n"
  python3 -c "from PIL import Image; Image.open('$REPO/web-demo/assets/icons/icon-512.png').convert('RGBA').resize(($s,$s), Image.LANCZOS).save('$B/res/mipmap-$n/ic_launcher.png')"
done
# The game files.
cp -r "$REPO/web-demo" "$B/assets/game"; rm -rf "$B/assets/game/download" "$B/assets/game/.htaccess"
# Code -> dex.
if ! javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -d "$B/classes" $(find "$REPO/android/src" -name '*.java') > "$B/javac.log" 2>&1; then
  grep -v "_JAVA_OPTIONS\|JAVA_TOOL_OPTIONS" "$B/javac.log"; echo "javac failed"; exit 1
fi
"$BT/dx" --dex --min-sdk-version=24 --output="$B/classes.dex" "$B/classes"
# Package, align, sign.
aapt package -f -M "$REPO/android/AndroidManifest.xml" -S "$B/res" -A "$B/assets" -I "$JAR" -F "$B/app.unsigned.apk" -0 glb -0 hdr -0 jpg -0 png -0 mp3
(cd "$B" && aapt add app.unsigned.apk classes.dex > /dev/null)
zipalign -f -p 4 "$B/app.unsigned.apk" "$B/app.aligned.apk"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -noprompt -keystore "$KS" -storepass "$PASS" -keypass "$PASS" -alias citythief -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Venu Brushwood, OU=City Thief, O=Venu Brushwood, L=India, C=IN" > /dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --ks-key-alias citythief --out "$OUT/CityThief.apk" "$B/app.aligned.apk"
apksigner verify "$OUT/CityThief.apk" && echo "built $OUT/CityThief.apk ($(du -h "$OUT/CityThief.apk" | cut -f1))"
