import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@repo/database";
import { CHANNELS, broadcast } from "../../src/notification-channel";
import { notifyOrderStatusChanged } from "../../src/notification";

// Bildirim kanalları ve susturma.
//
// İki şey sınanıyor: kayıt defterinin **her açık kanala** göndermesi, ve
// susturmanın kişiyi **hem e-postadan hem telefondan** çıkarması.
//
// Posta katmanı yapılandırılmamış bir kurulumda günlüğe yazıyor (`sendMail`in
// kendi yedeği), o yüzden testler gerçek bir SMTP sunucusu istemiyor.
const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `ntf${Date.now()}`;

let companyId: string;
let adminId: string;
let mutedId: string;
let orderId: string;

suite("bildirim kanalları", () => {
  beforeAll(async () => {
    const company = await prisma.company.create({
      data: { name: `Bildirim ${TAG}`, email: `firma-${TAG}@test.local` },
    });
    companyId = company.id;

    const listening = await prisma.user.create({
      data: {
        email: `duyan-${TAG}@test.local`,
        name: "Duyan Yönetici",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
      },
    });
    adminId = listening.id;

    const muted = await prisma.user.create({
      data: {
        email: `susturan-${TAG}@test.local`,
        name: "Susturan Yönetici",
        passwordHash: "x",
        role: "COMPANY_ADMIN",
        companyId,
        mutedNotifications: ["ORDER_STATUS"],
      },
    });
    mutedId = muted.id;

    const order = await prisma.order.create({
      data: {
        orderNumber: `NTF-${TAG}`,
        status: "CONFIRMED",
        companyId,
        createdById: adminId,
        subtotal: 100,
        grandTotal: 120,
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, mutedId] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it("kayıt defteri e-posta ve push kanallarını taşıyor", () => {
    expect(CHANNELS.map((c) => c.key)).toEqual(["email", "push"]);
  });

  it("broadcast açık kanalların hepsine gidiyor ve fırlatmıyor", async () => {
    const results = await broadcast(
      { emails: [`biri-${TAG}@test.local`], userIds: [] },
      { subject: "Konu", text: "Gövde", short: "Kısa" },
    );
    expect(results.map((r) => r.channel).sort()).toEqual(["email", "push"]);
    // Kitlede kullanıcı yok: push denenmedi, atlandı olarak işaretlendi.
    expect(results.find((r) => r.channel === "push")?.skipped).toBe(true);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("`only` ile tek kanala gönderilebiliyor", async () => {
    const results = await broadcast(
      { emails: [`biri-${TAG}@test.local`], userIds: [] },
      { subject: "Konu", text: "Gövde", short: "Kısa" },
      { only: ["email"] },
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.channel).toBe("email");
  });

  it("susturan kişi hem e-posta hem push kitlesinden çıkıyor", async () => {
    await notifyOrderStatusChanged(orderId, "SHIPPED");

    const entry = await prisma.auditLog.findFirst({
      where: { entityId: orderId, entity: "Order" },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    });
    const meta = entry?.meta as { to?: string[]; userCount?: number } | null;

    expect(meta?.to).toContain(`duyan-${TAG}@test.local`);
    expect(meta?.to).not.toContain(`susturan-${TAG}@test.local`);
    // Firmanın genel kutusu bir hesaba ait değil: susturulamıyor, listede.
    expect(meta?.to).toContain(`firma-${TAG}@test.local`);
    // Duyan yönetici (siparişi giren) tek kullanıcı; susturan sayılmıyor.
    expect(meta?.userCount).toBe(1);
  });

  it("bir kanalın düşmesi duyuruyu başarısız yapmıyor", async () => {
    const push = CHANNELS.find((c) => c.key === "push")!;
    const spy = vi.spyOn(push, "send").mockRejectedValue(new Error("expo yok"));

    const results = await broadcast(
      { emails: [`biri-${TAG}@test.local`], userIds: ["yok"] },
      { subject: "Konu", text: "Gövde", short: "Kısa" },
    );
    expect(results.find((r) => r.channel === "push")?.ok).toBe(false);
    expect(results.find((r) => r.channel === "email")?.ok).toBe(true);

    spy.mockRestore();
  });
});
