"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Çıkış yap"
      aria-label="Çıkış yap"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
