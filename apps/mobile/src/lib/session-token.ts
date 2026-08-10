// Oturum jetonuna dolaylı erişim.
//
// `@/store/auth` doğrudan içe aktarılamıyor: store bu dosyaların bazılarını
// (push kaydı, çevrimdışı önbellek temizliği) kendisi çağırıyor ve karşılıklı
// içe aktarım Metro'da modül başlatma sırasını bozuyor — biri diğerinin daha
// tanımlanmamış dışa aktarımını okuyor ve hata, ilgisiz bir yerde `undefined is
// not a function` olarak çıkıyor.
//
// Store açılışta kendini buraya bağlıyor; jetona ihtiyacı olan modüller
// buradan okuyor.

let getter: (() => string | null) | null = null;

export function setAuthTokenGetter(fn: () => string | null): void {
  getter = fn;
}

export function currentAuthToken(): string | null {
  return getter?.() ?? null;
}
