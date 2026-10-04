import { Prisma, prisma } from "@repo/database";
import type { PriceChangeStatus } from "@repo/types";
import { BusinessError } from "./errors";

// Zamanlı fiyat değişimi — "1 Eylül'den itibaren zam".
//
// Kuyruk deseni: bekleyen satır zamanı gelince `Price`a **kopyalanıyor** ve
// fiyat okuma yolu hiç değişmiyor. Alternatif — `Price.validFrom` — "şu andaki
// fiyat" sorusunu her okumada bir alt sorguya çevirirdi; o soruyu soran dört
// yer var ve dördü de sistemin en sonuçlu yolunda. Bir zam listesi o yolu
// karmaşıklaştırmaya değmez.
//
// Bedeli: değişim tam gece yarısında değil, işin ilk turunda yürürlüğe giriyor.
// İşin periyodu `/admin/jobs`tan ayarlanabiliyor.

export interface ScheduledPriceRow {
  id: string;
  sku: string;
  productName: string;
  groupId: string | null;
  groupName: string | null;
  minQuantity: number;
  price: string;
  currency: string;
  /** Kaydedildiği anda yürürlükte olan fiyat — "ne kadar zam" bundan çıkıyor. */
  currentPrice: string | null;
  effectiveAt: string;
  status: PriceChangeStatus;
  previousPrice: string | null;
  appliedAt: string | null;
  failureReason: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
}

const ROW_SELECT = {
  id: true,
  minQuantity: true,
  price: true,
  currency: true,
  effectiveAt: true,
  status: true,
  previousPrice: true,
  previousCurrency: true,
  appliedAt: true,
  failureReason: true,
  note: true,
  createdAt: true,
  customerGroupId: true,
  customerGroup: { select: { name: true } },
  createdBy: { select: { name: true } },
  variant: {
    select: { id: true, sku: true, product: { select: { name: true } } },
  },
} satisfies Prisma.ScheduledPriceChangeSelect;

type Row = Prisma.ScheduledPriceChangeGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * Bekleyen satırın yanına **şu anki** fiyatı koymak için tek sorgu.
 *
 * Satır başına bir `findFirst` yerine hedeflerin tamamı tek turda çekiliyor:
 * beş yüz satırlık bir zam listesinde fark, ekranın açılıp açılmaması.
 */
async function currentPrices(
  rows: Row[],
): Promise<Map<string, Prisma.Decimal>> {
  if (rows.length === 0) return new Map();
  const prices = await prisma.price.findMany({
    where: {
      variantId: { in: [...new Set(rows.map((r) => r.variant.id))] },
      // Zamanlı değişim taban birim fiyatına uygulanır.
      unitId: null,
    },
    select: {
      variantId: true,
      customerGroupId: true,
      minQuantity: true,
      price: true,
    },
  });
  const key = (v: string, g: string | null, q: number) => `${v}|${g ?? ""}|${q}`;
  return new Map(
    prices.map((p) => [
      key(p.variantId, p.customerGroupId, p.minQuantity),
      p.price,
    ]),
  );
}

function toRow(r: Row, current: Map<string, Prisma.Decimal>): ScheduledPriceRow {
  const now = current.get(
    `${r.variant.id}|${r.customerGroupId ?? ""}|${r.minQuantity}`,
  );
  return {
    id: r.id,
    sku: r.variant.sku,
    productName: r.variant.product.name,
    groupId: r.customerGroupId,
    groupName: r.customerGroup?.name ?? null,
    minQuantity: r.minQuantity,
    price: r.price.toFixed(2),
    currency: r.currency,
    currentPrice: now?.toFixed(2) ?? null,
    effectiveAt: r.effectiveAt.toISOString(),
    status: r.status,
    previousPrice: r.previousPrice?.toFixed(2) ?? null,
    appliedAt: r.appliedAt?.toISOString() ?? null,
    failureReason: r.failureReason,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdBy?.name ?? null,
  };
}

export interface ListScheduleInput {
  /** Boş = bekleyenler; geçmişi görmek için açıkça isteniyor. */
  status?: PriceChangeStatus;
  limit?: number;
}

