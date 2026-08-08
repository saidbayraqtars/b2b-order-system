import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@repo/database";
import {
  ensureJobSchedules,
  listJobRuns,
  listJobs,
  runJob,
  tick,
  triggerJob,
  updateJobSchedule,
} from "../../src/scheduler";
import { JOBS, type JobDefinition } from "../../src/job-registry";
import { recordPayment } from "../../src/payment";
import { BusinessError } from "../../src/errors";

// Zamanlayıcı ve tekrar anahtarı.
//
// İkisi de aynı soruyu farklı yerlerde soruyor: **aynı iş iki kez yapılırsa ne
// olur?** Zamanlayıcıda iki kopya aynı turu koşturabilir, tahsilatta ağ kopunca
// istemci aynı isteği yeniden gönderir. Testler tam olarak o ikinci seferi
// zorluyor — mutlu yolu değil.

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

const TAG = `job${Date.now()}`;

let companyId: string;
let repId: string;

suite("zamanlayıcı", () => {
  beforeAll(async () => {
    await ensureJobSchedules();

    const rep = await prisma.user.create({
      data: {
        email: `job-rep-${TAG}@test.local`,
        name: "Job Plasiyer",
        passwordHash: "x",
        role: "SALES_REP",
      },
      select: { id: true },
    });
    repId = rep.id;

    const company = await prisma.company.create({
      data: {
        name: `Job Firma ${TAG}`,
        creditLimit: 100000,
        currentBalance: 5000,
        salesRepId: rep.id,
      },
      select: { id: true },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: repId } });
    await prisma.jobRun.deleteMany({ where: { name: { startsWith: "test-" } } });

    // Tarifeler kayıt defterindeki hâline döndürülüyor. Testler periyot
    // kısaltıp iş kapatıyor ve bunlar operatör ayarı olarak kalıcı — takım
    // kendinden sonra geliştirme kurulumunu saatte bir çalışan bir işle
    // bırakmamalı.
    for (const job of JOBS) {
      await prisma.jobSchedule.updateMany({
        where: { name: job.name },
        data: {
          isEnabled: true,
          intervalMinutes: job.intervalMinutes,
          nextRunAt: new Date(Date.now() + job.intervalMinutes * 60_000),
        },
      });
    }
  });

  it("kayıt defterindeki her iş için satır açılır", async () => {
    const jobs = await listJobs();
    expect(jobs.map((j) => j.name).sort()).toEqual(
      JOBS.map((j) => j.name).sort(),
    );
    for (const j of jobs) {
      expect(j.intervalMinutes, j.name).toBeGreaterThanOrEqual(5);
    }
  });

  it("ensureJobSchedules ikinci çalıştırmada ayarı ezmez", async () => {
    // Kurulum betiği her açılışta çalışıyor. Operatörün kapattığı bir işi
    // yeniden açsaydı, "kapattım ama geri geliyor" diye bir hata olurdu.
    await updateJobSchedule(JOBS[0]!.name, {
      isEnabled: false,
      intervalMinutes: 120,
    });
    await ensureJobSchedules();

    const row = await prisma.jobSchedule.findUniqueOrThrow({
      where: { name: JOBS[0]!.name },
    });
    expect(row.isEnabled).toBe(false);
    expect(row.intervalMinutes).toBe(120);

    await updateJobSchedule(JOBS[0]!.name, { isEnabled: true });
  });

  it("periyot kısalınca sıradaki çalıştırma öne çekilir", async () => {
    await updateJobSchedule(JOBS[0]!.name, { intervalMinutes: 60 });
    const row = await prisma.jobSchedule.findUniqueOrThrow({
      where: { name: JOBS[0]!.name },
    });
    // "Saatte bir" dedikten sonra ilk çalıştırma yarın olmamalı.
    expect(row.nextRunAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 61 * 60_000,
    );
  });

  it("5 dakikadan kısa periyot reddedilir", async () => {
    await expect(
      updateJobSchedule(JOBS[0]!.name, { intervalMinutes: 1 }),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it("bilinmeyen iş tetiklenemez", async () => {
    await expect(triggerJob("yok-boyle-bir-is", repId)).rejects.toBeInstanceOf(
      BusinessError,
    );
  });

  it("patlayan iş zamanlayıcıyı düşürmez, ERROR olarak kaydedilir", async () => {
    const bomba: JobDefinition = {
      name: "test-bomba",
      label: "Patlayan iş",
      description: "test",
      intervalMinutes: 1440,
      run: async () => {
        throw new Error("bilerek patladı");
      },
    };

    // Fırlatmıyor: bir işin patlaması diğerlerini durdurmamalı.
    const outcome = await runJob(bomba);
    expect(outcome.status).toBe("ERROR");

    const runs = await listJobRuns(20);
    const mine = runs.find((r) => r.name === "test-bomba");
    expect(mine?.status).toBe("ERROR");
    expect(mine?.error).toContain("bilerek patladı");
    expect(mine?.finishedAt).not.toBeNull();
  });

  it("başarılı çalıştırma özeti hem koşuya hem tarifeye yazılır", async () => {
    const sayan: JobDefinition = {
      name: "test-sayan",
      label: "Sayan iş",
      description: "test",
      intervalMinutes: 1440,
      run: async () => ({ summary: "3 satır silindi", meta: { count: 3 } }),
    };

    await prisma.jobSchedule.create({
      data: {
        name: "test-sayan",
        intervalMinutes: 1440,
        nextRunAt: new Date(),
      },
    });

    const outcome = await runJob(sayan, repId);
    expect(outcome.status).toBe("OK");

    const schedule = await prisma.jobSchedule.findUniqueOrThrow({
      where: { name: "test-sayan" },
    });
    expect(schedule.lastStatus).toBe("OK");
    expect(schedule.lastSummary).toBe("3 satır silindi");

    const runs = await listJobRuns(20);
    const mine = runs.find((r) => r.name === "test-sayan");
    // Elle tetiklendiğinde tetikleyen yazılır; zamanlayıcı çalıştırdığında boş.
    expect(mine?.triggeredByName).toBe("Job Plasiyer");

    await prisma.jobSchedule.delete({ where: { name: "test-sayan" } });
  });

  it("tur, zamanı gelmemiş işi çalıştırmaz", async () => {
    // Hepsini geleceğe atıyoruz; tur hiçbir şey sahiplenmemeli.
    await prisma.jobSchedule.updateMany({
      data: { nextRunAt: new Date(Date.now() + 3_600_000) },
    });
    const outcomes = await tick();
    expect(outcomes).toEqual([]);
  });

  it("aynı işi iki tur peş peşe sahiplenemez", async () => {
    // Sahiplenmenin tamamı bu: ilk tur `nextRunAt`'i ileri atıyor, ikinci tur
    // sıfır satır güncelliyor ve hiç başlamıyor. İki kopya çalıştığında denetim
    // kaydının iki kez budanmasını engelleyen mekanizma.
    //
    // Tur **gerçekten** iş çalıştırıyor, bu yüzden yalnızca bir tanesi açık
    // bırakılıyor: kayıt defterindeki işlerin arasında dışarı ağ isteği atan
    // (TCMB) ve e-posta gönderen (zamanlanmış rapor) işler var; hepsini açık
    // bırakan bir test, sahiplenmeyi sınamak için üretim verisine dokunurdu.
    const [safe] = JOBS;
    await prisma.jobSchedule.updateMany({ data: { isEnabled: false } });
    await prisma.jobSchedule.updateMany({
      where: { name: safe!.name },
      data: { isEnabled: true, nextRunAt: new Date(Date.now() - 1000) },
    });

    const first = await tick();
    const second = await tick();

    expect(first.map((o) => o.name)).toEqual([safe!.name]);
    expect(second).toEqual([]);

    await prisma.jobSchedule.updateMany({ data: { isEnabled: true } });
  });
  // Aynı fixture'ı paylaşıyor: ayrı bir `describe` bloğu olsaydı yukarıdaki
  // `afterAll` firmayı silmiş olurdu ve buradaki testler firmasız kalırdı.
  describe("tahsilatta tekrar anahtarı", () => {
    it("aynı anahtarla ikinci istek yeni satır açmaz", async () => {
      const key = `idem-${TAG}-a`;
      const first = await recordPayment(
        {
          companyId,
          amount: 250,
          collectionMethod: "CASH",
          idempotencyKey: key,
        },
        repId,
      );
      const second = await recordPayment(
        {
          companyId,
          amount: 250,
          collectionMethod: "CASH",
          idempotencyKey: key,
        },
        repId,
      );

      // Aynı kayıt dönüyor — istemci açısından istek başarılı, çünkü gerçekten
      // başarılı oldu, sadece daha önce.
      expect(second.transactionId).toBe(first.transactionId);

      const rows = await prisma.transaction.count({
        where: { companyId, idempotencyKey: key },
      });
      expect(rows).toBe(1);
    });

    it("bakiye yalnızca bir kez düşer", async () => {
      const before = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { currentBalance: true },
      });

      const key = `idem-${TAG}-b`;
      for (let i = 0; i < 3; i += 1) {
        await recordPayment(
          {
            companyId,
            amount: 100,
            collectionMethod: "CASH",
            idempotencyKey: key,
          },
          repId,
        );
      }

      const after = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { currentBalance: true },
      });
      expect(before.currentBalance.minus(after.currentBalance).toFixed(2)).toBe(
        "100.00",
      );
    });

    it("anahtarsız iki istek iki ayrı tahsilattır", async () => {
      // Aynı tutarı iki kez tahsil etmek meşru: müşteri iki kez ödeme yapmış
      // olabilir. Tekrar koruması yalnızca anahtar verildiğinde devreye girer.
      const a = await recordPayment(
        { companyId, amount: 50, collectionMethod: "CASH" },
        repId,
      );
      const b = await recordPayment(
        { companyId, amount: 50, collectionMethod: "CASH" },
        repId,
      );
      expect(b.transactionId).not.toBe(a.transactionId);
    });

    it("başka firmanın anahtarı okunamaz", async () => {
      // Anahtar istemciden geliyor; tahmin edilebilir bir değer gönderen biri
      // başka bir firmanın tahsilat kaydını okuyabilirdi.
      const other = await prisma.company.create({
        data: { name: `Job Firma 2 ${TAG}`, creditLimit: 1000, currentBalance: 500 },
        select: { id: true },
      });

      const key = `idem-${TAG}-c`;
      await recordPayment(
        { companyId, amount: 10, collectionMethod: "CASH", idempotencyKey: key },
        repId,
      );

      // Aynı anahtar başka firma için: eşleşme kabul edilmiyor, yazma denenip
      // veritabanının tekillik kısıtına takılıyor.
      await expect(
        recordPayment(
          {
            companyId: other.id,
            amount: 10,
            collectionMethod: "CASH",
            idempotencyKey: key,
          },
          repId,
        ),
      ).rejects.toThrow();

      await prisma.company.delete({ where: { id: other.id } });
    });
  });
});
