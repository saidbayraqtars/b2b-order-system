import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { SessionUser } from "@repo/types";
import { apiFetch, ApiError } from "@/lib/api";

// Bearer-token session for the native app. The token is a 30-day JWT issued by
// POST /api/mobile/login and kept in the device keychain (expo-secure-store),
// never in AsyncStorage — it grants full API access on its own.

const TOKEN_KEY = "b2b.auth.token";

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  /** false until the stored token has been read + validated on cold start. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  /** Cold start: read the saved token and confirm it's still valid server-side. */
  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const { user } = await apiFetch<{ user: SessionUser }>("/api/mobile/me", {
        token,
      });
      set({ token, user });
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
    set({ token, user });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ token: null, user: null });
  },
}));

/** Read the token outside React (query functions, mutations). */
export function authToken(): string | null {
  return useAuthStore.getState().token;
}

/** True when the signed-in principal works the field (rep-only screens). */
export function isFieldRole(user: SessionUser | null): boolean {
  return user?.role === "SALES_REP" || user?.role === "SUPER_ADMIN";
}
