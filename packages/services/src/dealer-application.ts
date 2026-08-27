import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import {
  defaultPermissionsFor,
  type DealerApplicationDecisionInput,
  type DealerApplicationInput,
  type DealerApplicationStatus,
  type DealerApplicationView,
} from "@repo/types";
import { auditActor, recordAudit, type AuditContext, type RequestMeta } from "./audit";
import { BusinessError } from "./errors";
import { sendMail } from "./mail";
import {
  dealerApplicationApprovedMail,
  dealerApplicationReceivedMail,
  dealerApplicationRejectedMail,
} from "./mail-templates";
import { issueSetPasswordLink } from "./password-reset";

// Bayi başvurusu: gelen talep, verilen karar.
//
// Üç kural bu dosyanın tamamını açıklıyor:
//
//  1. **Başvuru hesap değildir.** Buradaki satırın hiçbir yetkisi yok, hiçbir
//     ekranı açmaz, kimseyi içeri almaz. Kredi limiti olan bir cari kendi
//     kendine açılamamalı — açan kişi yönetimdeki bir insan olmalı.
//  2. **Form kimin kayıtlı olduğunu söylemez.** Uç herkese açık; "bu e-posta
//     zaten kayıtlı" cevabı onu müşteri listesi sorgulayan bir araca
//     çevirirdi. Her gönderim aynı cevabı alır (bkz. password-reset.ts, aynı
//     gerekçe).
//  3. **Karar bir kez uygulanır.** Onay firma ve hesap açar; ikinci kez
//     uygulanması ikinci bir firma demek olurdu. `createdCompanyId` doluysa
//     karar zaten uygulanmıştır.

// ─────────────────────────────────────────────
// hız sınırı
// ─────────────────────────────────────────────
//
// Formu koruyan tek fren bu: arkasında oturum yok, kilitlenecek hesap yok.
// İki ayrı sayaç var çünkü iki ayrı kötüye kullanım var — aynı adresten
// yağdırılan başvurular (bot) ve aynı e-postayla tekrar tekrar gönderim
// (sabırsız kullanıcı ya da yenile tuşu).

const MAX_PER_IP = 5;
const IP_WINDOW_MINUTES = 60;

/**
 * `x-forwarded-for` istemcinin yazabildiği bir başlık (güvenilir bir vekil
 * üstüne yazmadıkça), yani bu sayaç maliyeti yükseltir — erişim denetimi
 * değildir. Adresi hiç olmayan istek sınırlanmıyor: onun için bir kimlik
 * uydurmak, o kimliğin arkasındaki herkesi birbirine bağlardı.
 */
async function ipOverLimit(ip: string | null | undefined): Promise<boolean> {
  if (!ip) return false;
  const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);
  const count = await prisma.dealerApplication.count({
    where: { ip, createdAt: { gte: since } },
  });
  return count >= MAX_PER_IP;
}

// ─────────────────────────────────────────────
// okuma
// ─────────────────────────────────────────────

const applicationSelect = {
  id: true,
  companyName: true,
  taxNumber: true,
  taxOffice: true,
  city: true,
  district: true,
  contactName: true,
  email: true,
  phone: true,
  note: true,
  status: true,
  decisionNote: true,
  decidedAt: true,
  decidedBy: { select: { id: true, name: true } },
  createdCompanyId: true,
  createdUserId: true,
  createdAt: true,
} as const;

type ApplicationRow = {
  id: string;
  companyName: string;
  taxNumber: string | null;
  taxOffice: string | null;
  city: string;
  district: string | null;
  contactName: string;
  email: string;
  phone: string;
  note: string | null;
  status: DealerApplicationStatus;
  decisionNote: string | null;
  decidedAt: Date | null;
  decidedBy: { id: string; name: string } | null;
  createdCompanyId: string | null;
  createdUserId: string | null;
  createdAt: Date;
};

