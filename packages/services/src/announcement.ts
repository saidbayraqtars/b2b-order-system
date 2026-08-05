import { prisma } from "@repo/database";
import type {
  AnnouncementPlacement,
  AnnouncementTone,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from "@repo/types";
import { BusinessError } from "./errors";

// Vitrin duyuruları: kayan şerit, katalog üstü bant, açılış penceresi.
//
// Promotion'dan ayrı bir model olmasının sebebi: bu katman hiçbir tutarı
// etkilemez. Fiyatı değiştiren tek yer promosyon motorudur; burası yalnızca
// "ne yazsın, nerede dursun, kime görünsün" sorusunu cevaplar. İkisini tek
// modelde birleştirmek, bir metin düzeltmesini fiyat mantığına dokunan bir
// yazma hâline getirirdi.

export interface AnnouncementView {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  placement: AnnouncementPlacement;
  tone: AnnouncementTone;
  dismissible: boolean;
  enabled: boolean;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  customerGroupIds: string[];
}

type Row = {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  placement: AnnouncementPlacement;
  tone: string;
  dismissible: boolean;
  enabled: boolean;
  priority: number;
  startsAt: Date | null;
  endsAt: Date | null;
  customerGroupIds: string[];
};

function toView(row: Row): AnnouncementView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    linkLabel: row.linkLabel,
    placement: row.placement,
    // Ton veritabanında serbest metin; tanınmayan bir değer arayüzü
    // kırmasın diye nötre düşürülür.
    tone: (["brand", "neutral", "success", "warning", "danger", "info"].includes(
      row.tone,
    )
      ? row.tone
      : "neutral") as AnnouncementTone,
    dismissible: row.dismissible,
    enabled: row.enabled,
    priority: row.priority,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    customerGroupIds: row.customerGroupIds,
  };
}

/**
 * Bir müşterinin şu an göreceği duyurular.
 *
 * Kapsam filtresi **veritabanında** uygulanır, arayüzde değil: "yalnızca
 * bayilere" diye işaretlenmiş bir duyuru başka bir gruptaki firmaya hiç
 * gönderilmez — istemciye gidip orada gizlenmez.
 */
export async function listActiveAnnouncements(
  customerGroupId: string | null,
): Promise<AnnouncementView[]> {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      enabled: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        {
          OR: [
            { customerGroupIds: { isEmpty: true } },
            ...(customerGroupId
              ? [{ customerGroupIds: { has: customerGroupId } }]
              : []),
          ],
        },
      ],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 20,
  });
  return rows.map(toView);
}

/** Yönetim listesi — süresi geçmiş ve kapalı olanlar dahil. */
export async function listAllAnnouncements(): Promise<AnnouncementView[]> {
  const rows = await prisma.announcement.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map(toView);
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<AnnouncementView> {
  const row = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
      linkLabel: input.linkLabel ?? null,
      placement: input.placement ?? "BANNER",
      tone: input.tone ?? "brand",
      dismissible: input.dismissible ?? true,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      customerGroupIds: input.customerGroupIds ?? [],
    },
  });
  return toView(row);
}

export async function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
): Promise<AnnouncementView> {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    throw new BusinessError("ANNOUNCEMENT_NOT_FOUND", "Duyuru bulunamadı", { id });
  }
  const row = await prisma.announcement.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
      ...(input.linkLabel !== undefined ? { linkLabel: input.linkLabel } : {}),
      ...(input.placement !== undefined ? { placement: input.placement } : {}),
      ...(input.tone !== undefined ? { tone: input.tone } : {}),
      ...(input.dismissible !== undefined
        ? { dismissible: input.dismissible }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.startsAt !== undefined
        ? { startsAt: input.startsAt ? new Date(input.startsAt) : null }
        : {}),
      ...(input.endsAt !== undefined
        ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
        : {}),
      ...(input.customerGroupIds !== undefined
        ? { customerGroupIds: input.customerGroupIds }
        : {}),
    },
  });
  return toView(row);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    throw new BusinessError("ANNOUNCEMENT_NOT_FOUND", "Duyuru bulunamadı", { id });
  }
  await prisma.announcement.delete({ where: { id } });
}
