import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { apiFetch } from "@/lib/api";
import { currentAuthToken } from "@/lib/session-token";

// Çevrimdışı çalışma.
//
// Neyin çevrimdışı yapılabileceği sorusunun cevabı her iş için aynı değil, ve
// bu dosyanın asıl işi o ayrımı **açıkça** yapmak:
//
//  • **Okuma** — son görülen veri diske yazılıyor, şebeke yokken ekranlar boş
//    değil eski veriyle açılıyor. Depoda kaç adet kaldığı yarım saat önceki
//    sayı olabilir; bunu gizlemek yerine üstte "çevrimdışı" şeridi yazıyor.
//
//  • **Sahada yazma (tahsilat, ziyaret, teslim onayı)** — kuyruğa alınıyor ve
//    şebeke gelince kendiliğinden gönderiliyor. Üçü de *olmuş bir şeyin kaydı*:
//    para alındı, kapıya gidildi, mal teslim edildi. Kaydın on dakika geç
//    düşmesi işi bozmuyor, hiç düşmemesi bozuyor.
//
//  • **Sipariş** — kuyruğa **alınmıyor**. Fiyat, kampanya, stok ve limit
//    kontrolü sunucuda çözülüyor; çevrimdışı yazılan bir sipariş, gönderildiği
//    anda başka bir fiyata ya da tükenmiş stoğa denk gelebilir ve müşteriye
//    okunan tutar tutmaz. Sepet zaten sunucuda duruyor, kaybolmuyor.

/**
 * Şebeke durumunu react-query'ye bağlar.
 *
 * `isInternetReachable` bilerek dahil: Wi-Fi'ye bağlı ama internete çıkamayan
 * bir telefon (otel ağı, kotası bitmiş hat) NetInfo'ya "bağlı" görünüyor ve
 * react-query bu durumda istekleri denemeye devam ederdi. Değer belirsizken
 * (`null`) bağlı sayılıyor — ilk ölçüm gelene kadar uygulamayı çevrimdışı
 * göstermek, açılışta yanlış bir uyarı demek.
 */
export function connectOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    }),
  );
}

/** Şu an çevrimdışı mıyız — şerit ve rozetler için. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(!onlineManager.isOnline());
  useEffect(() => {
    setOffline(!onlineManager.isOnline());
    return onlineManager.subscribe((online) => setOffline(!online));
  }, []);
  return offline;
}

/**
 * Önbelleğin diske yazıldığı yer.
 *
 * `throttleTime`: her yazma yeni bir JSON serileştirmesi demek; katalog birkaç
 * yüz kilobayt olabiliyor ve her tuşta diske yazmak listeyi kekeletiyor.
 */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "b2b.query-cache",
  throttleTime: 2_000,
});

/**
 * Diskteki önbelleği siler.
 *
 * Çıkışta çağrılıyor: önbellekte müşteri listesi, cari bakiye ve sipariş
 * tutarları duruyor. Cihazı devralan bir sonraki kullanıcının bunları
 * görmemesi gerekiyor — hesap değişince veri de değişmeli.
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    await persister.removeClient();
  } catch {
    // Silinemezse bir sonraki girişte üzerine yazılıyor.
  }
}

/**
 * Kuyruğa alınabilen yazmalar.
 *
 * Anahtar olmak zorunda: uygulama kapanıp açıldığında react-query'nin elinde
 * yalnızca kuyruktaki değişkenler kalıyor, işlevin kendisi kalmıyor. Aşağıdaki
 * kayıt, o değişkenleri yeniden hangi uca göndereceğini söylüyor.
 */
export const OFFLINE_MUTATIONS = {
  payment: ["payment", "record"] as const,
  checkIn: ["checkin", "create"] as const,
  checkOut: ["checkin", "close"] as const,
  delivery: ["delivery", "confirm"] as const,
};

export function registerOfflineMutations(client: QueryClient): void {
  client.setMutationDefaults(OFFLINE_MUTATIONS.payment, {
    mutationFn: (vars: unknown) =>
      apiFetch("/api/payments", { method: "POST", body: vars, token: currentAuthToken() }),
  });

  client.setMutationDefaults(OFFLINE_MUTATIONS.checkIn, {
    mutationFn: (vars: unknown) =>
      apiFetch("/api/checkins", { method: "POST", body: vars, token: currentAuthToken() }),
  });

  client.setMutationDefaults(OFFLINE_MUTATIONS.checkOut, {
    mutationFn: (checkInId: unknown) =>
      apiFetch(`/api/checkins/${String(checkInId)}/checkout`, {
        method: "POST",
        token: currentAuthToken(),
      }),
  });

  client.setMutationDefaults(OFFLINE_MUTATIONS.delivery, {
    mutationFn: (vars: unknown) => {
      const { shipmentId, ...body } = vars as { shipmentId: string };
      return apiFetch(`/api/deliveries/${shipmentId}`, {
        method: "POST",
        body,
        token: currentAuthToken(),
      });
    },
  });
}

/** Kuyrukta bekleyen yazma sayısı — kullanıcıya "3 kayıt bekliyor" demek için. */
export function usePendingWrites(client: QueryClient): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const cache = client.getMutationCache();
    const read = () =>
      setCount(
        cache.getAll().filter((m) => m.state.status === "pending" || m.state.isPaused)
          .length,
      );
    read();
    return cache.subscribe(read);
  }, [client]);
  return count;
}
