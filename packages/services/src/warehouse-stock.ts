import { prisma, type Prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { isModuleEnabled } from "./modules";
import { qty, qtyOrNull, qtySub } from "./quantity";

// Depo bazlı stok ("depo" modülü).
//
// Modül kapalıyken sipariş depo bilmez: stok kontrolü ve düşüş toplam
// üzerinden (`ProductVariant.stock`), depo kırılımı yalnız elle giriş, sayım
// ve aktarımla oynar. Bu, ERP'si yalnız toplam gönderen kurulumun tek doğru
// hâli — orada depo satırları boştur.
//
// Modül açıkken her siparişin bir **çıkış deposu** var. Kontrol o deponun
// satılabilir adedine (eldeki − rezerve) bakar, düşüş o deponun satırından
// yapılır, iptal ve iade aynı depoya döner. Depo satırındaki "sipariş
// alınmasın" bu kalemi o depodan satılmaz yapar.
//
// Depo seçimi tek yerde, burada: hem teklif hem sipariş buradan geçer, yani
// sepetin "stokta var" dediği depo ile siparişin düştüğü depo ayrışamaz.

type Client = Prisma.TransactionClient | typeof prisma;

export interface OrderWarehouse {
  id: string;
  code: string;
  name: string;
}

const WAREHOUSE_SELECT = {
  id: true,
  code: true,
  name: true,
  isActive: true,
} as const;

/**
 * Bu siparişin çıkış deposu; modül kapalıysa null.
 *
 * Sıra: satıcının seçtiği → müşterinin deposu → kurulumun varsayılanı.
 *
 * - **Seçimi yalnız satıcı yapar.** Müşteri kendi siparişinde başka deponun
 *   stoğuna uzanamaz; depo gönderirse reddedilir (serbest vadede olduğu gibi:
 *   sessizce yok saymak, seçimin kabul edildiğini sandırırdı).
 * - Satıcının seçtiği depo yoksa ya da pasifse hata: sessizce başka depoya
 *   düşmek, plasiyerin "araç deposundan" dediği malı merkezden düşerdi.
 * - Müşterinin deposu pasife çekilmişse varsayılana düşülür. Depoyu kapatan
 *   kişi o depoya bağlı yüz müşterinin siparişini kilitlemek istemiyor.
 * - Hiç aktif depo yoksa null: modül açık ama depo tanımlanmamış kurulum
 *   toplamla çalışmaya devam eder.
 */
export async function resolveOrderWarehouse(
  client: Client,
  params: {
    companyWarehouseId: string | null;
    requestedId?: string | null;
    isSeller: boolean;
  },
): Promise<OrderWarehouse | null> {
  if (!(await isModuleEnabled("depo"))) return null;

  if (params.requestedId && !params.isSeller) {
    throw new BusinessError(
      "FORBIDDEN",
      "Çıkış deposunu yalnız satıcı seçebilir",
    );
  }
  if (params.requestedId) {
    const w = await client.warehouse.findUnique({
      where: { id: params.requestedId },
      select: WAREHOUSE_SELECT,
    });
    if (!w || !w.isActive) {
      throw new BusinessError(
        "WAREHOUSE_NOT_FOUND",
        "Depo bulunamadı ya da pasif",
        {
          warehouseId: params.requestedId,
        },
      );
    }
    return pick(w);
  }

  if (params.companyWarehouseId) {
    const w = await client.warehouse.findUnique({
      where: { id: params.companyWarehouseId },
      select: WAREHOUSE_SELECT,
    });
    if (w?.isActive) return pick(w);
  }

  const fallback = await client.warehouse.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: WAREHOUSE_SELECT,
  });
  return fallback ? pick(fallback) : null;
}

function pick(w: { id: string; code: string; name: string }): OrderWarehouse {
  return { id: w.id, code: w.code, name: w.name };
}

export interface WarehouseAvailability {
  /** Satılabilir: eldeki − rezerve, eksiye inmez. Satırı olmayan kalemde 0. */
  available: number;
  /** "Sipariş alınmasın". */
  blocked: boolean;
}

