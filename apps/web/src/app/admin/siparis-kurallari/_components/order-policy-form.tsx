"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderPolicy } from "@repo/services";
import { apiGet, apiPut } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { LoadingState } from "@/components/ui";
import { useToast } from "@/components/toast";

// Kurulumun sipariş kabul kuralları — tek satırlık ayar, tek form.
//
// İki kutu iki ayrı soruyu cevaplıyor ve ayrı panellerde duruyorlar: asgari
// siparişin **geçip geçmeyeceğini**, kesim saati geçtiğinde **ne zaman
// çıkacağını** söylüyor. Tek panelde alt alta dursalardı ikisi tek bir kural
// gibi okunurdu.

interface Draft {
  minOrderAmount: string;
  minOrderCases: string;
  cutoffHour: string;
  shipsOnSaturday: boolean;
}

function toDraft(p: OrderPolicy): Draft {
  return {
    minOrderAmount: p.minOrderAmount,
    minOrderCases: String(p.minOrderCases),
    // Boş dize = kesim saati yok. `Select`in "yok" seçeneği bu.
    cutoffHour: p.cutoffHour === null ? "" : String(p.cutoffHour),
    shipsOnSaturday: p.shipsOnSaturday,
  };
}

export function OrderPolicyForm() {
  const qc = useQueryClient();
  const { notify } = useToast();

  const query = useQuery({
    queryKey: ["admin-order-policy"],
    queryFn: () => apiGet<{ policy: OrderPolicy }>("/api/admin/order-policy"),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  // Sunucudan gelen değer forma bir kez yansıyor; sonrası kullanıcının.
  useEffect(() => {
    if (query.data) setDraft(toDraft(query.data.policy));
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      apiPut("/api/admin/order-policy", {
        minOrderAmount: Number(draft?.minOrderAmount ?? 0),
        minOrderCases: Number(draft?.minOrderCases ?? 0),
        cutoffHour: draft?.cutoffHour === "" ? null : Number(draft?.cutoffHour),
        shipsOnSaturday: draft?.shipsOnSaturday ?? false,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-order-policy"] });
      notify("Sipariş kuralları kaydedildi");
    },
  });

  if (query.isLoading || !draft) {
    return (
      <Panel title="Asgari sipariş">
        <LoadingState />
      </Panel>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const amount = Number(draft.minOrderAmount);
  const cases = Number(draft.minOrderCases);

  return (
    <div className="flex flex-col gap-5">
      <ErrorLine error={query.error} />

      <Panel title="Asgari sipariş">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="min-amount" hint="net mal bedeli, ₺">
              Tutar
            </Label>
            <TextInput
              id="min-amount"
              type="number"
              min={0}
              step="0.01"
              value={draft.minOrderAmount}
              onChange={(e) => set({ minOrderAmount: e.target.value })}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="min-cases" hint="koli">
              Adet
            </Label>
            <TextInput
              id="min-cases"
              type="number"
              min={0}
              step="1"
              value={draft.minOrderCases}
              onChange={(e) => set({ minOrderCases: e.target.value })}
              className="w-32"
            />
          </div>
        </div>

        {/* Kuralın okunuşu, ayarın altında: iki alanın birlikte ne anlama
            geldiğini rakamla söylemek, iki sayıya bakıp çıkarmaktan kolay. */}
        <p className="mt-3 text-body-sm text-ink-muted">
          {amount <= 0 && cases <= 0
            ? "Asgari yok — her büyüklükte sipariş kabul ediliyor."
            : amount > 0 && cases > 0
              ? `Bayi en az ${formatTRY(draft.minOrderAmount)} ve ${cases} koli sipariş vermeden sepeti kapatamıyor — ikisi de gerekiyor.`
              : amount > 0
                ? `Bayi en az ${formatTRY(draft.minOrderAmount)} sipariş vermeden sepeti kapatamıyor.`
                : `Bayi en az ${cases} koli sipariş vermeden sepeti kapatamıyor.`}
        </p>
      </Panel>

      <Panel title="Sevkiyat kesim saati">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="cutoff">Kesim saati</Label>
            <Select
              id="cutoff"
              value={draft.cutoffHour}
              onChange={(e) => set({ cutoffHour: e.target.value })}
              className="w-40"
            >
              <option value="">Kesim yok</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </div>
          <div className="pb-2.5">
            <Checkbox
              checked={draft.shipsOnSaturday}
              onChange={(e) => set({ shipsOnSaturday: e.target.checked })}
              label="Cumartesi sevkiyat var"
            />
          </div>
        </div>

        <p className="mt-3 text-body-sm text-ink-muted">
          {draft.cutoffHour === ""
            ? "Sepette sevkiyat günü yazmıyor."
            : `Sepette yazacak: "${String(Number(draft.cutoffHour)).padStart(2, "0")}:00'a kadar verilen siparişler bugün çıkar." Sonrasında ilk ${draft.shipsOnSaturday ? "iş günü (cumartesi dahil)" : "iş günü"}.`}
        </p>
      </Panel>

      <div className="flex items-center gap-3">
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Kaydet
        </Button>
        {query.data?.policy.updatedAt && (
          <span className="text-xs text-ink-faint">
            Son değişiklik:{" "}
            {new Date(query.data.policy.updatedAt).toLocaleString("tr-TR")}
          </span>
        )}
      </div>
      <ErrorLine error={save.error} />
    </div>
  );
}
