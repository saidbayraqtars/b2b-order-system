import { prisma } from "@repo/database";
import type {
  StockLotEntryInput,
  StockLotFilter,
  StockLotUpdateInput,
  StockLotWriteOffInput,
} from "@repo/types";
import { BusinessError } from "./errors";
import { postStockMovement } from "./stock-ledger";

// Parti (lot) & son kullanma tarihi.
//
// Gıda toptanında "kaç adet var" tek başına satılabilir bir cevap değil: aynı
// kalemin iki partisi arasında dört ay SKT farkı olabilir ve müşteriye giden
// hangi parti olduğunun kaydı, bir geri çağırmada aranacak tek şeydir.
//
// Bu modül defterin kendisi değil, defterin parti tarafındaki kapısı: bakiyeyi
// yine `postStockMovement` oynatır. Buradaki her fonksiyon oraya giden bir yol —
// başka türlü parti bakiyesi ile toplam stok birbirinden ayrı düşerdi.

const DEFAULT_EXPIRY_WARNING_DAYS = 30;

// ─────────────────────────────────────────────
// MAL KABUL
// ─────────────────────────────────────────────

export interface StockLotEntryResult {
  lotId: string;
  code: string;
  expiryDate: string | null;
  quantity: number;
  /** Hareketten sonraki toplam eldeki adet. */
  balance: number;
  /** Parti yeni mi açıldı, var olana mı eklendi. */
  created: boolean;
}

/**
 * Mal kabul: partiyi aç (ya da bul) ve girişi defterle birlikte yaz.
 *
 * Parti kodu verilmezse üretiliyor. Zorunlu tutmamanın sebebi sahadan gelen
 * gerçek: dökme malın kutusunda parti kodu yoktur, SKT'si vardır. Kodsuz mal
 * kabulü reddetmek, depocuyu her seferinde uydurma kod yazmaya iter — ve
 * uydurulan kod, üretilen koddan daha kötüdür çünkü iki farklı depocu aynı
 * kodu farklı partiye verir.
 */
export async function recordLotEntry(
  input: StockLotEntryInput,
  actorId: string,
): Promise<StockLotEntryResult> {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true, sku: true, shelfLifeDays: true },
    });
    if (!variant) {
      throw new BusinessError("VARIANT_NOT_FOUND", "Ürün varyantı bulunamadı", {
        variantId: input.variantId,
      });
    }

    const producedAt = parseDate(input.producedAt);
    const expiryDate =
      parseDate(input.expiryDate) ??
      // SKT boşsa raf ömründen türet: depocunun her kutuda iki tarih yazması
      // beklenmez, biri diğerini veriyorsa ikincisini istemek gereksiz iştir.
      (producedAt && variant.shelfLifeDays
        ? addDays(producedAt, variant.shelfLifeDays)
        : null);

    const code = input.code?.trim() || generateLotCode(producedAt ?? new Date());

    const existing = await tx.stockLot.findUnique({
      where: { variantId_code: { variantId: variant.id, code } },
      select: { id: true, expiryDate: true, isBlocked: true },
    });

    let lotId: string;
    let created = false;
    if (existing) {
      if (existing.isBlocked) {
        throw new BusinessError(
          "INVALID_STATE",
          `${code} partisi bloke — girişi önce blokeyi kaldırın`,
          { lotId: existing.id },
        );
      }
      // Aynı parti kodu ikinci kez geliyorsa aynı partidir; SKT'si varsa
      // dokunulmuyor — ikinci girişte yanlış yazılmış bir tarih, ilk girişin
      // doğru tarihini ezmemeli.
      lotId = existing.id;
      if (!existing.expiryDate && expiryDate) {
        await tx.stockLot.update({
          where: { id: lotId },
          data: { expiryDate },
        });
      }
    } else {
      const lot = await tx.stockLot.create({
        data: {
          variantId: variant.id,
          code,
          expiryDate,
          producedAt,
          note: input.note ?? null,
        },
        select: { id: true },
      });
      lotId = lot.id;
      created = true;
    }

    const movement = await postStockMovement(tx, {
      variantId: variant.id,
      warehouseId: input.warehouseId ?? null,
      lotId,
      direction: "IN",
      quantity: input.quantity,
      source: "MANUAL",
      description: input.note?.trim() || `Mal kabul · parti ${code}`,
      occurredAt: parseDate(input.occurredAt) ?? undefined,
      recordedById: actorId,
    });

    return {
      lotId,
      code,
      expiryDate: expiryDate ? expiryDate.toISOString() : null,
      quantity: movement.quantity,
      balance: movement.balance,
      created,
    };
  });
}

