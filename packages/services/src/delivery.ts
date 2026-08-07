import { Prisma, prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { recordStatusChange } from "./order-lifecycle";

// Kurye masası: kime hangi sevkiyat düştü, teslim edildi mi, kanıtı ne.
//
// Sevkiyatı depodan çıkaran kişi (`shippedBy`) ile kapıya götüren kişi
// (`courier`) ayrı tutuluyor. Aynı kişi olabilir, ama teslim kanıtı — imzalı
// belgenin fotoğrafı — götüren kişiye aittir ve o kişi hesap verir.

export interface DeliveryRow {
  shipmentId: string;
  documentNumber: string;
  orderId: string;
  orderNumber: string;
  companyName: string;
  companyPhone: string | null;
  addressLine: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  shippedAt: string;
  courierId: string | null;
  courierName: string | null;
  deliveredAt: string | null;
  receivedByName: string | null;
  proofPhotoUrl: string | null;
  deliveryNote: string | null;
  itemCount: number;
  grandTotal: string;
}

const SELECT = {
  id: true,
  documentNumber: true,
  shippedAt: true,
  courierId: true,
  courier: { select: { name: true } },
  deliveredAt: true,
  receivedByName: true,
  proofPhotoUrl: true,
  deliveryNote: true,
  _count: { select: { items: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      grandTotal: true,
      company: { select: { name: true, phone: true } },
      shippingAddress: {
        select: {
          line1: true,
          line2: true,
          city: true,
          district: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  },
} satisfies Prisma.ShipmentSelect;

type Row = Prisma.ShipmentGetPayload<{ select: typeof SELECT }>;

function toRow(s: Row): DeliveryRow {
  const a = s.order.shippingAddress;
  return {
    shipmentId: s.id,
    documentNumber: s.documentNumber,
    orderId: s.order.id,
    orderNumber: s.order.orderNumber,
    companyName: s.order.company.name,
    companyPhone: s.order.company.phone,
    addressLine: a ? [a.line1, a.line2].filter(Boolean).join(" ") : null,
    city: a?.city ?? null,
    district: a?.district ?? null,
    latitude: a?.latitude ?? null,
    longitude: a?.longitude ?? null,
    shippedAt: s.shippedAt.toISOString(),
    courierId: s.courierId,
    courierName: s.courier?.name ?? null,
    deliveredAt: s.deliveredAt?.toISOString() ?? null,
    receivedByName: s.receivedByName,
    proofPhotoUrl: s.proofPhotoUrl,
    deliveryNote: s.deliveryNote,
    itemCount: s._count.items,
    grandTotal: s.order.grandTotal.toFixed(2),
  };
}

export interface ListDeliveriesArgs {
  /** Yalnızca bu kuryenin işleri. Boş = hepsi (yönetim ekranı). */
  courierId?: string;
  /** Kimseye atanmamış sevkiyatlar da listelensin mi (dağıtım ekranı). */
  includeUnassigned?: boolean;
  /** Teslim edilmişleri de getir. Varsayılan: yalnızca açık işler. */
  includeDelivered?: boolean;
}

export async function listDeliveries(
  args: ListDeliveriesArgs = {},
): Promise<DeliveryRow[]> {
  const where: Prisma.ShipmentWhereInput = {};

  if (args.courierId) {
    where.OR = args.includeUnassigned
      ? [{ courierId: args.courierId }, { courierId: null }]
      : [{ courierId: args.courierId }];
  } else if (!args.includeUnassigned) {
    // Yönetim ekranı: atanmış olsun olmasın hepsi.
  }

  if (!args.includeDelivered) where.deliveredAt = null;

  const rows = await prisma.shipment.findMany({
    where,
    orderBy: [{ deliveredAt: "asc" }, { shippedAt: "asc" }],
    select: SELECT,
  });
  return rows.map(toRow);
}

export async function assignCourier(
  shipmentId: string,
  courierId: string | null,
): Promise<DeliveryRow> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, deliveredAt: true },
  });
  if (!shipment) throw new BusinessError("SHIPMENT_NOT_FOUND", "Sevkiyat bulunamadı");
  if (shipment.deliveredAt) {
    throw new BusinessError(
      "SHIPMENT_ALREADY_DELIVERED",
      "Teslim edilmiş sevkiyatın kuryesi değiştirilemez",
    );
  }

  if (courierId) {
    const courier = await prisma.user.findUnique({
      where: { id: courierId },
      select: { role: true, isActive: true },
    });
    if (!courier || !courier.isActive) {
      throw new BusinessError("USER_NOT_FOUND", "Kurye bulunamadı");
    }
    // Süper admin de taşıyabilsin diye ikisi kabul; bayi ya da plasiyer hesabı
    // kurye olarak atanamaz — teslim kanıtı yanlış kişiye bağlanırdı.
    if (courier.role !== "COURIER" && courier.role !== "SUPER_ADMIN") {
      throw new BusinessError("INVALID_COURIER", "Bu hesap kurye değil");
    }
  }

  const row = await prisma.shipment.update({
    where: { id: shipmentId },
    data: { courierId },
    select: SELECT,
  });
  return toRow(row);
}

