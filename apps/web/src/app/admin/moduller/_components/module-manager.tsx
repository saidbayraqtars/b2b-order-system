"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ModuleView } from "@repo/services";
import { apiGet, apiPut } from "@/lib/fetcher";
import { Badge, LoadingState } from "@/components/ui";
import { Button, ErrorLine, WarnLine } from "@/components/form";

export function ModuleManager() {
  const qc = useQueryClient();
  const router = useRouter();
  const modules = useQuery({
    queryKey: ["admin", "modules"],
    queryFn: () => apiGet<{ modules: ModuleView[] }>("/api/admin/modules"),
  });

  const toggle = useMutation({
    mutationFn: (m: ModuleView) =>
      apiPut<{ module: ModuleView }>(`/api/admin/modules/${m.key}`, {
        enabled: !m.enabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "modules"] });
      // Menü sunucuda, izinlerden çiziliyor: kapanan modülün satırı ancak
      // sayfa yenilenince düşer.
      router.refresh();
    },
  });

  const ask = (m: ModuleView) => {
    if (!m.enabled) return true;
    const work =
      m.openWork && m.openWork.count > 0
        ? `\n\nSüren iş: ${m.openWork.count} ${m.openWork.label}. Silinmeyecek ama ekranı kapanacak.`
        : "";
    const pricing = m.affectsPricing
      ? "\n\nFiyat hesabı da değişir: kapalıyken uygulanmaz."
      : "";
    return confirm(`"${m.label}" kapatılsın mı?${work}${pricing}`);
  };

  if (modules.isLoading) return <LoadingState />;

  return (
    <div className="space-y-3">
      <ErrorLine error={modules.error ?? toggle.error} />
      {(modules.data?.modules ?? []).map((m) => (
        <div
          key={m.key}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-panel p-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{m.label}</span>
              <Badge tone={m.enabled ? "success" : "neutral"}>
                {m.enabled ? "Açık" : "Kapalı"}
              </Badge>
              {m.affectsPricing && <Badge tone="info">fiyatı etkiler</Badge>}
            </div>
            <p className="mt-1 text-body-sm text-ink-muted">{m.description}</p>
            {m.openWork && m.openWork.count > 0 && (
              <WarnLine className="mt-2">
                {m.openWork.count} {m.openWork.label}
                {m.enabled ? "" : " — modül kapalı, ekranı görünmüyor"}
              </WarnLine>
            )}
          </div>
          <Button
            size="sm"
            variant={m.enabled ? "secondary" : "primary"}
            disabled={toggle.isPending}
            onClick={() => {
              if (ask(m)) toggle.mutate(m);
            }}
          >
            {m.enabled ? "Kapat" : "Aç"}
          </Button>
        </div>
      ))}
    </div>
  );
}
