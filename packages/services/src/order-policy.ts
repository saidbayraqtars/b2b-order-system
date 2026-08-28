import { prisma, type Prisma } from "@repo/database";
import type { SaveOrderPolicyInput } from "@repo/types";
import { BusinessError } from "./errors";
import { Dec, type Money } from "./money";

// Sipariş kabul kuralları: asgari tutar/koli ve sevkiyat kesim saati.
//
// İkisi de toptancılıkta standart ve ikisinin de burada olmasının sebebi aynı:
// **sipariş alınırken** cevaplanan sorular. Asgari, siparişin geçip
// geçmeyeceğini; kesim saati, geçtiğinde ne zaman çıkacağını söylüyor.
//
// İki tasarım kararı ekranı ve servisi birlikte belirliyor:
//
//  1. **Asgari alıcıyı bağlar, satıcıyı bağlamaz.** Plasiyer ve yönetici
//     pazarlık ediyor; eşiğin altında bir siparişi onlar geçirebilir. Vade
//     kuralının aynası — orada da alıcı kendi vadesini uyduramıyordu.
//  2. **Kesim saati engel değil, söz.** 16:01'de gelen siparişi reddetmek iş
//     kaybı. Ekran yalnızca hangi gün çıkacağını yazıyor.

/** Kurulumun takvimi — rapor tarafıyla aynı değişken. */
const TZ = process.env.REPORT_TIMEZONE ?? "Europe/Istanbul";

/** Ayar tablosu tek satır; kimliği sabit. */
const SINGLETON = "singleton";

export interface OrderPolicy {
  /** Net mal bedeli eşiği, ₺. "0.00" = asgari yok. */
  minOrderAmount: string;
  /** Asgari koli adedi. 0 = koli şartı yok. */
  minOrderCases: number;
  /** Sevkiyat kesim saati (0-23) ya da null (söz verilmiyor). */
  cutoffHour: number | null;
  shipsOnSaturday: boolean;
  updatedAt: string | null;
}

/**
 * Kurulumun kuralları. Satır hiç yazılmamışsa **varsayılan** dönüyor, hata
 * değil: kural koymamış bir kurulum kural koymamış demektir, eksik yapılandırma
 * değil.
 */
export async function getOrderPolicy(): Promise<OrderPolicy> {
  const row = await prisma.orderPolicy.findUnique({ where: { id: SINGLETON } });
  return {
    minOrderAmount: (row?.minOrderAmount ?? 0).toString(),
    minOrderCases: row?.minOrderCases ?? 0,
    cutoffHour: row?.cutoffHour ?? null,
    shipsOnSaturday: row?.shipsOnSaturday ?? false,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function saveOrderPolicy(
  input: SaveOrderPolicyInput,
  actorId: string,
): Promise<OrderPolicy> {
  if (input.cutoffHour !== null && (input.cutoffHour < 0 || input.cutoffHour > 23)) {
    throw new BusinessError("INVALID_CUTOFF", "Kesim saati 0-23 arasında olmalı");
  }
  if (input.minOrderAmount < 0 || input.minOrderCases < 0) {
    throw new BusinessError("INVALID_MINIMUM", "Asgari değerler negatif olamaz");
  }

  const data = {
    minOrderAmount: input.minOrderAmount,
    minOrderCases: input.minOrderCases,
    cutoffHour: input.cutoffHour,
    shipsOnSaturday: input.shipsOnSaturday,
    updatedById: actorId,
  };
  await prisma.orderPolicy.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, ...data },
    update: data,
  });
  return getOrderPolicy();
}

// ─────────────────────────────────────────────
// ASGARİ
// ─────────────────────────────────────────────

export interface MinimumCheck {
  /** Bu sipariş için geçerli tutar eşiği. "0.00" = tutar şartı yok. */
  requiredAmount: string;
  /** Geçerli koli eşiği. 0 = koli şartı yok. */
  requiredCases: number;
  /** Sepetin net mal bedeli. */
  amount: string;
  /** Sepetteki koli adedi — koli bilgisi olmayan satırlar sayılmıyor. */
  cases: number;
  /** Eşiğe kalan tutar; 0 ise tutar şartı sağlanmış. */
  amountShortfall: string;
  /** Eşiğe kalan koli. */
  casesShortfall: number;
  /** İkisi de sağlandı mı. */
  ok: boolean;
}

/**
 * Bu müşteriye uygulanacak eşik.
 *
 * Firma kolonu `null` ise genel kural geçerli; **sıfır ise muaf**. İkisini
 * ayırmak gerekiyordu: sözleşmeyle muaf tutulmuş bir bayi, genel eşik
 * yükseldiğinde kendiliğinden etkilenmemeli.
 */
export function effectiveMinimum(
  policy: Pick<OrderPolicy, "minOrderAmount">,
  companyMinimum: Prisma.Decimal | null,
): Money {
  return companyMinimum === null
    ? new Dec(policy.minOrderAmount)
    : new Dec(companyMinimum);
}