function toView(row: ApplicationRow): DealerApplicationView {
  return {
    ...row,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listDealerApplications(
  filter: { status?: DealerApplicationStatus } = {},
): Promise<DealerApplicationView[]> {
  const rows = await prisma.dealerApplication.findMany({
    where: filter.status ? { status: filter.status } : {},
    select: applicationSelect,
    // Bekleyenler önce: karar bekleyen bir başvuru, üç ay önce reddedilmiş
    // yirmi tanesinin altında kaybolmamalı.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map(toView);
}

export async function getDealerApplication(
  id: string,
): Promise<DealerApplicationView> {
  const row = await prisma.dealerApplication.findUnique({
    where: { id },
    select: applicationSelect,
  });
  if (!row) throw new BusinessError("APPLICATION_NOT_FOUND", "Başvuru bulunamadı");
  return toView(row);
}

/** Kaç başvuru karar bekliyor — kenar çubuğundaki sayaç ve pano kutusu. */
export function countPendingApplications(): Promise<number> {
  return prisma.dealerApplication.count({ where: { status: "PENDING" } });
}

// ─────────────────────────────────────────────
// gönderim (herkese açık)
// ─────────────────────────────────────────────

/**
 * Formu kaydet.
 *
 * Dönüş değeri yok, bilerek: çağıran her durumda aynı cevabı verir. Üç hâlde
 * satır yazılmaz ve üçünde de dışarıdan görünen şey aynıdır —
 *
 *   - adres saatlik sınırı aşmış,
 *   - bu e-postayla zaten karar bekleyen bir başvuru var,
 *   - bu e-posta zaten bir kullanıcıya ait.
 *
 * Üçüncüsü kritik: "zaten kayıtlısınız" cevabı, formu müşteri listesi
 * sorgulayan bir araca çevirirdi. Kayıtlı kullanıcı zaten giriş yapabiliyor;
 * yapamıyorsa gideceği yer "şifremi unuttum".
 *
 * Sessizce düşen her gönderim yine de denetim kaydına yazılıyor — sessizlik
 * başvurana karşı, operatöre karşı değil.
 */
export async function submitDealerApplication(
  input: DealerApplicationInput,
  meta: RequestMeta = {},
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const anonymousActor = { id: null, email, role: null };

  if (await ipOverLimit(meta.ip)) {
    await recordAudit({
      actor: anonymousActor,
      action: "DEALER_APPLICATION_SUBMITTED",
      summary: `Bayi başvurusu hız sınırına takıldı: ${input.companyName}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { throttled: true, windowMinutes: IP_WINDOW_MINUTES },
    });
    return;
  }

  const [pending, existingUser] = await Promise.all([
    prisma.dealerApplication.findFirst({
      where: { email, status: "PENDING" },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (pending || existingUser) {
    await recordAudit({
      actor: anonymousActor,
      action: "DEALER_APPLICATION_SUBMITTED",
      summary: `Yinelenen bayi başvurusu yok sayıldı: ${input.companyName}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: { duplicate: true, hasPending: Boolean(pending), hasAccount: Boolean(existingUser) },
    });
    return;
  }

  const created = await prisma.dealerApplication.create({
    data: {
      companyName: input.companyName,
      taxNumber: input.taxNumber ?? null,
      taxOffice: input.taxOffice ?? null,
      city: input.city,
      district: input.district ?? null,
      contactName: input.contactName,
      email,
      phone: input.phone,
      note: input.note ?? null,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
    select: { id: true },
  });

  await recordAudit({
    actor: anonymousActor,
    action: "DEALER_APPLICATION_SUBMITTED",
    summary: `Bayi başvurusu: ${input.companyName} (${input.city})`,
    entity: "DealerApplication",
    entityId: created.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // Alındı bilgisi. Gönderilememesi başvuruyu geçersiz kılmaz — satır yazıldı,
  // yönetim onu listede görüyor.
  await sendMail({
    to: email,
    ...dealerApplicationReceivedMail({
      contactName: input.contactName,
      companyName: input.companyName,
    }),
  });
}

// ─────────────────────────────────────────────
// karar
// ─────────────────────────────────────────────

/** Karar verilebilir mi — verilmişse ikinci kez uygulanmaz. */
async function loadPending(id: string) {
  const row = await prisma.dealerApplication.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      companyName: true,
      taxNumber: true,
      taxOffice: true,
      city: true,
      district: true,
      contactName: true,
      email: true,
      phone: true,
      createdCompanyId: true,
    },
  });
  if (!row) throw new BusinessError("APPLICATION_NOT_FOUND", "Başvuru bulunamadı");
  if (row.status !== "PENDING") {
    throw new BusinessError(
      "APPLICATION_ALREADY_DECIDED",
      "Bu başvuru zaten karara bağlanmış",
      { status: row.status },
    );
  }
  return row;
}

export async function decideDealerApplication(
  id: string,
  input: DealerApplicationDecisionInput,
  ctx: AuditContext,
): Promise<DealerApplicationView> {
  return input.decision === "APPROVE"
    ? approve(id, input, ctx)
    : reject(id, input, ctx);
}

async function reject(
  id: string,
  input: Extract<DealerApplicationDecisionInput, { decision: "REJECT" }>,
  ctx: AuditContext,
): Promise<DealerApplicationView> {
  const application = await loadPending(id);

  await prisma.dealerApplication.update({
    where: { id },
    data: {
      status: "REJECTED",
      decisionNote: input.note,
      decidedById: ctx.userId,
      decidedAt: new Date(),
    },
  });

  await recordAudit({
    actor: auditActor(ctx),
    action: "DEALER_APPLICATION_REJECTED",
    summary: `Bayi başvurusu reddedildi: ${application.companyName}`,
    entity: "DealerApplication",
    entityId: id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta: { note: input.note },
  });

  await sendMail({
    to: application.email,
    ...dealerApplicationRejectedMail({
      contactName: application.contactName,
      companyName: application.companyName,
    }),
  });

  return getDealerApplication(id);
}

async function approve(
  id: string,
  input: Extract<DealerApplicationDecisionInput, { decision: "APPROVE" }>,
  ctx: AuditContext,
): Promise<DealerApplicationView> {
  const application = await loadPending(id);

  // Çakışmalar onay anında görülür, başvuru anında değil: başvuru bir iddia,
  // firma kartı bir kayıt. Aradan geçen sürede aynı vergi numarasıyla bir firma
  // elle açılmış olabilir.
  if (application.taxNumber) {
    const clash = await prisma.company.findUnique({
      where: { taxNumber: application.taxNumber },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new BusinessError(
        "DUPLICATE_TAX_NUMBER",
        `Bu vergi numarası zaten "${clash.name}" firmasında kayıtlı`,
        { companyId: clash.id },
      );
    }
  }
  const emailTaken = await prisma.user.findUnique({
    where: { email: application.email },
    select: { id: true },
  });
  if (emailTaken) {
    throw new BusinessError(
      "DUPLICATE_EMAIL",
      "Bu e-posta ile bir hesap zaten var — başvuruyu reddedip mevcut hesabı kullanın",
    );
  }

  /**
   * Firma ve yönetici hesabı **tek işlemde** açılıyor. Ayrı ayrı yazılsaydı
   * araya düşen bir hata, kullanıcısı olmayan bir cari bırakırdı: listede
   * duran, kimsenin giremediği bir firma.
   *
   * Yetki kümesi, onaylayan kişinin kümesinden **türetilmiyor**; sabit
   * COMPANY_ADMIN şablonu. "Kendinde olmayanı veremezsin" kuralı (user-admin.ts)
   * personel hesapları arasındaki yetki devrini sınırlar; buradaki hesap
   * DEALER ailesinde ve o ailenin alabileceği izinlerin tamamı
   * `PERMISSION_SCOPE`ta zaten satıcı tarafına kapalı. Kuralı buraya taşımak,
   * `reports.build` izni olmayan bir yöneticinin bayi açamaması demek olurdu.
   */
  const permissions = defaultPermissionsFor("COMPANY_ADMIN");

  const { companyId, userId } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: application.companyName,
        taxNumber: application.taxNumber,
        taxOffice: application.taxOffice,
        email: application.email,
        phone: application.phone,
        creditLimit: input.creditLimit,
        paymentTermDays: input.paymentTermDays,
        requiresOrderApproval: input.requiresOrderApproval,
        salesRepId: input.salesRepId ?? null,
        customerGroupId: input.customerGroupId ?? null,
      },
      select: { id: true },
    });

    const user = await tx.user.create({
      data: {
        email: application.email,
        name: application.contactName,
        phone: application.phone,
        role: "COMPANY_ADMIN",
        permissions: [...permissions],
        companyId: company.id,
        // Kimsenin bilmediği bir şifre. Hesabın tek kapısı, aşağıda üretilen
        // tek kullanımlık bağlantı: postaya yazılmış bir şifre, kutusu
        // yıllarca açık duran kalıcı bir anahtar olurdu.
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
        passwordChangedAt: new Date(),
      },
      select: { id: true },
    });

    await tx.dealerApplication.update({
      where: { id },
      data: {
        status: "APPROVED",
        decisionNote: input.note ?? null,
        decidedById: ctx.userId,
        decidedAt: new Date(),
        createdCompanyId: company.id,
        createdUserId: user.id,
      },
    });

    return { companyId: company.id, userId: user.id };
  });

  await recordAudit({
    actor: auditActor(ctx),
    action: "DEALER_APPLICATION_APPROVED",
    summary: `Bayi başvurusu onaylandı: ${application.companyName} → firma + yönetici hesabı`,
    entity: "DealerApplication",
    entityId: id,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta: {
      companyId,
      userId,
      creditLimit: input.creditLimit,
      paymentTermDays: input.paymentTermDays,
      permissions,
    },
  });
  // Firma ve kullanıcı açılışı, o iki kaydın kendi eylemleriyle de görünsün:
  // "kullanıcılar" ekranından bakan biri hesabın nereden geldiğini bulabilmeli.
  await recordAudit({
    actor: auditActor(ctx),
    action: "COMPANY_CREATED",
    summary: `Firma açıldı (bayi başvurusu): ${application.companyName}`,
    entity: "Company",
    entityId: companyId,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta: { applicationId: id },
  });
  await recordAudit({
    actor: auditActor(ctx),
    action: "USER_CREATED",
    summary: `Kullanıcı oluşturuldu (bayi başvurusu): ${application.email} (COMPANY_ADMIN)`,
    entity: "User",
    entityId: userId,
    ip: ctx.meta?.ip,
    userAgent: ctx.meta?.userAgent,
    meta: { applicationId: id, companyId, permissions },
  });

  const { link, ttlMinutes } = await issueSetPasswordLink(userId);
  await sendMail({
    to: application.email,
    ...dealerApplicationApprovedMail({
      contactName: application.contactName,
      companyName: application.companyName,
      link,
      ttlHours: Math.round(ttlMinutes / 60),
    }),
  });

  return getDealerApplication(id);
}
