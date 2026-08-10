import { prisma, type Prisma } from "@repo/database";
import {
  SECURITY_ACTIONS,
  type AuditAction,
  type AuditEntry,
  type AuditQueryInput,
  type Role,
} from "@repo/types";

// Append-only audit trail.
//
// Two rules make this trustworthy:
//   1. Nothing here updates or deletes. There is no exported mutation other
//      than `recordAudit`.
//   2. Writing a log entry must never break the action it describes. A failed
//      insert is swallowed and reported to stderr — losing one line is bad, but
//      rolling back a completed password change because logging failed is worse.
//
// The actor's e-mail and role are denormalised so an entry stays readable after
// the account is deleted (the FK is onDelete: SetNull).

export interface AuditActor {
  id: string | null;
  email: string;
  role: Role | null;
}

/** Where the request came from. Recorded, never trusted for authorisation. */
export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  /** Which front door the request came through. */
  channel?: "web" | "mobile";
}

/**
 * Acting identity threaded into services that write to the trail. Always built
 * from the verified session, never from request input.
 */
export interface AuditContext {
  userId: string;
  email: string;
  role: Role;
  meta?: RequestMeta;
}

export function auditActor(ctx: AuditContext): AuditActor {
  return { id: ctx.userId, email: ctx.email, role: ctx.role };
}

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  summary: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const data = {
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: input.action,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    summary: input.summary,
    meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    ip: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  };

  try {
    await prisma.auditLog.create({ data: { ...data, actorId: input.actor.id } });
  } catch (err) {
    // Silinmiş bir hesabın jetonuyla gelen istek de kaydedilmeli — kaydedilmesi
    // *gereken* şey zaten budur. Ama actorId yabancı anahtar, satır yok, yazma
    // düşüyordu: trail'in en çok işe yarayacağı an sessizce boş kalıyordu.
    // `actorId` bu yüzden opsiyonel ve e-posta bu yüzden kopyalanıyor; failen
    // anahtar oysa aktörü isimle yazıp devam ediyoruz.
    // Koda bakılıyor, sınıfa değil: `Prisma` bu dosyaya yalnızca tip olarak
    // giriyor, çalışma zamanında ortada bir sınıf yok.
    if ((err as { code?: string } | null)?.code === "P2003") {
      try {
        await prisma.auditLog.create({ data: { ...data, actorId: null } });
        return;
      } catch (retryErr) {
        console.error("[audit] kayıt yazılamadı", retryErr);
        return;
      }
    }
    console.error("[audit] kayıt yazılamadı", err);
  }
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Id to pass back as `cursor` for the next page, or null at the end. */
  nextCursor: string | null;
}

/**
 * Read the trail. Super-admin only at the route layer; `actorId` is how a
 * normal user reads their *own* history (see listOwnActivity).
 */
export async function listAudit(query: AuditQueryInput): Promise<AuditPage> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.securityOnly && !query.action
      ? { action: { in: [...SECURITY_ACTIONS] } }
      : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.search
      ? {
          OR: [
            { actorEmail: { contains: query.search, mode: "insensitive" } },
            { summary: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}),
          },
        }
      : {}),
  };

  // Take one extra row to find out whether another page exists.
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    entries: page.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      actorRole: r.actorRole,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      summary: r.summary,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** The "son hareketlerim" list on a user's own account page. */
export async function listOwnActivity(
  userId: string,
  limit = 20,
): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    actorEmail: r.actorEmail,
    actorRole: r.actorRole,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    summary: r.summary,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }));
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
