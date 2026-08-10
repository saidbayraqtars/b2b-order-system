import { useCallback, useState } from "react";
import * as Updates from "expo-updates";

// Uzaktan güncelleme (OTA).
//
// Uygulama Play Store'dan dağıtılmıyor; APK elden kuruluyor. Bir düzeltme için
// herkesin telefonuna yeni APK göndermek gerçekçi değil, bu yüzden JS paketi
// açılışta sunucudan yenileniyor (`checkAutomatically: ON_LOAD`).
//
// Sınırı bilerek yazılıyor: **yalnızca JS ve varlıklar** böyle güncellenir.
// Yeni bir native kütüphane eklendiğinde `runtimeVersion` (sürüm numarası)
// değişir, eski APK o güncellemeyi görmez ve yeni APK kurulması gerekir. Bu
// bir kusur değil — eski bir kabuğa uymayan JS'in indirilmesi çöken bir
// uygulama demek olurdu.

export type OtaState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading" }
  | { kind: "ready" }
  | { kind: "current" }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

/**
 * Kabuğun sürümü. `runtimeVersion` politikası `appVersion` olduğu için bu
 * doğrudan app.json'daki sürüm — ve aynı zamanda "bu APK hangi güncellemeleri
 * kabul eder" sorusunun cevabı.
 */
export function appVersion(): string {
  return Updates.runtimeVersion ?? "bilinmiyor";
}

/** Hangi paketin çalıştığı — destek konuşmasının ilk sorusu. */
export function runningVersion(): string {
  // Geliştirme sunucusunda güncelleme kimliği yok; oradaki cevap "geliştirme".
  if (__DEV__) return "geliştirme";
  return Updates.updateId ? Updates.updateId.slice(0, 8) : "kurulumla gelen";
}

export function useOtaUpdate(): {
  state: OtaState;
  check: () => Promise<void>;
  restart: () => Promise<void>;
} {
  const [state, setState] = useState<OtaState>({ kind: "idle" });

  const check = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) {
      setState({
        kind: "unavailable",
        message: "Uzaktan güncelleme yalnızca kurulu uygulamada çalışır.",
      });
      return;
    }

    setState({ kind: "checking" });
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setState({ kind: "current" });
        return;
      }
      setState({ kind: "downloading" });
      await Updates.fetchUpdateAsync();
      // İndirildi ama uygulanmadı: yeniden başlatma kararı kullanıcının, çünkü
      // yarım kalmış bir tahsilat ekranının altından uygulamayı çekmek olmaz.
      setState({ kind: "ready" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Güncelleme alınamadı",
      });
    }
  }, []);

  const restart = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  return { state, check, restart };
}