/**
 * Bir depodaki kalemlerin satılabilir adedi.
 *
 * Satırı olmayan kalem o depoda **yok** sayılır (0), toplama düşülmez: depo
 * modülü açık bir kurulumda depo satırı yoksa mal o depoya hiç girmemiştir.
 */
export async function loadWarehouseAvailability(
  client: Client,
  warehouseId: string,
  variantIds: readonly string[],
): Promise<Map<string, WarehouseAvailability>> {
  const rows = await client.variantStock.findMany({
    where: { warehouseId, variantId: { in: [...new Set(variantIds)] } },
    select: {
      variantId: true,
      onHand: true,
      reserved: true,
      blockOrders: true,
    },
  });
  const out = new Map<string, WarehouseAvailability>();
  for (const r of rows) {
    out.set(r.variantId, {
      available: Math.max(0, qtySub(r.onHand, r.reserved)),
      blocked: r.blockOrders,
    });
  }
  return out;
}

export function availabilityOf(
  map: Map<string, WarehouseAvailability>,
  variantId: string,
): WarehouseAvailability {
  return map.get(variantId) ?? { available: 0, blocked: false };
}

/**
 * Müşteriye gösterilen adet. "Sipariş alınmasın" kalem stoksuz görünür:
 * müşteriye "bu depodan satılmıyor" demenin sade hâli, sebebi sipariş
 * hatası söyler.
 */
export function sellableIn(a: WarehouseAvailability): number {
  return a.blocked ? 0 : a.available;
}

// ─────────────────────────────────────────────
// DEPO AYARI (kritik seviye, sipariş alınmasın)
// ─────────────────────────────────────────────

export interface WarehouseStockSettingsInput {
  variantId: string;
  warehouseId: string;
  /** null = kritik seviye yok; verilmezse dokunulmaz. */
  minStock?: number | null;
  blockOrders?: boolean;
}

export interface WarehouseStockSettings {
  variantId: string;
  warehouseId: string;
  onHand: number;
  minStock: number | null;
  blockOrders: boolean;
}

/**
 * Bir kalemin bir depodaki ayarı.
 *
 * Satır yoksa açılır, eldeki 0 ile — miktar deftere dokunmadan değişmez, bu
 * yüzden yeni satır "bu depoda mal yok" der ki zaten doğrusu o.
 */
export async function setWarehouseStockSettings(
  input: WarehouseStockSettingsInput,
): Promise<WarehouseStockSettings> {
  if (
    input.minStock !== undefined &&
    input.minStock !== null &&
    input.minStock < 0
  ) {
    throw new BusinessError("INVALID_STOCK", "Kritik seviye negatif olamaz");
  }

  const [variant, warehouse] = await Promise.all([
    prisma.productVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true },
    }),
    prisma.warehouse.findUnique({
      where: { id: input.warehouseId },
      select: { id: true },
    }),
  ]);
  if (!variant) {
    throw new BusinessError("VARIANT_NOT_FOUND", "Ürün varyantı bulunamadı", {
      variantId: input.variantId,
    });
  }
  if (!warehouse) {
    throw new BusinessError("WAREHOUSE_NOT_FOUND", "Depo bulunamadı", {
      warehouseId: input.warehouseId,
    });
  }

  const data = {
    ...(input.minStock !== undefined ? { minStock: input.minStock } : {}),
    ...(input.blockOrders !== undefined
      ? { blockOrders: input.blockOrders }
      : {}),
  };
  const row = await prisma.variantStock.upsert({
    where: {
      variantId_warehouseId: {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
      },
    },
    create: {
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      ...data,
    },
    update: data,
    select: {
      variantId: true,
      warehouseId: true,
      onHand: true,
      minStock: true,
      blockOrders: true,
    },
  });

  return {
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    onHand: qty(row.onHand),
    minStock: qtyOrNull(row.minStock),
    blockOrders: row.blockOrders,
  };
}