/**
 * Parti kodu üret: `P-YYMMDD-XXXX`.
 *
 * Tarih başta çünkü depocu listeyi koda göre sıraladığında partiler yine giriş
 * sırasına dizilsin; sondaki rastgele parça aynı gün gelen iki farklı partiyi
 * ayırıyor.
 */
function generateLotCode(base: Date): string {
  const yy = String(base.getFullYear()).slice(2);
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `P-${yy}${mm}${dd}-${rand}`;
}

// ─────────────────────────────────────────────
// KÜNYE DÜZELTME & BLOKE
// ─────────────────────────────────────────────

export async function updateLot(
  lotId: string,
  input: StockLotUpdateInput,
): Promise<{ id: string; isBlocked: boolean }> {
  const lot = await prisma.stockLot.findUnique({
    where: { id: lotId },
    select: { id: true },
  });
  if (!lot) {
    throw new BusinessError("LOT_NOT_FOUND", "Parti bulunamadı", { lotId });
  }

  const updated = await prisma.stockLot.update({
    where: { id: lotId },
    data: {
      ...(input.expiryDate !== undefined
        ? { expiryDate: parseDate(input.expiryDate) }
        : {}),
      ...(input.producedAt !== undefined
        ? { producedAt: parseDate(input.producedAt) }
        : {}),
      ...(input.isBlocked !== undefined ? { isBlocked: input.isBlocked } : {}),
      ...(input.note !== undefined ? { note: input.note ?? null } : {}),
    },
    select: { id: true, isBlocked: true },
  });

  return updated;
}

// ─────────────────────────────────────────────
// FİRE / İMHA
// ─────────────────────────────────────────────

export interface LotWriteOffResult {
  movementId: string;
  quantity: number;
  lotOnHand: number;
  balance: number;
}

/**
 * SKT'si geçmiş ya da bozulmuş malı defterden düş.
 *
 * Sayım değil fire olarak yazılıyor: sayım "defter yanılmış" demektir, fire
 * "mal gitti" demektir. Gıdada bu ikisinin farkı yıl sonunda ciddi bir sayıdır
 * ve tek satırda okunabilmelidir.
 */
export async function writeOffLot(
  lotId: string,
  input: StockLotWriteOffInput,
  actorId: string,
): Promise<LotWriteOffResult> {
  return prisma.$transaction(async (tx) => {
    const lot = await tx.stockLot.findUnique({
      where: { id: lotId },
      select: { id: true, variantId: true, code: true, onHand: true },
    });
    if (!lot) {
      throw new BusinessError("LOT_NOT_FOUND", "Parti bulunamadı", { lotId });
    }
    if (input.quantity > lot.onHand) {
      throw new BusinessError(
        "INVALID_STOCK",
        `${lot.code} partisinde ${lot.onHand} adet var, ${input.quantity} adet düşülemez`,
        { lotId, onHand: lot.onHand },
      );
    }

    const movement = await postStockMovement(tx, {
      variantId: lot.variantId,
      lotId: lot.id,
      direction: "OUT",
      quantity: input.quantity,
      source: "MANUAL",
      description: `Fire · parti ${lot.code}: ${input.reason}`,
      occurredAt: parseDate(input.occurredAt) ?? undefined,
      recordedById: actorId,
    });

    return {
      movementId: movement.id,
      quantity: movement.quantity,
      lotOnHand: lot.onHand - input.quantity,
      balance: movement.balance,
    };
  });
}

// ─────────────────────────────────────────────
// OKUMAK
// ─────────────────────────────────────────────

export type LotExpiryState = "OK" | "WARNING" | "EXPIRED" | "UNKNOWN";

