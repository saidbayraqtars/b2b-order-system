// Turkish-aware slugify. The catalog is Turkish, so "Şişe & Kapak" must become
// "sise-kapak" — a plain NFD strip would turn ı/ş/ğ into garbage or drop them.

const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

/** Combining diacritical marks left over after NFD (U+0300–U+036F). */
const COMBINING = /[̀-ͯ]/g;

export function slugify(input: string): string {
  return input
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch)
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

/**
 * Make `base` unique against existing slugs by appending -2, -3, …
 * `taken` answers "does this slug already exist (excluding the row being edited)".
 */
export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || "kayit";
  if (!(await taken(root))) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  // Practically unreachable; keeps the caller from looping forever.
  return `${root}-${Date.now()}`;
}