export interface MinimumInput {
  /** Net mal bedeli — KDV ve navlun hariç (bkz. `OrderPolicy.minOrderAmount`). */
  netGoods: Money;
  /** Satır başına koli adedi; `null` olanlar koliyle satılmıyor demek. */
  caseCounts: ReadonlyArray<number | null>;
  companyMinimum: Prisma.Decimal | null;
}

export function checkMinimum(
  policy: OrderPolicy,
  input: MinimumInput,
): MinimumCheck {
  const requiredAmount = effectiveMinimum(policy, input.companyMinimum);
  const requiredCases = policy.minOrderCases;

  // Koli sayısı: koliyle satılmayan satır sayılmıyor, sıfır sayılmıyor.
  // Alternatif — her satırı en az bir koli saymak — üç adetlik bir numuneyi
  // koli eşiğinde bir koli gibi göstermek olurdu.
  const cases = input.caseCounts.reduce<number>((sum, c) => sum + (c ?? 0), 0);

  const amountShortfall = requiredAmount.sub(input.netGoods);
  const casesShortfall = requiredCases - cases;

  return {
    requiredAmount: requiredAmount.toFixed(2),
    requiredCases,
    amount: input.netGoods.toFixed(2),
    cases,
    amountShortfall: (amountShortfall.gt(0) ? amountShortfall : new Dec(0)).toFixed(2),
    casesShortfall: Math.max(0, casesShortfall),
    ok: !amountShortfall.gt(0) && casesShortfall <= 0,
  };
}

/**
 * Alıcı tarafı için kapı. Satıcı (`isSeller`) çağırmıyor — pazarlık onun işi.
 *
 * Mesaj eksiği **rakamla** söylüyor: "asgari tutarın altında" diyen bir hata,
 * sepete ne ekleyeceğini bilmeyen bir müşteri bırakıyor.
 */
export function assertMinimum(check: MinimumCheck): void {
  if (check.ok) return;

  const parts: string[] = [];
  if (new Dec(check.amountShortfall).gt(0)) {
    parts.push(
      `${check.requiredAmount} ₺ asgari tutar için ${check.amountShortfall} ₺ daha gerekiyor`,
    );
  }
  if (check.casesShortfall > 0) {
    parts.push(
      `${check.requiredCases} koli asgari için ${check.casesShortfall} koli daha gerekiyor`,
    );
  }
  throw new BusinessError("BELOW_MINIMUM_ORDER", parts.join(" · "));
}

// ─────────────────────────────────────────────
// KESİM SAATİ
// ─────────────────────────────────────────────

export interface DespatchPromise {
  /** Bugün çıkar mı. */
  sameDay: boolean;
  /** Hangi gün çıkacağı — `YYYY-MM-DD`, kurulumun takviminde. */
  despatchDate: string;
  /** Kesim saati (0-23) ya da null; null ise söz verilmiyor. */
  cutoffHour: number | null;
}

/** Bir tarihin kurulum takvimindeki parçaları. */
function localParts(at: Date): { y: number; m: number; d: number; hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const WEEKDAY: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    // 24 saatlik biçimde gece yarısı "24" gelebiliyor.
    hour: Number(parts.hour) % 24,
    weekday: WEEKDAY[parts.weekday ?? "Mon"] ?? 1,
  };
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Bu sipariş hangi gün çıkar.
 *
 * Kural üç adım: kesim saati geçtiyse ertesi güne at, sonra kapalı günleri
 * atla. Pazar her zaman kapalı, cumartesi ayara bağlı.
 *
 * `cutoffHour` null ise söz verilmiyor: dönen tarih bugünün tarihi ve
 * `cutoffHour: null` — ekran bu hâlde hiçbir şey yazmıyor.
 */
export function despatchPromise(
  policy: Pick<OrderPolicy, "cutoffHour" | "shipsOnSaturday">,
  now: Date = new Date(),
): DespatchPromise {
  const here = localParts(now);
  const today = iso(here.y, here.m, here.d);
  if (policy.cutoffHour === null) {
    return { sameDay: true, despatchDate: today, cutoffHour: null };
  }

  // Gün ilerletme UTC gün sayısı üzerinden: yerel takvimde bir gün eklemek
  // yaz saati geçişinde 23 ya da 25 saat sürebiliyor ve tarih aritmetiği
  // saatlerle yapılırsa o gün kayıyor.
  let cursor = Date.UTC(here.y, here.m - 1, here.d);
  let day = here.weekday;
  let sameDay = here.hour < policy.cutoffHour;

  if (!sameDay) {
    cursor += 86_400_000;
    day = (day + 1) % 7;
  }
  // Kapalı günleri atla. En çok iki tur döner (cumartesi + pazar).
  while (day === 0 || (day === 6 && !policy.shipsOnSaturday)) {
    cursor += 86_400_000;
    day = (day + 1) % 7;
    sameDay = false;
  }

  const at = new Date(cursor);
  return {
    sameDay,
    despatchDate: iso(
      at.getUTCFullYear(),
      at.getUTCMonth() + 1,
      at.getUTCDate(),
    ),
    cutoffHour: policy.cutoffHour,
  };
}
