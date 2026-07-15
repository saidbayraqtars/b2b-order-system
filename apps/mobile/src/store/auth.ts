import { create } from "zustand";
import type { SessionUser } from "@repo/types";

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  clear: () => void;
};

// MVP in-memory store. Persist with expo-secure-store in Step 5.
export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setSession: (token, user) => set({ token, user }),
  clear: () => set({ token: null, user: null }),
}));
