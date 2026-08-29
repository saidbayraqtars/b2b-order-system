"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, ChartPie, LineChart, Table2 } from "lucide-react";
import { REPORT_DATASET_LABELS, type ReportDataset } from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine } from "@/components/form";
import {
  Badge,
  Card,
  Chips,
  EmptyState,
  LoadingState,
  Note,
} from "@/components/ui";

// Şablon galerisi.
//
// Süzgeç **adreste** (`?kategori=`), panonun sekmesiyle aynı kural ve aynı
// sebep: fotoğraflanamayan ekranın doğru göründüğü söylenemez, ve betik
// düğmelere basmıyor.
//
// Kurulum bittiğinde ekran **yeni rapora gidiyor**. Galeride kalıp "kuruldu"
// yazmak, kullanıcıyı raporu aramaya bırakırdı; asıl istenen şey raporun
// kendisi, kurulum onun yolu.

interface TemplateCard {
  key: string;
  name: string;
  description: string;
  category: string;
  dataset: ReportDataset;
  question: string;
  columnCount: number;
  chart: "table" | "bar" | "line" | "pie";
}

const CHART_ICON = {
  table: Table2,
  bar: BarChart3,
  line: LineChart,
  pie: ChartPie,
} as const;

const ALL = "hepsi";

export function TemplateGallery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const query = useQuery({
    queryKey: ["report-templates"],
    queryFn: () => apiGet<{ templates: TemplateCard[] }>("/api/reports/templates"),
  });

  const install = useMutation({
    mutationFn: (key: string) =>
      apiPost<{ id: string; name: string }>("/api/reports/templates", { key }),
    onSuccess: (created) => router.push(`/reports/${created.id}`),
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorLine error={query.error} />;

  const templates = query.data!.templates;
  const categories = [...new Set(templates.map((t) => t.category))];
  const raw = params.get("kategori");
  const active = raw && categories.includes(raw) ? raw : ALL;
  const shown = active === ALL ? templates : templates.filter((t) => t.category === active);

  function go(category: string) {
    const q = new URLSearchParams(params.toString());
    if (category === ALL) q.delete("kategori");
    else q.set("kategori", category);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <Chips
        value={active}
        onChange={go}
        items={[
          { key: ALL, label: `Hepsi (${templates.length})` },
          ...categories.map((c) => ({ key: c, label: c })),
        ]}
      />

      {install.isError && <ErrorLine error={install.error} />}

      {shown.length === 0 ? (
        <EmptyState label="Bu kategoride şablon yok" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((t) => {
            const Icon = CHART_ICON[t.chart];
            return (
              <Card key={t.key}>
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-body font-medium text-ink">{t.name}</h3>
                      <p className="mt-0.5 text-body-sm text-ink-muted">
                        {t.description}
                      </p>
                    </div>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  </div>

                  {/* Kartın en yararlı satırı: rapor adı ne olduğunu değil,
                      soru neyi cevapladığını söylüyor. */}
                  <p className="text-body-sm italic text-ink-faint">
                    “{t.question}”
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                    <span className="flex items-center gap-2 text-xs text-ink-faint">
                      <Badge>{REPORT_DATASET_LABELS[t.dataset]}</Badge>
                      {t.columnCount} sütun
                    </span>
                    <Button
                      size="sm"
                      onClick={() => install.mutate(t.key)}
                      loading={install.isPending && install.variables === t.key}
                      disabled={install.isPending}
                    >
                      Kur
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Note>
        Kurulan rapor <strong>sizin</strong> raporunuz olur: şablonla bağı
        kalmaz, sütununu, süzgecini ve grafiğini değiştirebilirsiniz. Satır
        kapsamı da sizin — plasiyerin kurduğu bir bakiye raporu kendi
        portföyünü gösterir, tümünü değil.
      </Note>
    </div>
  );
}
