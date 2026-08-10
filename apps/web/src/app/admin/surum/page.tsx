import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Download, XCircle } from "lucide-react";
import { readUpdateState, updateStatus, type UpdateStatus } from "@repo/services";
import { requirePage } from "@/lib/guard";
import { Badge, Card, PageHeader, type BadgeTone } from "@/components/ui";

/**
 * Sürüm ekranı — bu kurulum hangi sürümde, merkez ne yayımladı, ajan ne yaptı.
 *
 * Ekran **salt okunur ve bilerek öyle**. Güncellemeyi host'taki ajan çalıştırır;
 * web bir kapsayıcının içinde ve orada `git` de `docker` da yok. Erişebilsin
 * diye docker soketi kapsayıcıya bağlansaydı, uygulamada bulunacak herhangi bir
 * açık host'ta root'a çıkardı. Bir "Güncelle" düğmesinin bedeli bu; düğme yok.
 */

export const dynamic = "force-dynamic";

const TIMEZONE = process.env.REPORT_TIMEZONE || "Europe/Istanbul";

function trDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIMEZONE,
  }).format(d);
}

const STATUS_TEXT: Record<UpdateStatus, { label: string; tone: BadgeTone; detail: string }> = {
  disabled: {
    label: "Ajan kurulu değil",
    tone: "neutral",
    detail:
      "Bu kurulum merkezdeki sürüm akışına bakmıyor. Güncelleme sunucuda elle yapılır: scripts/update.sh",
  },
  unknown: {
    label: "Henüz bakılmadı",
    tone: "neutral",
    detail:
      "Ajan tanımlı ama daha bir kez bile çalışmamış ya da durum dosyası okunamıyor. Zamanlayıcıyı kontrol edin: systemctl list-timers b2b-update.timer",
  },
  stale: {
    label: "Ajan susuyor",
    tone: "warning",
    detail:
      "Ajan bir günden uzun süredir akışa bakmadı. Aşağıdaki bilgiler o günden kalma — bugünün durumu değil.",
  },
  error: {
    label: "Akışa ulaşılamıyor",
    tone: "warning",
    detail:
      "Ajan çalışıyor ama sürüm akışını indiremedi. Yeni sürüm çıkmış olabilir ve bu kurulum haberi almıyor.",
  },
  current: { label: "Güncel", tone: "success", detail: "Çalışan sürüm, kanalın yayımladığı sürüm." },
  available: {
    label: "Güncelleme var",
    tone: "info",
    detail: "Kanalda yeni bir sürüm yayımlanmış.",
  },
  failed: {
    label: "Son güncelleme düştü",
    tone: "danger",
    detail:
      "Ajan güncellemeyi denedi ve tamamlayamadı. Kurulum eski sürümde çalışmaya devam ediyor; sebebi sunucudaki var/update-agent.log içinde.",
  },
};

const STATUS_ICON: Record<UpdateStatus, typeof CheckCircle2> = {
  disabled: CircleSlash,
  unknown: Clock,
  stale: Clock,
  error: AlertTriangle,
  current: CheckCircle2,
  available: Download,
  failed: XCircle,
};

const POLICY_TEXT: Record<string, string> = {
  off: "Kapalı — akışa bakılmıyor",
  notify: "Yalnızca bildir — güncellemeyi operatör başlatır",
  auto: "Otomatik — bakım penceresinde kendisi günceller",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 py-2 last:border-0 dark:border-neutral-800">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{children}</span>
    </div>
  );
}

export default async function VersionPage() {
  await requirePage(["SUPER_ADMIN"], "system.update");

  const state = await readUpdateState();
  const status = updateStatus(state);
  const info = STATUS_TEXT[status];
  const Icon = STATUS_ICON[status];

  // Çalışan sürüm sürecin kendisinden okunuyor, durum dosyasından değil: ajan
  // ne yazmış olursa olsun, bu sayfayı üreten kopya bu sürüm.
  const running = process.env.APP_VERSION || "unknown";

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <PageHeader
        title="Sürüm"
        subtitle="Bu kurulum hangi sürümde, merkez ne yayımladı, son güncelleme ne oldu"
      />

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={info.tone}>{info.label}</Badge>
              {state?.available?.mandatory && status !== "current" && (
                <Badge tone="danger">Zorunlu sürüm</Badge>
              )}
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{info.detail}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Bu kurulum
        </h2>
        <Row label="Çalışan sürüm">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{running}</code>
        </Row>
        {state && (
          <>
            <Row label="Kanal">{state.channel}</Row>
            <Row label="Politika">{POLICY_TEXT[state.policy] ?? state.policy}</Row>
            <Row label="Son kontrol">{trDateTime(state.checkedAt)}</Row>
          </>
        )}
      </Card>

      {state?.available && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Kanalda yayımlanan
          </h2>
          <Row label="Sürüm">
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
              {state.available.version}
            </code>
          </Row>
          <Row label="Yayım tarihi">{trDateTime(state.available.releasedAt)}</Row>
          {state.available.notes && (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
              {state.available.notes}
            </p>
          )}
        </Card>
      )}

      {state?.lastRun && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Son güncelleme denemesi
          </h2>
          <Row label="Sonuç">
            <Badge
              tone={
                state.lastRun.result === "success"
                  ? "success"
                  : state.lastRun.result === "running"
                    ? "info"
                    : "danger"
              }
            >
              {state.lastRun.result === "success"
                ? "Başarılı"
                : state.lastRun.result === "running"
                  ? "Yarıda kalmış"
                  : "Düştü"}
            </Badge>
          </Row>
          <Row label="Nereden → nereye">
            {state.lastRun.fromVersion} → {state.lastRun.toVersion}
          </Row>
          <Row label="Başlangıç">{trDateTime(state.lastRun.startedAt)}</Row>
          <Row label="Bitiş">{trDateTime(state.lastRun.finishedAt)}</Row>
          {state.lastRun.message && (
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
              {state.lastRun.message}
            </p>
          )}
        </Card>
      )}

      <p className="text-xs leading-relaxed text-neutral-500">
        Güncelleme sunucudaki ajan tarafından uygulanır; bu ekran yalnızca gösterir. Elle
        güncellemek için sunucuda <code>./scripts/agent.sh --now</code>, ajansız kurulumlarda{" "}
        <code>./scripts/update.sh</code>. Şema göçü geri alınamaz: her güncelleme önce yedek alır,
        yeni sürüm sağlıklı olmazsa uygulama eski sürüme döndürülür.
      </p>
    </main>
  );
}
