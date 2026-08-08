import { prisma } from "@repo/database";
import { BusinessError } from "./errors";
import { JOBS, findJob, type JobDefinition } from "./job-registry";

// ─────────────────────────────────────────────
// ZAMANLAYICI
// ─────────────────────────────────────────────
//
// Uygulamanın içinde çalışıyor, ayrı bir cron kapsayıcısı değil: kurulum başına
// ikinci bir dağıtım birimi, tek müşterilik bir sistemde kazandırdığından fazla
// yük getiriyordu ([[b2b-deployment]] — her müşteri kendi sunucusunda).
//
// Bunun bedeli: iki kopya çalıştığında ikisi de aynı işi koşturmak isteyebilir.
// Bedeli ödeyen mekanizma **sahiplenme**: iş, `nextRunAt`'i ileri atan tek bir
// `UPDATE ... WHERE nextRunAt <= now()` ile alınıyor. Satırı güncelleyebilen
// kopya işi çalıştırıyor, diğeri sıfır satır güncelliyor ve hiç başlamıyor.
// "Önce bak, sonra çalıştır" yarışa açıktı ve denetim kaydını iki kez budardı.

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Kurulumda eksik iş satırlarını aç. Var olanların periyodu korunur. */
export async function ensureJobSchedules(): Promise<void> {
  for (const job of JOBS) {
    await prisma.jobSchedule.upsert({
      where: { name: job.name },
      // Periyot ve açık/kapalı durumu operatörün kararı; kod her açılışta
      // üzerine yazsaydı, kapatılan bir iş yeniden başlardı.
      update: {},
      create: {
        name: job.name,
        intervalMinutes: job.intervalMinutes,
        // İlk çalıştırma hemen değil: açılış anı zaten en yoğun an ve dört iş
        // birden başlamanın acelesi yok.
        nextRunAt: new Date(Date.now() + 5 * 60_000),
      },
    });
  }
}

/**
 * Zamanı gelmiş bir işi sahiplen.
 *
 * `updateMany` sayısı sahiplenmenin kendisi: 1 ise iş bizim, 0 ise başka bir
 * kopya (ya da aynı süreçte önceki tick) almış.
 */
async function claim(job: JobDefinition): Promise<boolean> {
  const now = new Date();
  const schedule = await prisma.jobSchedule.findUnique({
    where: { name: job.name },
    select: { intervalMinutes: true },
  });
  const interval = schedule?.intervalMinutes ?? job.intervalMinutes;

  const { count } = await prisma.jobSchedule.updateMany({
    where: { name: job.name, isEnabled: true, nextRunAt: { lte: now } },
    data: { nextRunAt: new Date(now.getTime() + interval * 60_000) },
  });
  return count === 1;
}

export interface RunOutcome {
  name: string;
  status: "OK" | "ERROR";
  summary: string;
}

/**
 * İşi çalıştır ve sonucunu kaydet.
 *
 * Hata **yutulmuyor ama yayılmıyor da**: bir işin patlaması diğerlerini ya da
 * zamanlayıcıyı durdurmamalı. Kaydı `JobRun`'a yazılıyor, satır ekranda
 * kırmızı duruyor.
 */
export async function runJob(
  job: JobDefinition,
  triggeredById?: string,
): Promise<RunOutcome> {
  const run = await prisma.jobRun.create({
    data: {
      name: job.name,
      status: "RUNNING",
      ...(triggeredById ? { triggeredBy: { connect: { id: triggeredById } } } : {}),
    },
    select: { id: true },
  });

  try {
    const result = await job.run();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "OK", summary: result.summary, finishedAt: new Date() },
    });
    await prisma.jobSchedule.updateMany({
      where: { name: job.name },
      data: { lastRunAt: new Date(), lastStatus: "OK", lastSummary: result.summary },
    });
    return { name: job.name, status: "OK", summary: result.summary };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "ERROR", error: message.slice(0, 500), finishedAt: new Date() },
    });
    await prisma.jobSchedule.updateMany({
      where: { name: job.name },
      data: { lastRunAt: new Date(), lastStatus: "ERROR", lastSummary: message.slice(0, 300) },
    });
    return { name: job.name, status: "ERROR", summary: message };
  }
}

