const { withAppBuildGradle } = require("@expo/config-plugins");

// Release APK'sını gerçek bir anahtarla imzalar.
//
// Neden gerekiyor: uygulama Play Store'dan değil elden kuruluyor ve Android bir
// APK'yı **imzalayan anahtarla** tanıyor. Anahtar değişirse telefon güncellemeyi
// "başka bir uygulama" sayar, kurulum reddedilir ve kullanıcının önce mevcut
// uygulamayı silmesi gerekir — üstelik sildiği şeyle birlikte cihazdaki oturumu
// ve sunucu ayarı da gider. Expo'nun şablonu release'i **debug** anahtarıyla
// imzalıyor: şifresi herkesçe bilinen ("android"), depoda duran bir anahtar.
//
// Neden eklenti olarak: `expo prebuild` android/ klasörünü baştan üretiyor, yani
// build.gradle'a elle yapılan her düzenleme bir sonraki prebuild'de siliniyor.
// Yapılandırma app.json'da durduğu sürece üretilen proje her seferinde aynı
// oluyor.
//
// Anahtarın kendisi ve şifreleri ortam değişkenlerinden geliyor, depoda değil.
// Hiçbiri tanımlı değilse debug anahtarına düşülüyor: makinesinde anahtar
// olmayan biri yine de derleyebilsin diye — o APK dağıtılamaz, ama denemek için
// çalışır.
const RELEASE_SIGNING_CONFIG = `
        release {
            storeFile file(System.getenv("B2B_KEYSTORE_PATH") ?: "debug.keystore")
            storePassword System.getenv("B2B_KEYSTORE_PASSWORD") ?: "android"
            keyAlias System.getenv("B2B_KEY_ALIAS") ?: "androiddebugkey"
            keyPassword System.getenv("B2B_KEY_PASSWORD") ?: "android"
        }
`;

module.exports = function withReleaseSigning(config) {
  // EAS'in derleyicisinde çalışmıyor. Orada imza anahtarını EAS'in kendisi
  // yönetiyor: prebuild'den sonra release signingConfig'ini o yazıyor ve
  // anahtarı hesapta saklıyor. İkimiz birden yazarsak aynı bloğu iki kez
  // tanımlamış oluruz, üstelik bizim sürüm ortam değişkeni bulamayıp **debug**
  // anahtarına düşer — yani derleme, dağıtılamayacak bir APK üretir.
  if (process.env.EAS_BUILD) return config;

  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes("B2B_KEYSTORE_PATH")) {
      // Debug bloğunun kapanışının hemen ardına; signingConfigs'in içinde kalsın.
      contents = contents.replace(
        /(signingConfigs \{[\s\S]*?keyPassword 'android'\s*\n\s*\}\n)/,
        `$1${RELEASE_SIGNING_CONFIG}`,
      );
    }

    // Yalnızca `buildTypes` içindeki release bloğu değişmeli. Düz bir arama-
    // değiştir, az önce signingConfigs'e eklediğimiz `release {` bloğundan
    // başlayıp **debug** buildType'ının satırını değiştiriyordu: sonuç, debug
    // derlemesinin release anahtarıyla, release derlemesinin debug anahtarıyla
    // imzalanmasıydı — tam tersi. Bu yüzden konum hesaplanıyor.
    const buildTypesAt = contents.indexOf("buildTypes {");
    const releaseAt = buildTypesAt === -1
      ? -1
      : contents.indexOf("release {", buildTypesAt);
    const debugSigningAt = releaseAt === -1
      ? -1
      : contents.indexOf("signingConfig signingConfigs.debug", releaseAt);

    if (debugSigningAt !== -1) {
      contents =
        contents.slice(0, debugSigningAt) +
        "signingConfig signingConfigs.release" +
        contents.slice(debugSigningAt + "signingConfig signingConfigs.debug".length);
    } else if (releaseAt === -1 || !contents.includes("signingConfigs.release")) {
      throw new Error(
        "withReleaseSigning: release imza yapılandırması eklenemedi — " +
          "android/app/build.gradle şablonu beklenenden farklı.",
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};
