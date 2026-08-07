import { prisma } from "@repo/database";
import type { LabelTemplateKind } from "@repo/types";
import { BusinessError } from "./errors";
import { loadTenant } from "./tenant";

// Şablonun içine ne yazılacağı.
//
// Basım iki parçaya ayrılmış: burada *veri* toplanıyor (siparişten, sevkiyattan,
// kiracı klasöründen), ekranda ise satırlar çiziliyor. Ayrımın sebebi, aynı
// verinin tek fiş, toplu basım ve önizleme için üç ayrı yerde tekrar
// toplanmasını engellemek — üçü ayrışırsa önizlemede doğru görünen bir fiş
// kâğıtta yanlış çıkar.

/** Tek bir basılacak parça: bir sipariş ya da bir sevkiyat için doldurulmuş alanlar. */
export interface LabelData {
  /** Tanımlayıcı — toplu basımda satırları ayırt etmek için. */
  key: string;
  fields: Record<string, string>;
  items: Array<{ name: string; sku: string; quantity: number; total: string }>;
  totals: Array<{ label: string; value: string }>;
}

function tr(n: unknown): string {
  return Number(n ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function trDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("tr-TR") : "";
}

async function sellerName(): Promise<string> {
  try {
    return (await loadTenant()).seller.legalName;
  } catch {
    // Kiracı klasörü eksikse belge zaten geçersiz sayılıyor (bkz. document-shell);
    // fişin başlığı boş kalır, basım engellenmez.
    return "";
  }
}

/**
 * Sipariş fişi verisi.
 *
 * Sipariş kimlikleri toplu geliyor çünkü asıl kullanım "gelen siparişleri
 * toplu çıkar": tek tek sorgulamak yüz siparişte yüz gidiş-dönüş demek olurdu.
 */
export async function buildOrderLabelData(
  orderIds: readonly string[],
): Promise<LabelData[]> {
  if (orderIds.length === 0) return [];

  const [orders, seller] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        paymentMethod: true,
        paymentTermDays: true,
        subtotal: true,
        taxTotal: true,
        grandTotal: true,
        note: true,
        company: { select: { name: true, phone: true } },
        createdBy: { select: { name: true } },
        shippingAddress: {
          select: { line1: true, line2: true, city: true, district: true },
        },
        items: {
          select: {
            productName: true,
            sku: true,
            quantity: true,
            lineTotal: true,
          },
        },
      },
    }),
    sellerName(),
  ]);

  // Girilen sıra korunuyor: toplu basımda kâğıtların sırası ekrandaki sırayla
  // aynı olmalı, yoksa eşleştirmek elde kalıyor.
  const byId = new Map(orders.map((o) => [o.id, o]));

  return orderIds.flatMap((id) => {
    const o = byId.get(id);
    if (!o) return [];
    const a = o.shippingAddress;
    return [
      {
        key: o.id,
        fields: {
          "siparis.no": o.orderNumber,
          "siparis.tarih": trDate(o.createdAt),
          "firma.ad": o.company.name,
          "firma.telefon": o.company.phone ?? "",
          "temsilci.ad": o.createdBy?.name ?? "",
          "siparis.odeme": o.paymentMethod,
          "siparis.vade": `${o.paymentTermDays} gün`,
          "siparis.aratoplam": tr(o.subtotal),
          "siparis.kdv": tr(o.taxTotal),
          "siparis.toplam": tr(o.grandTotal),
          "siparis.not": o.note ?? "",
          "adres.satir": a ? [a.line1, a.line2].filter(Boolean).join(" ") : "",
          "adres.ilce": a?.district ?? "",
          "adres.sehir": a?.city ?? "",
          "satici.ad": seller,
          tarih: trDate(new Date()),
        },
        items: o.items.map((i) => ({
          name: i.productName,
          sku: i.sku,
          quantity: i.quantity,
          total: tr(i.lineTotal),
        })),
        totals: [
          { label: "Ara toplam", value: tr(o.subtotal) },
          { label: "KDV", value: tr(o.taxTotal) },
          { label: "Genel toplam", value: tr(o.grandTotal) },
        ],
      },
    ];
  });
}

