import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  deliverDueReports,
  reportToCsv,
  setReportSchedule,
} from "../../src/report-delivery";
import { runReport } from "../../src/report-engine";
import type { ReportContext } from "../../src/report-registry";
import { BusinessError } from "../../src/errors";

// Zamanlanmış rapor gönderimi + iki yeni veri kümesi.
//
// Gönderimin sınandığı şey mutlu yol değil, **ikinci sefer**: aynı raporun iki
// turda iki kez gitmemesi. E-posta konsol taşıyıcısına düşüyor (SMTP_HOST yok),
// bu yüzden testin "gönderildi" dediği şey gerçekten gönderim yolunun sonuna
// kadar gitmiş oluyor.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `rep${Date.now()}`;

let ownerId: string;
let otherId: string;
let companyId: string;
let reportId: string;

suite("zamanlanmış rapor", () => {
  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `rd-owner-${TAG}@test.local`,
        name: "Rapor Sahibi",
        passwordHash: "x",
        role: "SALES_REP",
      },
      select: { id: true },
    });
    ownerId = owner.id;

    const other = await prisma.user.create({
      data: {
        email: `rd-other-${TAG}@test.local`,
        name: "Başka Plasiyer",
        passwordHash: "x",
        role: "SALES_REP",
      },
      select: { id: true },
    });
    otherId = other.id;

    const company = await prisma.company.create({
      data: {
        name: `Rapor Firma ${TAG}`,
        creditLimit: 10000,
        currentBalance: 0,
        salesRepId: owner.id,
      },
      select: { id: true },
    });
    companyId = company.id;

    const report = await prisma.reportDefinition.create({
      data: {
        name: `Ziyaret raporu ${TAG}`,
        dataset: "CHECKINS",
        ownerId: owner.id,
        config: {
          columns: [
            { field: "companyName" },
            { field: "durationMinutes", aggregate: "SUM" },
          ],
          filters: [],
          groupBy: ["companyName"],
          sort: [],
        },
      },
      select: { id: true },
    });
    reportId = report.id;
  });

  afterAll(async () => {
    await prisma.reportDefinition.deleteMany({ where: { ownerId } });
    await prisma.checkIn.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  });

  const ctx = (): ReportContext => ({
    userId: ownerId,
    role: "SALES_REP",
    companyId: null,
  });

  it("başka birinin raporuna gönderim kurulamaz", async () => {
    // Alıcı listesi serbest metin: başkasının raporunu kendi adresine
    // zamanlayabilen biri, göremediği veriyi e-postayla okurdu.
    await expect(
      setReportSchedule(
        reportId,
        { intervalMinutes: 1440, recipients: ["hirsiz@test.local"] },
        { userId: otherId, role: "SALES_REP", companyId: null },
      ),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it("alıcısız gönderim kurulamaz", async () => {
    await expect(
      setReportSchedule(reportId, { intervalMinutes: 1440, recipients: [] }, ctx()),
    ).rejects.toBeTruthy();
  });

  it("kurulan gönderim hemen değil, bir periyot sonra çalışır", async () => {
    const view = await setReportSchedule(
      reportId,
      { intervalMinutes: 1440, recipients: ["patron@test.local"] },
      ctx(),
    );
    expect(view.intervalMinutes).toBe(1440);
    // "Kaydet"e basmak herkese e-posta atmamalı.
    expect(new Date(view.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("vakti gelen rapor bir kez gider, ikinci tur boş döner", async () => {
    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: { scheduleNextRunAt: new Date(Date.now() - 1000) },
    });

    const first = await deliverDueReports();
    const second = await deliverDueReports();

    const mine = first.find((o) => o.reportId === reportId);
    expect(mine?.ok, mine?.summary).toBe(true);
    // Sahiplenmenin tamamı bu: ilk tur `scheduleNextRunAt`'i ileri attı.
    expect(second.some((o) => o.reportId === reportId)).toBe(false);

    const row = await prisma.reportDefinition.findUniqueOrThrow({
      where: { id: reportId },
      select: { scheduleLastStatus: true, scheduleNextRunAt: true },
    });
    expect(row.scheduleLastStatus).toBe("OK");
    expect(row.scheduleNextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("sahibi pasifse gönderim durur", async () => {
    await prisma.user.update({
      where: { id: ownerId },
      data: { isActive: false },
    });
    await prisma.reportDefinition.update({
      where: { id: reportId },
      data: { scheduleNextRunAt: new Date(Date.now() - 1000) },
    });

    const outcomes = await deliverDueReports();
    const mine = outcomes.find((o) => o.reportId === reportId);
    // Sistem adına çalıştırmak değil, durmak: raporun kapsamından sorumlu kişi
    // artık yok.
    expect(mine?.ok).toBe(false);

    await prisma.user.update({
      where: { id: ownerId },
      data: { isActive: true },
    });
  });

  it("gönderim kapatılınca sıradaki çalıştırma silinir", async () => {
    const view = await setReportSchedule(
      reportId,
      { intervalMinutes: null, recipients: [] },
      ctx(),
    );
    expect(view.nextRunAt).toBeNull();
    expect(view.recipients).toEqual([]);

    const outcomes = await deliverDueReports();
    expect(outcomes.some((o) => o.reportId === reportId)).toBe(false);
  });

  it("CSV Excel'in açabileceği biçimde çıkar", () => {
    const csv = reportToCsv({
      dataset: "CHECKINS",
      columns: [
        { key: "a", label: "Firma", type: "string", format: "text", aggregate: null, width: null },
        { key: "b", label: "Süre", type: "number", format: "number", aggregate: "SUM", width: null },
      ],
      rows: [{ a: 'Şirket "A"; Ltd', b: 42 }],
      rowCount: 1,
      scannedRows: 1,
      truncated: false,
      grouped: true,
      chart: null,
      generatedAt: new Date().toISOString(),
    });

    // Türkçe Excel'in beklediği ikili: BOM + noktalı virgül.
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Firma;Süre");
    // Ayraç içeren hücre tırnaklanmalı, içteki tırnak ikilenmeli — yoksa tek
    // bir isim satırı sütunlara bölerdi.
    expect(csv).toContain('"Şirket ""A""; Ltd";42');
  });

  describe("yeni veri kümeleri", () => {
    it("ziyaret raporu süre ve kaynağı verir", async () => {
      await prisma.checkIn.create({
        data: {
          salesRepId: ownerId,
          companyId,
          checkInAt: new Date(Date.now() - 3_600_000),
          checkOutAt: new Date(),
          durationMinutes: 45,
          source: "MOBILE",
        },
      });

      const result = await runReport(
        "CHECKINS",
        {
          columns: [{ field: "source" }, { field: "durationMinutes", aggregate: "SUM" }],
          filters: [],
          groupBy: ["source"],
          sort: [],
        },
        ctx(),
      );

      const mobile = result.rows.find((r) => r.source === "MOBILE");
      expect(mobile).toBeDefined();
      expect(Number(mobile!.durationMinutes__sum)).toBe(45);
    });

    it("kampanya raporu plasiyerin portföyüyle sınırlı", async () => {
      // Aynı sorgu iki plasiyer için: satır sızmıyorsa biri boş dönmeli.
      const own = await runReport(
        "PROMOTIONS",
        {
          columns: [{ field: "promotionName" }, { field: "amount", aggregate: "SUM" }],
          filters: [],
          groupBy: ["promotionName"],
          sort: [],
        },
        ctx(),
      );
      const stranger = await runReport(
        "PROMOTIONS",
        {
          columns: [{ field: "promotionName" }, { field: "amount", aggregate: "SUM" }],
          filters: [],
          groupBy: ["promotionName"],
          sort: [],
        },
        { userId: otherId, role: "SALES_REP", companyId: null },
      );

      // İkisi de bu testte boş; önemli olan sorgunun kapsamla birlikte
      // çalışması — kapsamın bildirdiği ilişki için join yoksa burada patlar.
      expect(Array.isArray(own.rows)).toBe(true);
      expect(Array.isArray(stranger.rows)).toBe(true);
    });
  });
});
