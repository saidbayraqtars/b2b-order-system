import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  Download,
  XCircle,
} from "lucide-react";
import {
  readUpdateState,
  updateStatus,
  type UpdateStatus,
} from "@repo/services";
import { requirePage } from "@/lib/guard";
import {
  Badge,
  Card,
  DefRow,
  Note,
  PageHeader,
  type BadgeTone,
} from "@/components/ui";
import { Panel } from "@/components/form";

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

const STATUS_TEXT: Record<
  UpdateStatus,
  { label: string; tone: BadgeTone; detail: string }
> = {
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
  current: {
    label: "Güncel",
    tone: "success",
    detail: "Çalışan sürüm, kanalın yayımladığı sürüm.",
  },
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
    <main className="mx-auto max-w-3xl">
      <PageHeader
        title="Sürüm"
        subtitle="Bu kurulum hangi sürümde, merkez ne yayımladı, son güncelleme ne oldu"
      />

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={info.tone}>{info.label}</Badge>
              {state?.available?.mandatory && status !== "current" && (
                <Badge tone="danger">Zorunlu sürüm</Badge>
              )}
            </div>
            <p className="mt-2 text-body-sm text-ink-muted">{info.detail}</p>
          </div>
        </div>
      </Card>

      <Panel title="Bu kurulum" className="mb-4">
        <DefRow label="Çalışan sürüm">
          <code className="rounded bg-sunken px-1.5 py-0.5 font-mono">
            {running}
          </code>
        </DefRow>
        {state && (
          <>
            <DefRow label="Kanal">{state.channel}</DefRow>
            <DefRow label="Politika">
              {POLICY_TEXT[state.policy] ?? state.policy}
            </DefRow>
            <DefRow label="Son kontrol">{trDateTime(state.checkedAt)}</DefRow>
          </>
        )}
      </Panel>

      {state?.available && (
        <Panel title="Kanalda yayımlanan" className="mb-4">
          <DefRow label="Sürüm">
            <code className="rounded bg-sunken px-1.5 py-0.5 font-mono">
              {state.available.version}
            </code>
          </DefRow>
          <DefRow label="Yayım tarihi">
            {trDateTime(state.available.releasedAt)}
          </DefRow>
          {state.available.notes && (
            <p className="mt-3 text-body-sm text-ink-muted">
              {state.available.notes}
            </p>
          )}
        </Panel>
      )}

      {state?.lastRun && (
        <Panel title="Son güncelleme denemesi" className="mb-4">
          <DefRow label="Sonuç">
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
          </DefRow>
          <DefRow label="Nereden → nereye">
            {state.lastRun.fromVersion} → {state.lastRun.toVersion}
          </DefRow>
          <DefRow label="Başlangıç">
            {trDateTime(state.lastRun.startedAt)}
          </DefRow>
          <DefRow label="Bitiş">{trDateTime(state.lastRun.finishedAt)}</DefRow>
          {state.lastRun.message && (
            <p className="mt-3 text-body-sm text-ink-muted">
              {state.lastRun.message}
            </p>
          )}
        </Panel>
      )}

      <Note>
        Bu ekranda <strong>düğme yok</strong> ve olmaması bir karar:
        güncellemeyi host&apos;taki ajan çalıştırır, web bir kapsayıcının içinde
        ve orada ne
        <code> git</code> ne <code>docker</code> var. Erişebilsin diye docker
        soketi kapsayıcıya bağlansaydı, uygulamada bulunacak herhangi bir açık
        host&apos;ta root&apos;a çıkardı. Elle güncellemek için sunucuda{" "}
        <code>./scripts/agent.sh --now</code>, ajansız kurulumlarda{" "}
        <code>./scripts/update.sh</code>. Şema göçü geri alınamaz: her
        güncelleme önce yedek alır, yeni sürüm sağlıklı olmazsa uygulama eski
        sürüme döndürülür.
      </Note>
    </main>
  );
}
