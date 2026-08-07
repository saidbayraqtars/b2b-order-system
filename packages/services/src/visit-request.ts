import { Prisma, prisma } from "@repo/database";
import type { VisitRequestStatus } from "@repo/types";
import { BusinessError } from "./errors";

// "Bizi arayın / uğrayın" çağrıları ve plasiyerin günlük ziyaret listesi.
//
// Çağrı ile ziyaret ayrı şeyler: biri *talep*, diğeri *kanıt* (CheckIn). Talebi
// ziyaret kaydına dönüştürmek yerine eşleştiriyoruz, böylece "çağrıdan kaç saat
// sonra gidildi" sorusu cevaplanabiliyor ve karşılıksız kalan çağrı
// kaybolmuyor.

export interface VisitRequestRow {
  id: string;
  companyId: string;
  companyName: string;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  salesRepId: string | null;
  requestedFor: string | null;
  note: string | null;
  status: VisitRequestStatus;
  sortIndex: number;
  createdAt: string;
  completedAt: string | null;
}

const SELECT = {
  id: true,
  companyId: true,
  company: {
    select: {
      name: true,
      phone: true,
      addresses: {
        // Haritada gösterilecek tek nokta: varsayılan adres, yoksa ilk kayıt.
        orderBy: [{ isDefault: "desc" }, { id: "asc" }],
        take: 1,
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
  salesRepId: true,
  requestedFor: true,
  note: true,
  status: true,
  sortIndex: true,
  createdAt: true,
  completedAt: true,
} satisfies Prisma.VisitRequestSelect;

type Row = Prisma.VisitRequestGetPayload<{ select: typeof SELECT }>;

function toRow(r: Row): VisitRequestRow {
  const a = r.company.addresses[0];
  return {
    id: r.id,
    companyId: r.companyId,
    companyName: r.company.name,
    city: a?.city ?? null,
    district: a?.district ?? null,
    addressLine: a ? [a.line1, a.line2].filter(Boolean).join(" ") : null,
    latitude: a?.latitude ?? null,
    longitude: a?.longitude ?? null,
    phone: r.company.phone ?? null,
    salesRepId: r.salesRepId,
    requestedFor: r.requestedFor?.toISOString() ?? null,
    note: r.note,
    status: r.status,
    sortIndex: r.sortIndex,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

export interface CreateVisitRequestArgs {
  companyId: string;
  requestedFor?: Date | null;
  note?: string | null;
  createdById: string;
}

/**
 * Çağrı aç.
 *
 * Aynı firmanın açık çağrısı varsa ikincisi açılmaz, mevcut olan güncellenir:
 * "gelmediniz" diye üç kez basan bir bayi plasiyerin listesini üç satırla
 * doldurmamalı — istenen gün ve not yenilenir, sıra korunur.
 */
export async function createVisitRequest(
  args: CreateVisitRequestArgs,
): Promise<VisitRequestRow> {
  const company = await prisma.company.findUnique({
    where: { id: args.companyId },
    select: { id: true, isActive: true, salesRepId: true },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
  }
  if (!company.isActive) {
    throw new BusinessError("COMPANY_INACTIVE", "Firma pasif");
  }

  const open = await prisma.visitRequest.findFirst({
    where: { companyId: args.companyId, status: { in: ["OPEN", "PLANNED"] } },
    select: { id: true },
  });

  const data = {
    requestedFor: args.requestedFor ?? null,
    note: args.note ?? null,
    // Portföy sonradan değişse bile çağrı sahipsiz kalmasın diye o anki
    // temsilci yazılıyor.
    salesRepId: company.salesRepId,
  };

  const row = open
    ? await prisma.visitRequest.update({
        where: { id: open.id },
        data,
        select: SELECT,
      })
    : await prisma.visitRequest.create({
        data: { companyId: args.companyId, createdById: args.createdById, ...data },
        select: SELECT,
      });

  return toRow(row);
}

export interface ListVisitRequestArgs {
  /** Yalnızca bu temsilcinin çağrıları. Süper admin için boş bırakılır. */
  salesRepId?: string;
  companyId?: string;
  statuses?: VisitRequestStatus[];
  /** Bu güne ait olanlar: istenen gün bugün ya da geçmiş olanlar. */
  forDay?: Date;
}

/**
 * Çağrı listesi, plasiyerin gördüğü sırayla.
 *
 * Sıralama: elle verilen `sortIndex`, sonra istenen gün, sonra çağrı zamanı.
 * Elle sıra en başta çünkü gün planını yapan kişi plasiyerin kendisi — sistemin
 * tahmini onun bildiği trafiği ve randevuyu bilmiyor.
 */
export async function listVisitRequests(
  args: ListVisitRequestArgs = {},
): Promise<VisitRequestRow[]> {
  const where: Prisma.VisitRequestWhereInput = {
    ...(args.salesRepId ? { salesRepId: args.salesRepId } : {}),
    ...(args.companyId ? { companyId: args.companyId } : {}),
    status: { in: args.statuses ?? ["OPEN", "PLANNED"] },
  };

  if (args.forDay) {
    const end = new Date(args.forDay);
    end.setHours(23, 59, 59, 999);
    // Günü geçmiş ama hâlâ açık çağrılar da listede kalır: karşılanmamış bir
    // çağrının sessizce düşmesi, çağrının hiç olmamasından kötü.
    where.OR = [{ requestedFor: null }, { requestedFor: { lte: end } }];
  }

  const rows = await prisma.visitRequest.findMany({
    where,
    orderBy: [
      { sortIndex: "asc" },
      { requestedFor: "asc" },
      { createdAt: "asc" },
    ],
    select: SELECT,
  });
  return rows.map(toRow);
}

export async function updateVisitRequest(
  id: string,
  patch: {
    status?: VisitRequestStatus;
    requestedFor?: Date | null;
    note?: string | null;
  },
): Promise<VisitRequestRow> {
  const existing = await prisma.visitRequest.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new BusinessError("VISIT_REQUEST_NOT_FOUND", "Çağrı bulunamadı");

  const row = await prisma.visitRequest.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.requestedFor !== undefined
        ? { requestedFor: patch.requestedFor }
        : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      // DONE/CANCELLED kapanış anını damgalar; geri açılırsa damga silinir.
      ...(patch.status === "DONE" || patch.status === "CANCELLED"
        ? { completedAt: new Date() }
        : patch.status
          ? { completedAt: null }
          : {}),
    },
    select: SELECT,
  });
  return toRow(row);
}

/**
 * Listeyi elle sırala.
 *
 * Gönderilen kimlikler sırayla 0,1,2… alır. Listede olmayan çağrılar
 * dokunulmadan kalır ve büyük `sortIndex`'leriyle sona düşer — araya yeni bir
 * çağrı geldiğinde sıralama isteği eskimiş olsa bile kimse listeden düşmez.
 *
 * Tek işlemde yazılıyor: yarım kalmış bir sıralama, sıralanmamış listeden daha
 * kafa karıştırıcı olurdu.
 */
export async function reorderVisitRequests(
  ids: readonly string[],
  salesRepId: string | null,
): Promise<void> {
  const owned = await prisma.visitRequest.findMany({
    where: {
      id: { in: [...ids] },
      ...(salesRepId ? { salesRepId } : {}),
    },
    select: { id: true },
  });
  const allowed = new Set(owned.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));

  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.visitRequest.update({ where: { id }, data: { sortIndex: index } }),
    ),
  );
}

/**
 * Ziyaret kapandığında çağrıyı da kapat.
 *
 * Plasiyerin aynı işi iki kez yapmaması için: kapıda check-out yapıldığında o
 * firmanın açık çağrısı kendiliğinden "ziyaret edildi" olur ve hangi ziyaretin
 * kapattığı `checkInId` ile yazılır.
 */
export async function closeVisitRequestsForCheckIn(
  companyId: string,
  checkInId: string,
): Promise<number> {
  const res = await prisma.visitRequest.updateMany({
    where: { companyId, status: { in: ["OPEN", "PLANNED"] } },
    data: { status: "DONE", checkInId, completedAt: new Date() },
  });
  return res.count;
}