/** Kargo etiketi ve teslim fişi verisi — sevkiyat üzerinden. */
export async function buildShipmentLabelData(
  shipmentIds: readonly string[],
): Promise<LabelData[]> {
  if (shipmentIds.length === 0) return [];

  const [shipments, seller] = await Promise.all([
    prisma.shipment.findMany({
      where: { id: { in: [...shipmentIds] } },
      select: {
        id: true,
        documentNumber: true,
        carrier: true,
        trackingNumber: true,
        deliveredAt: true,
        receivedByName: true,
        courier: { select: { name: true } },
        _count: { select: { items: true } },
        items: {
          select: {
            quantity: true,
            orderItem: {
              select: { productName: true, sku: true, unitPrice: true },
            },
          },
        },
        order: {
          select: {
            orderNumber: true,
            grandTotal: true,
            company: { select: { name: true, phone: true } },
            shippingAddress: {
              select: { line1: true, line2: true, city: true, district: true },
            },
          },
        },
      },
    }),
    sellerName(),
  ]);

  const byId = new Map(shipments.map((s) => [s.id, s]));

  return shipmentIds.flatMap((id) => {
    const s = byId.get(id);
    if (!s) return [];
    const a = s.order.shippingAddress;
    return [
      {
        key: s.id,
        fields: {
          "siparis.no": s.order.orderNumber,
          "sevkiyat.no": s.documentNumber,
          "firma.ad": s.order.company.name,
          "firma.telefon": s.order.company.phone ?? "",
          "adres.satir": a ? [a.line1, a.line2].filter(Boolean).join(" ") : "",
          "adres.ilce": a?.district ?? "",
          "adres.sehir": a?.city ?? "",
          "sevkiyat.kargo": s.carrier ?? "",
          "sevkiyat.takipno": s.trackingNumber ?? "",
          "sevkiyat.koli": String(s._count.items),
          "kurye.ad": s.courier?.name ?? "",
          "teslim.alan": s.receivedByName ?? "",
          "teslim.tarih": trDate(s.deliveredAt),
          "siparis.toplam": tr(s.order.grandTotal),
          "satici.ad": seller,
          tarih: trDate(new Date()),
        },
        items: s.items.map((i) => ({
          name: i.orderItem.productName,
          sku: i.orderItem.sku,
          quantity: i.quantity,
          total: tr(Number(i.orderItem.unitPrice) * i.quantity),
        })),
        totals: [{ label: "Genel toplam", value: tr(s.order.grandTotal) }],
      },
    ];
  });
}

/**
 * `{{alan}}` işaretlerini doldur.
 *
 * Tanınmayan işaret **boş** basılır, olduğu gibi bırakılmaz: müşterinin eline
 * geçen fişte `{{firma.ad}}` yazması, o satırın hiç olmamasından kötüdür.
 */
export function fillTokens(
  text: string,
  fields: Record<string, string>,
): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
    fields[key] ?? "",
  );
}

/**
 * Basım öncesi yetki.
 *
 * Kapsam boşsa (süper admin) kontrol atlanır; aksi hâlde istenen kimliklerin
 * **hepsi** kapsam içinde görünmek zorunda. Sayı karşılaştırması yeterli:
 * görünmeyen tek bir kimlik bile toplamı düşürür.
 *
 * `courierId` ayrı bir kapsam: kurye firmaya değil, kendi taşıdığı sevkiyata
 * bakar.
 */
export interface PrintScope {
  companyId?: string | null;
  salesRepId?: string | null;
  courierId?: string | null;
}

function isUnscoped(scope: PrintScope): boolean {
  return !scope.companyId && !scope.salesRepId && !scope.courierId;
}

export async function assertOrdersPrintable(
  orderIds: readonly string[],
  scope: PrintScope,
): Promise<void> {
  if (isUnscoped(scope)) return; // süper admin
  if (orderIds.length === 0) return;

  const visible = await prisma.order.count({
    where: {
      id: { in: [...orderIds] },
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.salesRepId ? { company: { salesRepId: scope.salesRepId } } : {}),
      ...(scope.courierId
        ? { shipments: { some: { courierId: scope.courierId } } }
        : {}),
    },
  });
  if (visible !== orderIds.length) {
    throw new BusinessError("FORBIDDEN", "Bu siparişlerden bazılarına erişiminiz yok");
  }
}

/**
 * Aynı kural sevkiyat için.
 *
 * Kargo etiketi ve teslim fişi sevkiyattan basıldığı için kendi kontrolü
 * gerekiyor — siparişinkini kullanmak, bir bayinin başkasının irsaliye numarası
 * ve adresi yazılı etiketini basabilmesi demekti.
 */
export async function assertShipmentsPrintable(
  shipmentIds: readonly string[],
  scope: PrintScope,
): Promise<void> {
  if (isUnscoped(scope)) return;
  if (shipmentIds.length === 0) return;

  const visible = await prisma.shipment.count({
    where: {
      id: { in: [...shipmentIds] },
      ...(scope.companyId ? { order: { companyId: scope.companyId } } : {}),
      ...(scope.salesRepId
        ? { order: { company: { salesRepId: scope.salesRepId } } }
        : {}),
      ...(scope.courierId ? { courierId: scope.courierId } : {}),
    },
  });
  if (visible !== shipmentIds.length) {
    throw new BusinessError("FORBIDDEN", "Bu sevkiyatlardan bazılarına erişiminiz yok");
  }
}

export type { LabelTemplateKind };
