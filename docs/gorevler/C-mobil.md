# C — Mobil uygulama (ikinci hesap)

Önce [`docs/IS-BOLUMU.md`](../IS-BOLUMU.md) okunur. Dal `mobil/yenileme`,
klasör `D:\projeler\b2b-mobil`, `TEST_SCHEMA=test_mobil`. Hafıza:
`docs/hafiza/b2b-mobile.md`, `b2b-apk-ota.md`, `b2b-field-mobile-49.md`,
`b2b-local-infra.md`. Bu dört not okunmadan başlanmaz; içlerindeki tuzakların
her biri bir kez gün kaybettirdi.

## Said'in kararı (2026-10-04)

Android ve iOS ikisi de olacak. **Önce Android, APK olarak** yayımlanır. iOS
müşteri yoğunluğuna göre sonra gelir. Bu dalda iOS'a yayın yok, yalnız
derlenebilir hâle getirme hazırlığı var.

## Bugünkü durum

- `apps/mobile`: Expo **SDK 51**, React Native 0.74.5, React 18.2.0,
  NativeWind 4.1.23. 21 ekran/bileşen, yaklaşık 6.000 satır.
- **Hiç test yok.** Arayüz yenilemesinin (REDESIGN.md) Adım 9'u açık; mobil hâlâ
  eski palette.
- APK EAS bulutunda derleniyor. Yerel Gradle derlemesi bu makinede
  `expo-updates` → Room → sqlite-jdbc geçici dizin hatasıyla duruyor
  (`b2b-apk-ota.md` tuzak 7). Yerel derleme denenmez.
- Uzaktan güncelleme (OTA) ve sunucu adresinin cihazdan ayarlanması hazır.

## Sıra

### 1. SDK yükseltmesi — dikkat: React sürümü bütün depoyu bağlıyor

Kök `package.json` içindeki `pnpm.overrides` React'i **bütün depoda** 18.2.0'a
sabitliyor ve `.npmrc` `node-linker=hoisted`. Web `next@14.2.15` + React 18.

| Expo SDK | React Native | React | Web'e etkisi |
|---|---|---|---|
| 52 | 0.76 | 18.3.1 | Override'ları **dördü birlikte** 18.3.1 yapılır. Next 14 ile uyumlu |
| 53+ | 0.79+ | **19** | Web'in de Next 15 + React 19'a geçmesi gerekir. Bu ayrı ve büyük bir iş |

**Bu dalda hedef SDK 52.** React 19 geçişi web ile birlikte, ayrı bir görev
olarak planlanır ("Şema istekleri"nin yanına "Ortak istekler" olarak yazın).
Override'ı tek uygulamada değiştirmek yasak: `react-dom@18.3.1` ile
`react@18.2.0` yan yana düşünce web'in her `next build`'i
`Cannot read properties of null (reading 'useRef')` ile kırıldı.

Yükseltmeden sonra:

- `npx expo install --fix` **kök override'ları atlıyor**. Ardından düz
  `pnpm install` çalıştırılır ve `react` / `react-dom` sürümü doğrulanır.
- NativeWind ile Reanimated sürüm çifti yeniden doğrulanır (`b2b-local-infra.md`).
  NativeWind 4.2.x, Reanimated 4 eklentisini istiyor.
- `npx expo export --platform android` geçmeli. `tsc` geçmesi yetmez; Metro
  çözümlemesini yalnız bu yakalar.
- Web'in `pnpm build` ve `pnpm test`'i yeniden koşar (React değişti).

### 2. Test altyapısı ve testler

- `jest-expo` + `@testing-library/react-native`. `package.json`'a `test`
  betiği eklenir ve turbo hattına girer.
- Önce saf mantık: `store/cart.ts` (adet kuralları: koli içi, asgari adet),
  `lib/offline.ts` (kuyruk, duraklamış mutation), `lib/server-url.ts`
  (adres doğrulama), `store/auth.ts` (çıkışta önbellek temizliği:
  `persister.removeClient()`), `lib/maps.ts`.
- Sonra ekran testleri: giriş (2FA dahil), katalog arama + barkod sonucu,
  sepet → sipariş, tahsilat (tekrar anahtarı ekran başına bir kez üretilir),
  teslim onayı (alanın adı zorunlu, fotoğraf isteğe bağlı), izne göre gezinme
  (`RootNavigator` yetkiden kurulur, rolden değil).
- API çağrıları sahte sunucuyla test edilir. Gerçek sunucu gerekmez.

### 3. Arayüz yenilemesi (REDESIGN.md Adım 9)

- Web'in token'ları (`docs/design/REDESIGN.md`, `globals.css`) mobil
  temasına taşınır. Ham renk sınıfı kalmaz.
- D akışı web'de **sadeleştirme** yapıyor (modül aç/kapa, 5-6 başlıklı menü).
  Mobil gezinme aynı modül anahtarlarını okumalı: kapalı modülün ekranı
  mobilde de görünmez. Anahtarların listesi D'den gelir; gelene kadar ekranlar
  izne göre kalır.
- Her ekranın emülatör görüntüsü `docs/design/screens/adim-9/` altına konur.
  Android Studio bu makinede kurulu; emülatör sunucuya `http://10.0.2.2:3000`
  ile ulaşır.

### 4. Android APK yayını

- EAS profili `preview` (APK). İmza anahtarı EAS'ta. Anahtar parolası hiçbir
  belgeye yazılmaz.
- OTA kanalı sürüm etiketine bağlı kalır (`b2b-central-update.md`).
- Android hedef API'si EAS profilinde Play Store'un güncel şartına
  yükseltilir (`expo-build-properties`), APK dağıtımı bunu şart koşmasa bile.
  Sonradan Play'e çıkmak yeniden derleme gerektirmesin.

### 5. iOS hazırlığı (yayın yok)

- `eas.json`'a iOS profili eklenir. Mac gerekmez, EAS bulutta derler.
- Apple Developer hesabı (yılda 99 $) gerekiyor. Hesap Said'de olmadan
  derleme denenmez. Belgeye "hesap açılınca yapılacak üç adım" yazılır.
- iOS'a özel kod yolları işaretlenir: push izni, kamera izni metinleri,
  konum izni metinleri (`app.json` `ios.infoPlist`).

## Çıktı

- Adım başına commit (`feat: mobil SDK 52'ye geçti` gibi).
- `apps/mobile` en az: saf mantığın tamamı + 6 ekran akışı testli.
- Kurulabilir APK bağlantısı ve emülatör görüntüleri.
- [`IS-BOLUMU.md`](../IS-BOLUMU.md) "Durum" satırı güncellenir.

## Yapılmayacaklar

- Şemaya dokunmak (gerekirse "Şema istekleri").
- React override'ını yalnız mobil için değiştirmek.
- Yerel Gradle derlemesiyle uğraşmak.
- iOS'a yayın.
