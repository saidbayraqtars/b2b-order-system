import type { Channels } from "./tokens";

/**
 * `#ff2d78` → `"255 45 120"`.
 *
 * Packs are written in hex because that is what a design tool hands over and
 * what a human can check against a screenshot. The channel form only exists
 * because `rgb(var(--x) / <alpha-value>)` needs it — so the conversion happens
 * here, once, instead of in every pack file.
 */
export function channels(hex: string): Channels {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Geçersiz renk: ${hex}`);
  }

  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * `"255 45 120"` → `#ff2d78`.
 *
 * The way back out, for the places that cannot use a Tailwind class at all:
 * React Navigation's header and tab bar are native views configured with plain
 * colour strings. Hex rather than `rgb(r g b)` because React Native's colour
 * parser does not accept the space-separated form.
 */
export function toHex(value: Channels): string {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Geçersiz kanal değeri: ${value}`);
  }
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
