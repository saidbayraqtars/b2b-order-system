"use client";

import { useQuery } from "@tanstack/react-query";
import {
  TARGET_METRIC_LABELS,
  TARGET_PERIOD_LABELS,
  type TargetMetric,
  type TargetPeriod,
} from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { Badge, Card, Meter } from "@/components/ui";

// Temsilcinin kendi hedef karnesi.
//
// Görmek için izin gerekmiyor — hedefi *koymak* izinli bir iş, hedefini bilmek
// işin kendisi. Hedef tanımlı değilse bölüm hiç çizilmiyor: boş bir "hedef yok"
// kutusu panelde yer kaplamaktan başka bir şey yapmaz.

interface ProgressRow {
  id: string;
  metric: TargetMetric;
  period: TargetPeriod;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  achieved: string;
  percent: number;
  elapsed: number;
}

function formatValue(metric: TargetMetric, value: string): string {
  return metric === "REVENUE"
    ? formatTRY(value)
    : `${Math.round(Number(value))} ziyaret`;
}

export function TargetScorecard({ salesRepId }: { salesRepId: string }) {
  const progress = useQuery({
    queryKey: ["my-targets", salesRepId],
    queryFn: () =>
      apiGet<{ progress: ProgressRow[] }>(
        `/api/sales-targets?progress=1&salesRepId=${salesRepId}`,
      ),
  });

  const rows = progress.data?.progress ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-headline-sm text-ink">Hedeflerim</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const elapsedPct = Math.round(r.elapsed * 100);
          const behind = r.percent + 5 < elapsedPct;
          return (
            <Card key={r.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-ink-faint">
                  {TARGET_PERIOD_LABELS[r.period]} ·{" "}
                  {TARGET_METRIC_LABELS[r.metric]}
                </p>
                <Badge
                  tone={
                    r.percent >= 100 ? "success" : behind ? "warning" : "info"
                  }
                >
                  %{r.percent}
                </Badge>
              </div>
              {/* Çubuğu kart kendi çiziyordu ve rengini kendi seçiyordu; ortak
                  `Meter` üç ekranın üç ayrı çubuğunu bu yüzden tekleştirmişti
                  (Adım 6) ama bu kart o turda gözden kaçmıştı. */}
              <Meter
                value={r.percent}
                tone={r.percent >= 100 ? "positive" : behind ? "caution" : "neutral"}
                label={`${TARGET_METRIC_LABELS[r.metric]} hedefi: %${r.percent}`}
              />
              <p className="mt-2 text-body-sm tabular-nums text-ink">
                {formatValue(r.metric, r.achieved)}{" "}
                <span className="text-ink-faint">
                  / {formatValue(r.metric, r.targetValue)}
                </span>
              </p>
              {/* Dönemin ne kadarı geçti: yüzde tek başına ayın 3'ü ile 28'ini
                  aynı gösterir. */}
              <p className="text-xs text-ink-faint">
                dönemin %{elapsedPct}&apos;i geçti
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