export interface ConfirmDeliveryArgs {
  shipmentId: string;
  receivedByName: string;
  proofPhotoUrl?: string | null;
  note?: string | null;
  /** İşlemi yapan. Sevkiyat başkasına atanmışsa reddedilir. */
  actorId: string;
  /** Süper admin başkasının işini de kapatabilir. */
  actorIsAdmin: boolean;
}

/**
 * Teslimi kaydet.
 *
 * Bir kez yazılır: teslim edilmiş sevkiyat yeniden teslim edilmez. Düzeltme
 * gerekiyorsa yeni bir kayıt değil, elle müdahale gerekir — imza kanıtının
 * üstüne yazılabilmesi kanıt olmasını bitirirdi.
 *
 * Siparişin tüm sevkiyatları teslim edildiyse sipariş DELIVERED'a geçer. Kısmi
 * teslimde durum değişmez: yarısı kapıda olan bir sipariş "teslim edildi"
 * sayılamaz.
 */
export async function confirmDelivery(
  args: ConfirmDeliveryArgs,
): Promise<DeliveryRow> {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: args.shipmentId },
      select: {
        id: true,
        courierId: true,
        deliveredAt: true,
        orderId: true,
        order: { select: { status: true } },
      },
    });
    if (!shipment) throw new BusinessError("SHIPMENT_NOT_FOUND", "Sevkiyat bulunamadı");
    if (shipment.deliveredAt) {
      throw new BusinessError("SHIPMENT_ALREADY_DELIVERED", "Bu sevkiyat zaten teslim edildi");
    }
    if (!args.actorIsAdmin && shipment.courierId !== args.actorId) {
      throw new BusinessError("FORBIDDEN", "Bu sevkiyat size atanmamış");
    }

    const updated = await tx.shipment.update({
      where: { id: args.shipmentId },
      data: {
        deliveredAt: new Date(),
        receivedByName: args.receivedByName,
        proofPhotoUrl: args.proofPhotoUrl ?? null,
        deliveryNote: args.note ?? null,
        // Atanmamış bir sevkiyatı teslim eden kişi kurye olarak yazılır;
        // kanıtın sahibi belirsiz kalmamalı.
        ...(shipment.courierId ? {} : { courierId: args.actorId }),
      },
      select: SELECT,
    });

    const open = await tx.shipment.count({
      where: { orderId: shipment.orderId, deliveredAt: null },
    });
    if (open === 0 && shipment.order.status !== "DELIVERED") {
      await tx.order.update({
        where: { id: shipment.orderId },
        data: { status: "DELIVERED" },
      });
      await recordStatusChange(tx, {
        orderId: shipment.orderId,
        fromStatus: shipment.order.status,
        toStatus: "DELIVERED",
        changedById: args.actorId,
        note: "Tüm sevkiyatlar teslim edildi",
      });
    }

    return toRow(updated);
  });
}

/** Kurye olarak atanabilecek hesaplar. */
export async function listCouriers(): Promise<
  Array<{ id: string; name: string; email: string }>
> {
  return prisma.user.findMany({
    where: { role: "COURIER", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}
