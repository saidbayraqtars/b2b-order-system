import { Linking } from "react-native";

// Yol tarifi ve rota bağlantıları.
//
// Harita **gömülmüyor**, bağlantı veriliyor: telefonda hangi harita uygulaması
// kuruluysa o açılıyor. Kuryenin ve plasiyerin alışkın olduğu uygulamayı
// değiştirmeye çalışmak işi yavaşlatır, üstelik gömülü harita ekranı
// navigasyonu, sesli yönlendirmeyi ve trafiği tek başına veremez.
//
// Web tarafındaki `directionsUrl` ile aynı adresleri üretir (delivery-board ve
// visit-plan); ikisinin ayrışması, aynı durağın iki cihazda iki farklı noktaya
// götürmesi demek olurdu.

/** Koordinat varsa o, yoksa yazılı adres. Boş dizeyi çağıran eler. */
export function destinationOf(place: {
  latitude: number | null;
  longitude: number | null;
  addressLine?: string | null;
  district?: string | null;
  city?: string | null;
}): string {
  if (place.latitude != null && place.longitude != null) {
    return `${place.latitude},${place.longitude}`;
  }
  return [place.addressLine, place.district, place.city]
    .filter(Boolean)
    .join(" ");
}

export function directionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination,
  )}&travelmode=driving`;
}

/**
 * Tüm durakları **listedeki sırayla** açan rota.
 *
 * Son durak hedef, aradakiler ara nokta. Sırayı harita değil plasiyer
 * belirliyor: rota optimizasyonu trafiği bilir ama randevuyu, öğle molasını ve
 * "şu bayi öğleden sonra açık" bilgisini bilmez.
 */
export function routeUrl(stops: string[]): string | null {
  const clean = stops.filter((s) => s.length > 0);
  if (clean.length === 0) return null;
  const destination = clean[clean.length - 1]!;
  const waypoints = clean.slice(0, -1);
  const wp = waypoints.length
    ? `&waypoints=${encodeURIComponent(waypoints.join("|"))}`
    : "";
  return `${directionsUrl(destination)}${wp}`;
}

/** Open a URL in whatever app claims it; silently ignores an unopenable link. */
export function openExternal(url: string | null): void {
  if (!url) return;
  void Linking.openURL(url).catch(() => {
    // No handler for the scheme (no maps app, no dialler). Nothing useful to
    // say — the button simply does nothing rather than crashing the screen.
  });
}

export function callNumber(phone: string): void {
  openExternal(`tel:${phone.replace(/\s/g, "")}`);
}