/** Bir tur: zamanı gelmiş işleri sahiplen ve çalıştır. */
export async function tick(): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  for (const job of JOBS) {
    if (!(await claim(job))) continue;
    outcomes.push(await runJob(job));
  }
  return outcomes;
}

/**
 * Zamanlayıcıyı başlat. Süreç başına bir kez.
 *
 * `unref()` şart: aksi hâlde zamanlayıcı olay döngüsünü açık tutuyor ve süreç
 * kapanma emrini aldığında beklemeye devam ediyor — kapsayıcı yeniden
 * başlatmalarında on saniyelik takılmaların sebebi tam olarak budur.
 */
export function startScheduler(): void {
  if (timer) return;

  void ensureJobSchedules().catch((e) => {
    console.error("[scheduler] iş tanımları yazılamadı:", e);
  });

  timer = setInterval(() => {
    if (running) return; // önceki tur bitmediyse üstüne binme
    running = true;
    void tick()
      .catch((e) => console.error("[scheduler] tur hatası:", e))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  timer.unref();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// ─────────────────────────────────────────────
// YÖNETİM
// ─────────────────────────────────────────────

export interface JobStatusRow {
  name: string;
  label: string;
  description: string;
  intervalMinutes: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSummary: string | null;
  isEnabled: boolean;
}

export async function listJobs(): Promise<JobStatusRow[]> {
  const schedules = await prisma.jobSchedule.findMany();
  const byName = new Map(schedules.map((s) => [s.name, s]));

  return JOBS.map((job) => {
    const s = byName.get(job.name);
    return {
      name: job.name,
      label: job.label,
      description: job.description,
      intervalMinutes: s?.intervalMinutes ?? job.intervalMinutes,
      nextRunAt: s?.nextRunAt ? s.nextRunAt.toISOString() : null,
      lastRunAt: s?.lastRunAt ? s.lastRunAt.toISOString() : null,
      lastStatus: s?.lastStatus ?? null,
      lastSummary: s?.lastSummary ?? null,
      isEnabled: s?.isEnabled ?? true,
    };
  });
}

export interface JobRunRow {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  summary: string | null;
  error: string | null;
  triggeredByName: string | null;
}

export async function listJobRuns(limit = 50): Promise<JobRunRow[]> {
  const rows = await prisma.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true,
      name: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      summary: true,
      error: true,
      triggeredBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    status: r.status,
    summary: r.summary,
    error: r.error,
    triggeredByName: r.triggeredBy?.name ?? null,
  }));
}

/** Elle tetikleme — operatör beklemek istemediğinde. */
export async function triggerJob(
  name: string,
  triggeredById: string,
): Promise<RunOutcome> {
  const job = findJob(name);
  if (!job) throw new BusinessError("JOB_NOT_FOUND", "Böyle bir iş yok", { name });
  return runJob(job, triggeredById);
}

/** İşi aç/kapat ya da periyodunu değiştir. */
export async function updateJobSchedule(
  name: string,
  input: { isEnabled?: boolean; intervalMinutes?: number },
): Promise<void> {
  if (!findJob(name)) {
    throw new BusinessError("JOB_NOT_FOUND", "Böyle bir iş yok", { name });
  }
  if (input.intervalMinutes !== undefined && input.intervalMinutes < 5) {
    throw new BusinessError(
      "INVALID_JOB_INTERVAL",
      "Periyot en az 5 dakika olmalı",
    );
  }
  await prisma.jobSchedule.update({
    where: { name },
    data: {
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      ...(input.intervalMinutes !== undefined
        ? {
            intervalMinutes: input.intervalMinutes,
            // Periyot kısalınca bir sonraki çalıştırma da öne çekilmeli; aksi
            // hâlde "saatte bir" dedikten sonra ilk çalıştırma yarın olurdu.
            nextRunAt: new Date(Date.now() + input.intervalMinutes * 60_000),
          }
        : {}),
    },
  });
}
