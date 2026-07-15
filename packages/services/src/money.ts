import { Prisma } from "@prisma/client";

/** Decimal constructor (decimal.js) bundled with Prisma — use for all money math. */
export const Dec = Prisma.Decimal;
export type Money = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

/** Round to 2 decimal places (half-up) — TRY money precision. */
export function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
