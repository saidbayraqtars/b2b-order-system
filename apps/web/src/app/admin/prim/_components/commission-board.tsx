"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CommissionAccrual,
  CommissionPlanRow,
  UserRow,
} from "@repo/services";
import {
  COMMISSION_BASE_LABELS,
  CommissionBaseEnum,
  TargetPeriodEnum,
  type CommissionBase,
  type TargetPeriod,
} from "@repo/types";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import {
  Badge,
  LoadingState,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { useToast } from "@/components/toast";

// Prim planları ve hakediş.
//
// Ekran iki şeyi yan yana gösteriyor: **planlar** (ne söz verildi) ve
// **hakediş** (bu dönemde ne hak edildi). Ayrı sayfalara koymak, oranı
// değiştiren kişinin sonucunu göremediği bir düzen olurdu.

const PERIOD_LABELS: Record<TargetPeriod, string> = {
  DAILY: "Günlük",
  WEEKLY: "Haftalık",
  MONTHLY: "Aylık",
  YEARLY: "Yıllık",
};

/** Süzgeç varsayılanı — boş = içinde bulunulan ay. */
const FILTER_DEFAULTS = { ay: "" };

interface Draft {
  id?: string;
  name: string;
  base: CommissionBase;
  rate: string;
  period: TargetPeriod;
  targetMultiplier: string;
  minBase: string;
  isActive: boolean;
  repIds: string[];
}

const EMPTY: Draft = {
  name: "",
  base: "REVENUE",
  rate: "",
  period: "MONTHLY",
  targetMultiplier: "1",
  minBase: "0",
  isActive: true,
  repIds: [],
};

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CommissionBoard() {
  const qc = useQueryClient();
  const { notify } = useToast();
  const filters = useUrlState(FILTER_DEFAULTS);
  const month = filters.value.ay || thisMonth();

  const [draft, setDraft] = useState<Draft | null>(null);

  const query = useQuery({
    queryKey: ["commission", month],
    queryFn: () =>
      apiGet<{ plans: CommissionPlanRow[]; accrual: CommissionAccrual }>(
        `/api/admin/commission?ay=${month}`,
      ),
  });

  // Plasiyer listesi plan formunda gerekiyor; ayrı sorgu çünkü plan
  // düzenlenmediği sürece hiç indirilmesin.
  const reps = useQuery({
    queryKey: ["admin-users", "reps"],
    queryFn: () => apiGet<{ users: UserRow[] }>("/api/admin/users"),
    enabled: draft !== null,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["commission"] });

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/commission", {
        ...draft,
        rate: Number(draft?.rate ?? 0),
        targetMultiplier: Number(draft?.targetMultiplier || 1),
        minBase: Number(draft?.minBase || 0),
      }),
    onSuccess: () => {
      setDraft(null);
      invalidate();
      notify("Prim planı kaydedildi");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/commission/${id}`),
    onSuccess: () => {
      invalidate();
      notify("Plan silindi");
    },
  });

  const plans = query.data?.plans ?? [];
  const accrual = query.data?.accrual;
  const repOptions = (reps.data?.users ?? []).filter(
    (u) => u.role === "SALES_REP",
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3 rounded border border-line bg-sunken p-3">
        <div>
          <Label htmlFor="prim-ay">Dönem</Label>
          <TextInput
            id="prim-ay"
            type="month"
            value={month}
            onChange={(e) => filters.set({ ay: e.target.value })}
            className="w-44"
          />
        </div>
        <p className="pb-2.5 text-body-sm text-ink-muted">
          Hakediş <strong>her okumada yeniden hesaplanıyor</strong>: dönem
          kapandıktan sonra girilen bir tahsilat da o döneme yazılır.
        </p>
      </div>

      {accrual && (
        <section className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Dönem hakedişi"
            value={formatTRY(Number(accrual.total))}
            hint="tüm planların toplamı"
          />
          <StatTile
            label="Prim alan"
            value={accrual.rows.filter((r) => Number(r.amount) > 0).length}
            hint="plasiyer × plan"
          />
          <StatTile
            label="Aktif plan"
            value={plans.filter((p) => p.isActive).length}
            hint={`${plans.length} tanımlı`}
          />
        </section>
      )}

      <Panel
        title="Hakediş"
        bodyClassName="p-0"
      >
        {query.isLoading && (
          <div className="px-4">
            <LoadingState />
          </div>
        )}
        <div className="px-4">
          <ErrorLine error={query.error} />
        </div>
        <Table stickyHead>
          <THead>
            <tr>
              <Th>Plasiyer</Th>
              <Th>Plan</Th>
              <Th>Taban</Th>
              <Th align="right">Tutar</Th>
              <Th align="right">Hedef</Th>
              <Th align="right">Oran</Th>
              <Th align="right">Prim</Th>
            </tr>
          </THead>
          <TBody>
            {(accrual?.rows.length ?? 0) === 0 && query.isSuccess && (
              <TableEmpty
                colSpan={7}
                label="Bu dönemde hakediş yok — plan tanımlayıp plasiyer atayın."
              />
            )}
            {accrual?.rows.map((r) => (
              <tr key={`${r.planId}-${r.repId}`}>
                <Td className="font-medium text-ink">{r.repName}</Td>
                <Td muted>{r.planName}</Td>
                <Td muted>{COMMISSION_BASE_LABELS[r.base]}</Td>
                <Td align="right" numeric muted>
                  {formatTRY(Number(r.baseAmount))}
                </Td>
                <Td align="right" numeric muted>
                  {r.target === null ? "—" : formatTRY(Number(r.target))}
                </Td>
                <Td align="right" numeric>
                  <span className="flex items-center justify-end gap-2">
                    %{r.effectiveRate}
                    {/* Çarpan uygulandıysa bunu söylemek gerekiyor: aynı
                        planın iki satırında farklı oran görmek, sebebi
                        yazılmazsa hata gibi okunur. */}
                    {r.targetMet && <Badge tone="success">hedef</Badge>}
                  </span>
                </Td>
                <Td align="right" numeric className="font-medium text-ink">
                  {r.belowMinimum ? (
                    <span className="text-xs text-ink-faint">eşik altı</span>
                  ) : (
                    formatTRY(Number(r.amount))
                  )}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Panel>

      <Panel
        title="Prim planları"
        bodyClassName="p-0"
        action={
          !draft && (
            <Button size="sm" onClick={() => setDraft(EMPTY)}>
              Yeni plan
            </Button>
          )
        }
      >
        {draft && (
          <div className="border-b border-line bg-sunken p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="plan-name">Plan adı</Label>
                <TextInput
                  id="plan-name"
                  value={draft.name}
                  placeholder="Ciro primi"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-52"
                />
              </div>
              <div>
                <Label htmlFor="plan-base">Taban</Label>
                <Select
                  id="plan-base"
                  value={draft.base}
                  onChange={(e) =>
                    setDraft({ ...draft, base: e.target.value as CommissionBase })
                  }
                  className="w-40"
                >
                  {CommissionBaseEnum.options.map((b) => (
                    <option key={b} value={b}>
                      {COMMISSION_BASE_LABELS[b]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="plan-rate" hint="%">
                  Oran
                </Label>
                <TextInput
                  id="plan-rate"
                  type="number"
                  min={0.01}
                  max={100}
                  step="0.01"
                  value={draft.rate}
                  onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                  className="w-28"
                />
              </div>
              <div>
                <Label htmlFor="plan-period">Dönem</Label>
                <Select
                  id="plan-period"
                  value={draft.period}
                  onChange={(e) =>
                    setDraft({ ...draft, period: e.target.value as TargetPeriod })
                  }
                  className="w-36"
                >
                  {TargetPeriodEnum.options.map((p) => (
                    <option key={p} value={p}>
                      {PERIOD_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="plan-mult" hint="hedef tutunca">
                  Çarpan
                </Label>
                <TextInput
                  id="plan-mult"
                  type="number"
                  min={1}
                  step="0.05"
                  value={draft.targetMultiplier}
                  onChange={(e) =>
                    setDraft({ ...draft, targetMultiplier: e.target.value })
                  }
                  className="w-28"
                />
              </div>
              <div>
                <Label htmlFor="plan-min" hint="₺">
                  Eşik
                </Label>
                <TextInput
                  id="plan-min"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.minBase}
                  onChange={(e) => setDraft({ ...draft, minBase: e.target.value })}
                  className="w-32"
                />
              </div>
              <div className="pb-2.5">
                <Checkbox
                  checked={draft.isActive}
                  onChange={(e) =>
                    setDraft({ ...draft, isActive: e.target.checked })
                  }
                  label="Aktif"
                />
              </div>
            </div>

            <div className="mt-3">
              <Label>Bu plana bağlı plasiyerler</Label>
              <div className="flex flex-wrap gap-3">
                {reps.isLoading && <LoadingState label="Plasiyerler…" />}
                {repOptions.map((r) => (
                  <Checkbox
                    key={r.id}
                    checked={draft.repIds.includes(r.id)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        repIds: e.target.checked
                          ? [...draft.repIds, r.id]
                          : draft.repIds.filter((x) => x !== r.id),
                      })
                    }
                    label={r.name}
                  />
                ))}
              </div>
            </div>

            <ErrorLine error={save.error} />
            <div className="mt-3 flex items-center gap-3">
              <Button
                loading={save.isPending}
                disabled={!draft.name.trim() || !draft.rate}
                onClick={() => save.mutate()}
              >
                Kaydet
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Vazgeç
              </Button>
            </div>
          </div>
        )}

        <Table>
          <THead>
            <tr>
              <Th>Plan</Th>
              <Th>Taban</Th>
              <Th align="right">Oran</Th>
              <Th>Dönem</Th>
              <Th align="right">Çarpan</Th>
              <Th>Plasiyerler</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {plans.length === 0 && query.isSuccess && (
              <TableEmpty
                colSpan={7}
                label="Henüz prim planı yok — prim taban, oran, dönem ve hedef çarpanından ibarettir."
              />
            )}
            {plans.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium text-ink">
                  {p.name}
                  {!p.isActive && (
                    <span className="ml-2 text-xs text-ink-faint">(pasif)</span>
                  )}
                </Td>
                <Td muted>{COMMISSION_BASE_LABELS[p.base]}</Td>
                <Td align="right" numeric>
                  %{p.rate}
                </Td>
                <Td muted>{PERIOD_LABELS[p.period]}</Td>
                <Td align="right" numeric muted>
                  {p.targetMultiplier === "1.00" ? "—" : `×${p.targetMultiplier}`}
                </Td>
                <Td muted>
                  {p.repNames.length === 0 ? (
                    <span className="text-xs text-ink-faint">atanmadı</span>
                  ) : (
                    p.repNames.join(", ")
                  )}
                </Td>
                <Td align="right">
                  <span className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          id: p.id,
                          name: p.name,
                          base: p.base,
                          rate: p.rate,
                          period: p.period,
                          targetMultiplier: p.targetMultiplier,
                          minBase: p.minBase,
                          isActive: p.isActive,
                          repIds: p.repIds,
                        })
                      }
                    >
                      Düzenle
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `"${p.name}" planı silinsin mi? Geçmiş hakediş de kaybolur — kaydı tutmak için planı pasife alın.`,
                          )
                        ) {
                          remove.mutate(p.id);
                        }
                      }}
                    >
                      Sil
                    </Button>
                  </span>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <div className="px-4 pb-4">
          <ErrorLine error={remove.error} />
        </div>
      </Panel>
    </div>
  );
}