export interface StockLotRow {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  code: string;
  expiryDate: string | null;
  producedAt: string | null;
  onHand: number;
  isBlocked: boolean;
  note: string | null;
  /** SKT'ye kalan gün — geçmişse negatif, tarih yoksa null. */
  daysLeft: number | null;
  state: LotExpiryState;
  createdAt: string;
}

export async function listStockLots(
  filter: Partial<StockLotFilter> = {},
): Promise<StockLotRow[]> {
  const search = filter.q?.trim();
  const today = startOfToday();

  const expiryFilter = filter.expiredOnly
    ? { expiryDate: { lt: today } }
    : filter.withinDays !== undefined
      ? { expiryDate: { gte: today, lt: addDays(today, filter.withinDays) } }
      : {};

  const rows = await prisma.stockLot.findMany({
    where: {
      ...(filter.variantId ? { variantId: filter.variantId } : {}),
      ...(filter.includeEmpty ? {} : { onHand: { gt: 0 } }),
      ...expiryFilter,
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" as const } },
              {
                variant: {
                  OR: [
                    { sku: { contains: search, mode: "insensitive" as const } },
                    { barcode: { contains: search, mode: "insensitive" as const } },
                    {
                      product: {
                        name: { contains: search, mode: "insensitive" as const },
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    // SKT'si olmayanlar sona: listenin başı her zaman "önce çıkması gereken mal"
    // olmalı, tarihi bilinmeyen mal o soruya cevap değil.
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: Math.min(filter.limit ?? 200, 500),
    select: {
      id: true,
      variantId: true,
      code: true,
      expiryDate: true,
      producedAt: true,
      onHand: true,
      isBlocked: true,
      note: true,
      createdAt: true,
      variant: {
        select: {
          sku: true,
          expiryWarningDays: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((r) => {
    const daysLeft = r.expiryDate ? daysBetween(today, r.expiryDate) : null;
    const warnAt = r.variant.expiryWarningDays ?? DEFAULT_EXPIRY_WARNING_DAYS;
    return {
      id: r.id,
      variantId: r.variantId,
      sku: r.variant.sku,
      productName: r.variant.product.name,
      code: r.code,
      expiryDate: r.expiryDate ? r.expiryDate.toISOString() : null,
      producedAt: r.producedAt ? r.producedAt.toISOString() : null,
      onHand: r.onHand,
      isBlocked: r.isBlocked,
      note: r.note,
      daysLeft,
      state: expiryState(daysLeft, warnAt),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

function expiryState(daysLeft: number | null, warnAt: number): LotExpiryState {
  if (daysLeft === null) return "UNKNOWN";
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= warnAt) return "WARNING";
  return "OK";
}

export interface LotExpirySummary {
  /** SKT'si geçmiş, hâlâ elde duran. */
  expiredLots: number;
  expiredUnits: number;
  /** Eşiğe girmiş — kalem bazlı eşik yoksa 30 gün. */
  warningLots: number;
  warningUnits: number;
  blockedLots: number;
  /** En yakın SKT — panonun tek satırlık cevabı. */
  nextExpiryDate: string | null;
}

/**
 * Panoya ve uyarı şeridine tek satırlık cevap.
 *
 * Listeyi çekip istemcide saymak yerine ayrı sorgu: uyarı şeridi her sayfada
 * çiziliyor ve 500 satır parti çekmek, iki sayı için ödenecek bedel değil.
 */
export async function getLotExpirySummary(): Promise<LotExpirySummary> {
  const today = startOfToday();
  const horizon = addDays(today, DEFAULT_EXPIRY_WARNING_DAYS);

  const [expired, warning, blocked, next] = await Promise.all([
    prisma.stockLot.aggregate({
      where: { onHand: { gt: 0 }, expiryDate: { lt: today } },
      _count: { _all: true },
      _sum: { onHand: true },
    }),
    prisma.stockLot.aggregate({
      where: {
        onHand: { gt: 0 },
        expiryDate: { gte: today, lt: horizon },
      },
      _count: { _all: true },
      _sum: { onHand: true },
    }),
    prisma.stockLot.count({ where: { onHand: { gt: 0 }, isBlocked: true } }),
    prisma.stockLot.findFirst({
      where: { onHand: { gt: 0 }, expiryDate: { gte: today }, isBlocked: false },
      orderBy: { expiryDate: "asc" },
      select: { expiryDate: true },
    }),
  ]);

  return {
    expiredLots: expired._count._all,
    expiredUnits: expired._sum.onHand ?? 0,
    warningLots: warning._count._all,
    warningUnits: warning._sum.onHand ?? 0,
    blockedLots: blocked,
    nextExpiryDate: next?.expiryDate ? next.expiryDate.toISOString() : null,
  };
}

/**
 * Bir siparişten hangi partilerin çıktığı — irsaliyenin ve geri çağırmanın
 * cevabı. Defterin çıkış satırlarından okunuyor, çünkü partiyi seçen orası.
 */
export interface OrderLotLine {
  variantId: string;
  sku: string;
  productName: string;
  lotCode: string | null;
  expiryDate: string | null;
  quantity: number;
}

export async function listOrderLots(orderId: string): Promise<OrderLotLine[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { orderId, source: "ORDER", direction: "OUT" },
    orderBy: { occurredAt: "asc" },
    select: {
      variantId: true,
      quantity: true,
      variant: { select: { sku: true, product: { select: { name: true } } } },
      lot: { select: { code: true, expiryDate: true } },
    },
  });

  return rows.map((r) => ({
    variantId: r.variantId,
    sku: r.variant.sku,
    productName: r.variant.product.name,
    lotCode: r.lot?.code ?? null,
    expiryDate: r.lot?.expiryDate ? r.lot.expiryDate.toISOString() : null,
    quantity: r.quantity,
  }));
}

/**
 * Bir **irsaliyenin** parti dökümü — kâğıda basılan hâli.
 *
 * `listOrderLots` siparişin tamamını veriyor ve irsaliyeye o basılamaz: bir
 * sipariş parça parça sevk edilebiliyor ve siparişin bütün partilerini ilk
 * irsaliyeye basmak, depoda duran malı da müşteriye teslim edilmiş göstermek
 * olurdu. İkinci irsaliye de aynı partileri ikinci kez yazardı.
 *
 * Parti seçimi **sipariş anında** yapılıyor (FEFO), sevk anında değil — stok da
 * o an düşüyor, yoksa aynı son kutu iki müşteriye satılırdı. Yani irsaliye
 * başına bir parti kaydı yok, ve uydurulacak da değil: bu fonksiyon siparişin
 * ayırdığı partileri **sevk sırasına göre** bölüştürüyor. Aynı siparişin daha
 * önce çıkmış irsaliyelerinin tükettiği adet atlanıyor, kalanın başından bu
 * irsaliyenin adedi kadarı alınıyor. Fiziksel gerçekle aynı: FEFO sırasındaki
 * ilk kutu ilk kamyona biniyor.
 *
 * Sıra `shippedAt`, eşitlikte `createdAt`, onda da eşitlikte `id`: iki irsaliye
 * aynı saniyede kesilirse bile bölüşüm her çağrıda aynı çıkmalı, yoksa aynı
 * kâğıt iki kez basıldığında iki farklı parti yazardı.
 *
 * Ayrılmış parti, sevk edilen adedi karşılamıyorsa kalan adet `lotCode: null`
 * ile dönüyor — "partisi girilmemiş mal" gerçek bir durum (parti takibi kapalı
 * kalemler, eski bakiye) ve kâğıtta boş görünmesi, olmayan bir partiyi
 * yazmaktan iyi.
 */
export interface ShipmentLotLine {
  shipmentItemId: string;
  sku: string;
  productName: string;
  /** Sevk edilen adet — satırın toplamı. */
  quantity: number;
  lots: Array<{ code: string | null; expiryDate: string | null; quantity: number }>;
}

export async function listShipmentLots(
  shipmentId: string,
): Promise<ShipmentLotLine[]> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      orderId: true,
      shippedAt: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          quantity: true,
          orderItem: {
            select: {
              variantId: true,
              sku: true,
              productName: true,
            },
          },
        },
      },
    },
  });
  if (!shipment) return [];

  // Aynı siparişin **daha önceki** irsaliyeleri: variant başına kaç adet
  // gitmişti. Bu irsaliye o adetlerin bittiği yerden başlıyor.
  const earlier = await prisma.shipment.findMany({
    where: { orderId: shipment.orderId },
    orderBy: [{ shippedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      shippedAt: true,
      createdAt: true,
      items: {
        select: { quantity: true, orderItem: { select: { variantId: true } } },
      },
    },
  });

  const consumed = new Map<string, number>();
  for (const s of earlier) {
    if (s.id === shipmentId) break;
    for (const item of s.items) {
      const key = item.orderItem.variantId;
      consumed.set(key, (consumed.get(key) ?? 0) + item.quantity);
    }
  }

  // Siparişin parti ayrımı. Ters kaydı olan çıkışlar dışarıda: iptal edilip
  // geri verilmiş bir parti sevk edilmedi.
  const outs = await prisma.stockMovement.findMany({
    where: {
      orderId: shipment.orderId,
      source: "ORDER",
      direction: "OUT",
      reversedBy: null,
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: {
      variantId: true,
      quantity: true,
      lot: { select: { code: true, expiryDate: true } },
    },
  });

  const byVariant = new Map<
    string,
    Array<{ code: string | null; expiryDate: string | null; quantity: number }>
  >();
  for (const out of outs) {
    const list = byVariant.get(out.variantId) ?? [];
    list.push({
      code: out.lot?.code ?? null,
      expiryDate: out.lot?.expiryDate?.toISOString() ?? null,
      quantity: out.quantity,
    });
    byVariant.set(out.variantId, list);
  }

  return shipment.items.map((item) => {
    const variantId = item.orderItem.variantId;
    const lots = takeSlice(
      byVariant.get(variantId) ?? [],
      consumed.get(variantId) ?? 0,
      item.quantity,
    );
    return {
      shipmentItemId: item.id,
      sku: item.orderItem.sku,
      productName: item.orderItem.productName,
      quantity: item.quantity,
      lots,
    };
  });
}

/**
 * Ayrım listesinden `skip` adet atla, `take` adet al.
 *
 * Bir parti iki irsaliye arasında bölünebiliyor — 40 adetlik partinin 25'i ilk
 * kamyona, 15'i ikinciye. Bu yüzden atlanan/alınan **adet**, satır değil.
 *
 * Ayrım yetmezse kalan adet partisiz dönüyor: kâğıtta boş bir parti hücresi,
 * olmayan bir parti kodundan iyi.
 */
function takeSlice(
  allocations: ReadonlyArray<{
    code: string | null;
    expiryDate: string | null;
    quantity: number;
  }>,
  skip: number,
  take: number,
): Array<{ code: string | null; expiryDate: string | null; quantity: number }> {
  const out: Array<{
    code: string | null;
    expiryDate: string | null;
    quantity: number;
  }> = [];
  let remainingSkip = skip;
  let remainingTake = take;

  for (const a of allocations) {
    if (remainingTake <= 0) break;
    let available = a.quantity;
    if (remainingSkip > 0) {
      const skipped = Math.min(remainingSkip, available);
      remainingSkip -= skipped;
      available -= skipped;
      if (available === 0) continue;
    }
    const used = Math.min(available, remainingTake);
    remainingTake -= used;
    const last = out[out.length - 1];
    // Aynı parti arka arkaya iki satır yazmışsa (aynı partiden iki kez
    // düşülmüş) kâğıtta tek satır görünmeli.
    if (last && last.code === a.code && last.expiryDate === a.expiryDate) {
      last.quantity += used;
    } else {
      out.push({ code: a.code, expiryDate: a.expiryDate, quantity: used });
    }
  }

  if (remainingTake > 0) {
    const last = out[out.length - 1];
    if (last && last.code === null) last.quantity += remainingTake;
    else out.push({ code: null, expiryDate: null, quantity: remainingTake });
  }
  return out;
}

// ─────────────────────────────────────────────
// TARİH YARDIMCILARI
// ─────────────────────────────────────────────

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BusinessError("INVALID_STOCK", "Geçersiz tarih");
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** Gün farkı — saat dilimi kaymasın diye iki tarih de gün başına indirilir. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}
