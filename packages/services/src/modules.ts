import { prisma } from "@repo/database";
import {
  MODULES,
  MODULE_KEYS,
  type ModuleKey,
} from "@repo/types";
import { auditActor, recordAudit, type AuditContext } from "./audit";

// Modül durumu — hangi özellik kümesi bu kurulumda açık.
//
// Satır yoksa modül **açık**: bu tablo eklenmeden önce kurulmuş bir sistem
// yükseltildiğinde hiçbir ekran kaybolmamalı. Kapatmak bilinçli bir hamle.
// Tek istisna davranış değiştiren modül (`defaultEnabled: false`, ör. `depo`):
// o satırı yokken kapalıdır ve bilerek açılır.
//
// Her istekte okunuyor (izin kapısı buna bakıyor), bu yüzden süreç içinde 5 sn
// önbellekte. Principal önbelleğiyle aynı sınır: çok süreçli bir kurulumda
// değişiklik öteki süreçlere en geç 5 sn sonra ulaşır (KALAN-ISLER §3.4).

const TTL_MS = 5_000;
let cache: { at: number; disabled: ModuleKey[] } | null = null;

/** Kapalı modüller. İzin kapısı ve fiyatlama bunu okur. */
export async function getDisabledModules(): Promise<ModuleKey[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.disabled;
  const rows = await prisma.installationModule.findMany({
    select: { key: true, enabled: true },
  });
  const stored = new Map(rows.map((r) => [r.key, r.enabled]));
  // Kaldırılmış bir modülün satırı kalmışsa yok sayılır — hiçbir izni yok.
  // Satırı olmayan modül kendi varsayılanını alır (çoğu açık, `depo` kapalı).
  const disabled = MODULE_KEYS.filter(
    (k) => !(stored.get(k) ?? MODULES[k].defaultEnabled ?? true),
  );
  cache = { at: Date.now(), disabled };
  return disabled;
}

export async function isModuleEnabled(key: ModuleKey): Promise<boolean> {
  return !(await getDisabledModules()).includes(key);
}

/** Testler ve ayar değişikliği için: bir sonraki okuma veritabanına gider. */
export function invalidateModuleCache(): void {
  cache = null;
}

export interface ModuleView {
  key: ModuleKey;
  label: string;
  description: string;
  enabled: boolean;
  affectsPricing: boolean;
  /**
   * Modülde süren iş: kapatmak onu silmez ama ekranını kapatır. Ekran
   * kapatmadan önce bunu sayıyla söylüyor ("3 aktif kampanya").
   */
  openWork: { count: number; label: string } | null;
}

/** Modülün süren işi; olmayan modüller için null. */
async function openWorkOf(key: ModuleKey): Promise<ModuleView["openWork"]> {
  const now = new Date();
  switch (key) {
    case "kampanya": {
      const count = await prisma.promotion.count({
        where: {
          enabled: true,
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
      });
      return { count, label: "aktif kampanya" };
    }
    case "hacim":
      return {
        count: await prisma.volumeTier.count({ where: { isActive: true } }),
        label: "aktif basamak",
      };
    case "teslimat":
      return {
        count: await prisma.shipment.count({
          where: { courierId: { not: null }, deliveredAt: null },
        }),
        label: "kuryede bekleyen teslimat",
      };
    case "iade":
      return {
        count: await prisma.returnRequest.count({
          where: { status: { in: ["REQUESTED", "APPROVED"] } },
        }),
        label: "açık iade talebi",
      };
    case "cek":
      return {
        count: await prisma.cheque.count({
          where: { status: { in: ["PORTFOLIO", "DEPOSITED"] } },
        }),
        label: "portföyde ya da tahsilde kâğıt",
      };
    case "mutabakat":
      return {
        count: await prisma.reconciliation.count({ where: { status: "SENT" } }),
        label: "yanıt bekleyen mutabakat",
      };
    case "kart":
      return {
        count: await prisma.paymentIntent.count({
          where: { status: { in: ["PENDING", "AUTHORIZED"] } },
        }),
        label: "bekleyen kart tahsilatı",
      };
    case "erp":
      return {
        count: await prisma.erpAgent.count({ where: { isActive: true } }),
        label: "aktif ERP ajanı",
      };
    case "basvuru":
      return {
        count: await prisma.dealerApplication.count({ where: { status: "PENDING" } }),
        label: "karar bekleyen başvuru",
      };
    case "duyuru":
      return {
        count: await prisma.announcement.count({
          where: { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        }),
        label: "yayında olabilecek duyuru",
      };
    default:
      return null;
  }
}

export async function listModules(): Promise<ModuleView[]> {
  const disabled = new Set(await getDisabledModules());
  return Promise.all(
    MODULE_KEYS.map(async (key) => ({
      key,
      label: MODULES[key].label,
      description: MODULES[key].description,
      enabled: !disabled.has(key),
      affectsPricing: Boolean(MODULES[key].affectsPricing),
      openWork: await openWorkOf(key),
    })),
  );
}

/**
 * Modülü aç/kapat. Açık iş varsa **engellemiyor**: ekran onu zaten gösterdi
 * ve kapatan kişi bilerek kapatıyor. Veri silinmiyor; yeniden açmak her şeyi
 * geri getiriyor.
 */
export async function setModuleEnabled(
  key: ModuleKey,
  enabled: boolean,
  ctx?: AuditContext,
): Promise<ModuleView> {
  await prisma.installationModule.upsert({
    where: { key },
    create: { key, enabled, updatedById: ctx?.userId ?? null },
    update: { enabled, updatedById: ctx?.userId ?? null },
  });
  invalidateModuleCache();

  if (ctx) {
    await recordAudit({
      actor: auditActor(ctx),
      action: "MODULE_TOGGLED",
      entity: "InstallationModule",
      entityId: key,
      summary: `Modül ${enabled ? "açıldı" : "kapatıldı"}: ${MODULES[key].label}`,
      ip: ctx.meta?.ip,
      userAgent: ctx.meta?.userAgent,
      meta: { key, enabled },
    });
  }

  const view = (await listModules()).find((m) => m.key === key)!;
  return view;
}