export async function listScheduledPriceChanges(
  input: ListScheduleInput = {},
): Promise<ScheduledPriceRow[]> {
  const rows = await prisma.scheduledPriceChange.findMany({
    where: { status: input.status ?? "PENDING" },
    select: ROW_SELECT,
    // Bekleyenler yaklaşana göre, geçmiş en yeniye göre: iki liste iki ayrı
    // soruyu cevaplıyor ("sırada ne var", "ne oldu").
    orderBy:
      (input.status ?? "PENDING") === "PENDING"
        ? [{ effectiveAt: "asc" }, { createdAt: "asc" }]
        : [{ appliedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(input.limit ?? 200, 1000),
  });
  const current = await currentPrices(rows);
  return rows.map((r) => toRow(r, current));
}

export interface SchedulePriceInput {
  variantId: string;
  customerGroupId: string | null;
  minQuantity: number;
  price: number;
  currency?: string;
  effectiveAt: Date;
  note?: string | null;
}

export async function schedulePriceChange(
  input: SchedulePriceInput,
  actorId: string,
): Promise<{ id: string }> {
  if (input.effectiveAt.getTime() <= Date.now()) {
    throw new BusinessError(
      "INVALID_SCHEDULE",
      "Yürürlük tarihi gelecekte olmalı — geçmişe fiyat yazılmaz.",
    );
  }
  const row = await prisma.scheduledPriceChange.create({
    data: {
      variantId: input.variantId,
      customerGroupId: input.customerGroupId,
      minQuantity: input.minQuantity,
      price: input.price,
      currency: input.currency ?? "TRY",
      effectiveAt: input.effectiveAt,
      note: input.note ?? null,
      createdById: actorId,
    },
    select: { id: true },
  });
  return row;
}

/**
 * İptal yalnızca **bekleyeni** kapatıyor.
 *
 * Uygulanmış bir satırı "iptal" etmek fiyatı geri almak demek ve o ayrı bir
 * karar: eski fiyat satırda duruyor, geri almak isteyen yeni bir zamanlı
 * değişiklik giriyor. Sessizce geri sarmak, aradaki siparişlerin hangi fiyattan
 * geçtiğini belirsiz bırakırdı.
 */
export async function cancelScheduledPriceChange(id: string): Promise<void> {
  const result = await prisma.scheduledPriceChange.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (result.count === 0) {
    throw new BusinessError(
      "INVALID_STATE",
      "Yalnızca bekleyen bir değişiklik iptal edilebilir.",
    );
  }
}

export interface ApplyDueResult {
  applied: number;
  failed: number;
}

/**
 * Zamanı gelmiş değişiklikleri uygular — işin gövdesi.
 *
 * **Yeniden çalıştırılabilir**: `PENDING` olmayan satıra dokunmuyor, yani iki
 * kez çalışması bir kez çalışmasıyla aynı sonucu veriyor (kayıt defterinin
 * kuralı).
 *
 * Her satır **kendi işleminde**: beş yüz satırlık bir zam listesinde tek bir
 * silinmiş varyant, listenin tamamını geri almamalı. Başarısız satır
 * `FAILED` olarak sebebiyle duruyor ve ekranda görünüyor — sessizce
 * bekleyende kalsaydı her turda yeniden denenir ve kimse fark etmezdi.
 */
export async function applyDuePriceChanges(
  now: Date = new Date(),
): Promise<ApplyDueResult> {
  const due = await prisma.scheduledPriceChange.findMany({
    where: { status: "PENDING", effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "asc" },
    select: {
      id: true,
      variantId: true,
      customerGroupId: true,
      minQuantity: true,
      price: true,
      currency: true,
    },
  });

  let applied = 0;
  let failed = 0;

  for (const change of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.price.findFirst({
          where: {
            variantId: change.variantId,
            customerGroupId: change.customerGroupId,
            unitId: null,
            minQuantity: change.minQuantity,
          },
          select: { id: true, price: true, currency: true },
        });

        if (existing) {
          await tx.price.update({
            where: { id: existing.id },
            data: { price: change.price, currency: change.currency },
          });
        } else {
          // Kademe yoksa açılıyor: "1 Eylül'den itibaren 100 adet üstü şu
          // fiyat" demek, o kademeyi o gün açmak demek.
          await tx.price.create({
            data: {
              variantId: change.variantId,
              customerGroupId: change.customerGroupId,
              minQuantity: change.minQuantity,
              price: change.price,
              currency: change.currency,
            },
          });
        }

        await tx.scheduledPriceChange.update({
          where: { id: change.id },
          data: {
            status: "APPLIED",
            appliedAt: new Date(),
            previousPrice: existing?.price ?? null,
            previousCurrency: existing?.currency ?? null,
          },
        });
      });
      applied += 1;
    } catch (e) {
      failed += 1;
      await prisma.scheduledPriceChange.update({
        where: { id: change.id },
        data: {
          status: "FAILED",
          failureReason: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  return { applied, failed };
}
