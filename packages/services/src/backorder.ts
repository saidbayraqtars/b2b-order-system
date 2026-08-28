import { prisma } from "@repo/database";
import type { OrderStatus } from "@repo/types";

// Bekleyen bakiye (backorder): sipariş edilip **henüz sevk edilmemiş** mal.
//
// Kısmi sevkiyat Adım 7'den beri var (`OrderItem.quantityShipped`) ama onu
// **toplu** gösteren hiçbir ekran yoktu: depocunun sabah sorduğu soru "hangi
// üründen ne kadar borçluyuz ve elde var mı", ve o soruyu ancak siparişleri tek
// tek açarak cevaplayabiliyordu.
//
// Burada yeni bir kayıt yok, yeni bir durum yok. Bekleyen bakiye türetilmiş bir
// sayı: `quantity − quantityShipped`. Ayrı bir kolonda tutulsaydı iki sayı
// birbirinden ayrışabilirdi ve hangisinin doğru olduğu belirsiz kalırdı.

/**
 * Bekleyen bakiyeye giren durumlar.
 *
 * `DELIVERED` **dışarıda**: teslim edilmiş bir siparişin eksiği artık bekleyen
 * mal değil, kapanmış bir eksik — onu iade/RMA ya da yeni bir sipariş çözer.
 * `CANCELLED`, `REJECTED` ve onay bekleyenler de dışarıda: ilk ikisi ölü,
 * üçüncüsü henüz sevk edilebilir değil.
 */
const OPEN_STATUSES: OrderStatus[] = ["CONFIRMED", "PROCESSING", "SHIPPED"];

export interface BackorderLine {
  orderId: string;
  orderNumber: string;
  orderedAt: string;
  companyId: string;
  companyName: string;
  status: OrderStatus;
  variantId: string;
  sku: string;
  productName: string;
  quantity: number;
  quantityShipped: number;
  /** `quantity − quantityShipped`; her zaman > 0 (sıfırlar listeye girmiyor). */
  pending: number;
  /** Bu varyantın **toplam** eldeki adedi — depo kırılımı değil. */
  onHand: number;
  /** Sipariş üstünden geçen gün. Sıralamanın ölçüsü: en eski borç en üstte. */
  ageDays: number;
}

export interface BackorderVariant {
  variantId: string;
  sku: string;
  productName: string;
  /** Bu varyant için bekleyen toplam adet. */
  pending: number;
  onHand: number;
  /**
   * Eldeki mal bekleyenin tamamını karşılıyor mu.
   *
   * Karşılıyorsa bu satır bir **iş emri**: mal depoda duruyor ve müşteri
   * bekliyor. Karşılamıyorsa satın almanın işi.
   */
  coverable: boolean;
  /** Kaç ayrı sipariş bekliyor. */
  orderCount: number;
  /** En eski bekleyen siparişin yaşı, gün. */
  oldestDays: number;
}

export interface BackorderReport {
  lines: BackorderLine[];
  variants: BackorderVariant[];
  /** Bekleyen toplam adet — tüm satırların toplamı. */
  totalPending: number;
  /** Eldeki malla karşılanabilen adet. */
  coverablePending: number;
}

function days(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Açık siparişlerin sevk edilmemiş bakiyesi.
 *
 * İki görünüm birden dönüyor ve ikisi iki ayrı soruyu cevaplıyor: **satır**
 * listesi "hangi müşteri ne bekliyor" (tahsilat/müşteri ilişkileri sorusu),
 * **varyant** özeti "neyden ne kadar borçluyuz" (depo/satın alma sorusu).
 * İkisini ayrı sorgulamak aynı veriyi iki kez çekmek olurdu.
 */
export async function getBackorders(
  now: Date = new Date(),
): Promise<BackorderReport> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { status: { in: OPEN_STATUSES } },
      // Prisma kolon-kolon karşılaştırma yapamıyor; sıfır sevk edilmiş her
      // satır aday ve eşitler aşağıda eleniyor. Alternatif ham SQL olurdu ve
      // bu sorgu o maliyeti hak edecek kadar sıcak değil.
      quantityShipped: { gte: 0 },
    },
    select: {
      quantity: true,
      quantityShipped: true,
      sku: true,
      productName: true,
      variantId: true,
      variant: { select: { stock: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          companyId: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { order: { createdAt: "asc" } },
  });

  const lines: BackorderLine[] = [];
  for (const i of items) {
    const pending = i.quantity - i.quantityShipped;
    if (pending <= 0) continue;
    lines.push({
      orderId: i.order.id,
      orderNumber: i.order.orderNumber,
      orderedAt: i.order.createdAt.toISOString(),
      companyId: i.order.companyId,
      companyName: i.order.company.name,
      status: i.order.status,
      variantId: i.variantId,
      sku: i.sku,
      productName: i.productName,
      quantity: i.quantity,
      quantityShipped: i.quantityShipped,
      pending,
      onHand: i.variant.stock,
      ageDays: days(i.order.createdAt, now),
    });
  }

  // Varyant özeti satırlardan toplanıyor — ikinci bir sorgu değil.
  const byVariant = new Map<string, BackorderVariant>();
  for (const l of lines) {
    const hit = byVariant.get(l.variantId);
    if (hit) {
      hit.pending += l.pending;
      hit.orderCount += 1;
      hit.oldestDays = Math.max(hit.oldestDays, l.ageDays);
    } else {
      byVariant.set(l.variantId, {
        variantId: l.variantId,
        sku: l.sku,
        productName: l.productName,
        pending: l.pending,
        onHand: l.onHand,
        coverable: false,
        orderCount: 1,
        oldestDays: l.ageDays,
      });
    }
  }

  const variants = [...byVariant.values()].map((v) => ({
    ...v,
    coverable: v.onHand >= v.pending,
  }));
  // En eski borç en üstte: bekleyen bakiyede sıra, tutar değil **süre**.
  variants.sort((a, b) => b.oldestDays - a.oldestDays || b.pending - a.pending);

  const totalPending = lines.reduce((s, l) => s + l.pending, 0);
  // Karşılanabilirlik varyant düzeyinde: aynı varyantı bekleyen iki siparişin
  // ikisi birden karşılanamıyorsa, ikisi de "karşılanabilir" sayılmamalı.
  const coverablePending = variants
    .filter((v) => v.coverable)
    .reduce((s, v) => s + v.pending, 0);

  return { lines, variants, totalPending, coverablePending };
}
