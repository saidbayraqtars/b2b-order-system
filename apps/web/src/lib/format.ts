const TRY = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

/** Format a number or numeric string as Turkish Lira. */
export function formatTRY(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return TRY.format(Number.isFinite(n) ? n : 0);
}
