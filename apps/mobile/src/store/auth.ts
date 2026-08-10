import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { SessionUser } from "@repo/types";
import { apiFetch, ApiError, setSessionExpiredHandler } from "@/lib/api";
import { loadServerUrl } from "@/lib/server-url";
import { registerForPush, unregisterPush } from "@/lib/push";
import { clearOfflineCache } from "@/lib/offline";
import { setAuthTokenGetter } from "@/lib/session-token";

// Bearer-token session for the native app. The token is a 30-day JWT issued by
// POST /api/mobile/login and kept in the device keychain (expo-secure-store),
// never in AsyncStorage — it grants full API access on its own.

const TOKEN_KEY = "b2b.auth.token";

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  /** false until the stored token has been read + validated on cold start. */
  hydrated: boolean;
  /** Set when the server ended the session; shown on the login screen. */
  sessionEndedReason: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  sessionEndedReason: null,

  /** Cold start: read the saved token and confirm it's still valid server-side. */
  hydrate: async () => {
    try {
      // Before anything is fetched. The address is a device setting now, and
      // asking the built-in default whether our token is still good would
      // answer for the wrong server.
      await loadServerUrl();

      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const { user } = await apiFetch<{ user: SessionUser }>("/api/mobile/me", {
        token,
      });
      set({ token, user });
      // Her açılışta yeniden bağlanıyor, yalnızca girişte değil: Expo jetonu
      // uygulama güncellemesinde ya da cihaz geri yüklemesinde değişebiliyor ve
      // eski jetona gönderilen bildirim sessizce kayboluyor.
      void registerForPush();
    } catch (err) {
      // Expired/revoked token → drop it. A network error leaves the token in
      // place so the next launch can retry.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } finally {
      set({ hydrated: true });
    }
  },

  login: async (email, password) => {
    const { token, user } = await apiFetch<{ token: string; user: SessionUser }>(
      "/api/mobile/login",
      { method: "POST", body: { email, password } },
    );
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, user, sessionEndedReason: null });
    void registerForPush();
  },

  logout: async () => {
    // Cihaz hesaptan **önce** çözülüyor: çözme isteği oturum jetonuyla
    // yetkileniyor ve jeton silindikten sonra 401 alırdı. Ortak kullanılan bir
    // telefonda bu, önceki kullanıcının bildirimlerinin yeni kullanıcıya
    // düşmesi demek.
    await unregisterPush(useAuthStore.getState().token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    // Diskteki sorgu önbelleğinde müşteri listesi, cari bakiye ve sipariş
    // tutarları duruyor. Oturum kapanınca cihazda kalmamalı.
    await clearOfflineCache();
    set({ token: null, user: null, sessionEndedReason: null });
  },
}));

setAuthTokenGetter(() => useAuthStore.getState().token);

/**
 * A token can die mid-session — the account is switched off, demoted or has its
 * password reset. The device cannot tell (the JWT is still signed and
 * unexpired), so the first 401 that says so is what ends the session here.
 */
setSessionExpiredHandler((reason) => {
  const { token } = useAuthStore.getState();
  if (!token) return;
  void SecureStore.deleteItemAsync(TOKEN_KEY);
  useAuthStore.setState({
    token: null,
    user: null,
    sessionEndedReason: SESSION_END_MESSAGES[reason] ?? SESSION_END_MESSAGES.DEFAULT,
  });
});

const SESSION_END_MESSAGES: Record<string, string> = {
  SESSION_REVOKED: "Yetkileriniz değişti. Lütfen yeniden giriş yapın.",
  ACCOUNT_DISABLED: "Hesabınız pasife alınmış. Yöneticinizle görüşün.",
  ACCOUNT_MISSING: "Hesabınız bulunamadı. Yöneticinizle görüşün.",
  DEFAULT: "Oturumunuz sonlandı. Lütfen yeniden giriş yapın.",
};

/** Read the token outside React (query functions, mutations). */
export function authToken(): string | null {
  return useAuthStore.getState().token;
}

/** True when the signed-in principal works the field (rep-only screens). */
export function isFieldRole(user: SessionUser | null): boolean {
  return user?.role === "SALES_REP" || user?.role === "SUPER_ADMIN";
}
