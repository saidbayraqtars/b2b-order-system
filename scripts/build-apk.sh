#!/usr/bin/env bash
# Kurulabilir bir Android APK üretir.
#
# Uygulama Play Store'dan dağıtılmıyor: APK dosyası elden kuruluyor, sonraki
# düzeltmeler ise uzaktan (OTA) iniyor. Bu betik yalnızca **kabuğu** üretir —
# JS değişiklikleri için `eas update` yeter, yeni APK gerekmez. Yeni APK
# yalnızca native bir kütüphane eklendiğinde ya da app.json'daki sürüm
# değiştiğinde gerekir.
#
# Kullanım:
#   scripts/build-apk.sh                       # varsayılan sunucu adresiyle
#   API_URL=http://192.168.0.10:3000 scripts/build-apk.sh
#
# Not: buradaki adres yalnızca **ilk açılıştaki öneri**. Kullanıcı giriş
# ekranından değiştirebiliyor ve değiştirdiği cihazda kalıcı (server-url.ts).
set -euo pipefail

cd "$(dirname "$0")/.."
MOBILE_DIR="$PWD/apps/mobile"

# ─────────────────────────────────────────────
# araç zinciri
# ─────────────────────────────────────────────

# Sistemdeki Java sürümü Gradle'ı kırabiliyor (RN 0.74 + Gradle 8.8, JDK 17-21
# ister; makinede 26 kurulu olabilir). Android Studio'nun kendi JDK'sı doğru
# sürümde ve zaten kurulu olduğu için o tercih ediliyor.
for candidate in \
  "/c/Program Files/Android/Android Studio/jbr" \
  "$LOCALAPPDATA/Programs/Android Studio/jbr" \
  "${JAVA_HOME:-}"; do
  if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ]; then
    export JAVA_HOME="$candidate"
    break
  fi
done
[ -n "${JAVA_HOME:-}" ] || { echo "JDK bulunamadı (Android Studio kurulu mu?)"; exit 1; }

export ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
[ -d "$ANDROID_HOME" ] || { echo "Android SDK yok: $ANDROID_HOME"; exit 1; }

# ─────────────────────────────────────────────
# imza anahtarı
# ─────────────────────────────────────────────
#
# Android bir uygulamayı imzalayan anahtarla tanıyor. Anahtar değişirse telefon
# güncellemeyi başka bir uygulama sayar ve kurulumu reddeder — kullanıcının önce
# mevcut uygulamayı silmesi gerekir. Bu yüzden anahtar bir kez üretilip
# saklanıyor; depoda değil (.gitignore), ama **yedeklenmesi şart**.
KEYSTORE="${B2B_KEYSTORE_PATH:-$MOBILE_DIR/android-signing/b2b-release.keystore}"
if [ ! -f "$KEYSTORE" ]; then
  echo "İmza anahtarı yok: $KEYSTORE"
  echo "Üretmek için:"
  echo "  \"\$JAVA_HOME/bin/keytool\" -genkeypair -v \\"
  echo "    -keystore \"$KEYSTORE\" -alias b2b -keyalg RSA -keysize 2048 \\"
  echo "    -validity 10000"
  exit 1
fi

export B2B_KEYSTORE_PATH="$(cygpath -w "$KEYSTORE" 2>/dev/null || echo "$KEYSTORE")"
export B2B_KEYSTORE_PASSWORD="${B2B_KEYSTORE_PASSWORD:-b2b-release-key}"
export B2B_KEY_ALIAS="${B2B_KEY_ALIAS:-b2b}"
export B2B_KEY_PASSWORD="${B2B_KEY_PASSWORD:-$B2B_KEYSTORE_PASSWORD}"

# ─────────────────────────────────────────────
# derleme
# ─────────────────────────────────────────────

cd "$MOBILE_DIR"

# `--clean`: android/ klasörü app.json'dan üretilen bir çıktı, kaynak değil.
# Elde kalmış bir önceki üretimin üzerine yazmak, kaldırılmış bir eklentinin
# izlerinin APK'da kalmasına yol açıyor.
echo "→ native proje üretiliyor"
EXPO_PUBLIC_API_URL="${API_URL:-${EXPO_PUBLIC_API_URL:-http://10.0.2.2:3000}}" \
  npx expo prebuild -p android --no-install --clean

cd android

# Geçici dizin açıkça veriliyor.
#
# Verilmezse Gradle'ın JVM'i `java.io.tmpdir`'i `C:\WINDOWS` olarak çözüyor —
# kabuktaki TMP/TEMP oraya geçmiyor — ve derleme, expo-updates'in Room işlemcisi
# sqlite-jdbc'nin native kütüphanesini o yazılamaz dizine açmaya çalışırken
# `AccessDeniedException` ile düşüyor. Hata kapt'ı işaret ettiği için sebebi
# yazılı olmadan bulmak pahalı.
#
# `gradlew -Dorg.gradle.jvmargs=...` **yetmiyor**: gradle.properties'teki değer
# onu eziyor. Bu yüzden dosyanın kendisi düzeltiliyor. Dosya her prebuild'de
# yeniden üretildiği için düzeltme her derlemede tekrarlanmak zorunda.
# Düz bölü, ters bölü değil: gradle.properties bir Java `.properties` dosyası ve
# orada `\` kaçış karakteri. `C:\Users\...` yazmak `C:UsersAppData...` olarak
# okunuyor ve Gradle "java.io.tmpdir var olmayan bir dizine ayarlı" diyerek iki
# saniyede düşüyor. Java bu yolları Windows'ta düz bölüyle de kabul ediyor.
#
# Üç yere birden yazmak gerekiyor, çünkü kapt Gradle'ın kendi JVM'inde
# koşmuyor: `org.gradle.jvmargs` yalnız Gradle'ı, `kotlin.daemon.jvmargs` Kotlin
# derleyici sürecini ayarlıyor ve `kapt.workers.isolation=none` işlemciyi ayrı
# bir işçi sürecine atmak yerine Gradle'ın içinde çalıştırıyor. İlk ikisi tek
# başına denendi, ikisi de yetmedi.
TMPDIR_WIN="$(cygpath -m "${TMP:-/tmp}" 2>/dev/null || echo "${TMP:-/tmp}")"
TMP_ARGS="-Djava.io.tmpdir=$TMPDIR_WIN -Dorg.sqlite.tmpdir=$TMPDIR_WIN"
if ! grep -q "java.io.tmpdir" gradle.properties; then
  sed -i "s|^org.gradle.jvmargs=.*|& $TMP_ARGS|" gradle.properties
  {
    echo ""
    echo "# scripts/build-apk.sh tarafından eklendi — bkz. oradaki açıklama."
    echo "kotlin.daemon.jvmargs=-Xmx2048m $TMP_ARGS"
    echo "kapt.workers.isolation=none"
  } >> gradle.properties
fi
grep -q "java.io.tmpdir" gradle.properties || {
  echo "gradle.properties'e geçici dizin yazılamadı"; exit 1;
}

echo "→ APK derleniyor (ilk derleme uzun sürer)"
./gradlew assembleRelease --no-daemon

APK="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
[ -f "$APK" ] || { echo "APK üretilemedi"; exit 1; }

echo
echo "APK hazır: $APK"
echo "Boyut: $(du -h "$APK" | cut -f1)"
echo
echo "Telefona kurmak için: kabloyla bağlayıp"
echo "  \"\$ANDROID_HOME/platform-tools/adb\" install -r \"$APK\""
echo "ya da dosyayı telefona kopyalayıp dokunun (bilinmeyen kaynak izni gerekir)."
