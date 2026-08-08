"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, X } from "lucide-react";
import { apiGet, apiPut } from "@/lib/fetcher";
import { Badge } from "@/components/ui";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";

// Zamanlanmış gönderim paneli.
//
// Rapor tasarımcısının yanında değil altında duruyor: tasarım ile gönderim ayrı
// kararlar ve ikisini aynı "kaydet" düğmesine bağlamak, alıcı listesini
// değiştirmek için raporu yeniden kaydetmeyi gerektirirdi.

interface ScheduleView {
  intervalMinutes: number | null;
  recipients: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSummary: string | null;
}

/** Saatten kısa aralık yok — daha sık gönderilen rapor okunmuyor. */
const INTERVALS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 60, label: "Saatte bir" },
  { value: 360, label: "6 saatte bir" },
  { value: 720, label: "12 saatte bir" },
  { value: 1440, label: "Günde bir" },
  { value: 10080, label: "Haftada bir" },
];

function formatMoment(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("tr-TR");
}

export function ScheduleCard({
  reportId,
  canEdit,
}: {
  reportId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const key = ["report-schedule", reportId];

  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      apiGet<{ schedule: ScheduleView | null }>(
        `/api/reports/definitions/${reportId}/schedule`,
      ),
  });

  const schedule = query.data?.schedule ?? null;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [interval, setInterval] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");

  // Sunucudan gelen değer başlangıç; kullanıcı dokunduğu andan itibaren yerel
  // durum kazanıyor. `null` "henüz dokunulmadı" demek.
  const isOn = enabled ?? (schedule?.intervalMinutes ?? null) !== null;
  const currentInterval = interval ?? schedule?.intervalMinutes ?? 1440;
  const currentRecipients = recipients ?? schedule?.recipients ?? [];

  const save = useMutation({
    mutationFn: () =>
      apiPut<{ schedule: ScheduleView }>(
        `/api/reports/definitions/${reportId}/schedule`,
        {
          intervalMinutes: isOn ? currentInterval : null,
          recipients: isOn ? currentRecipients : [],
        },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setEnabled(null);
      setInterval(null);
      setRecipients(null);
    },
  });

  function addRecipient() {
    const value = draft.trim().toLowerCase();
    if (!value || currentRecipients.includes(value)) {
      setDraft("");
      return;
    }
    setRecipients([...currentRecipients, value]);
    setDraft("");
  }

  return (
    <Panel
      title="Zamanlanmış gönderim"
      action={
        schedule?.lastStatus ? (
          <Badge tone={schedule.lastStatus === "OK" ? "success" : "danger"}>
            {schedule.lastStatus === "OK" ? "Son gönderim başarılı" : "Son gönderim hatalı"}
          </Badge>
        ) : null
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-neutral-500">Yükleniyor…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Rapor belirtilen sıklıkta çalıştırılıp CSV eki olarak gönderilir.
            Rapor <strong>sahibinin</strong> yetkisiyle çalışır — alıcılar
            sahibinin görebildiğinden fazlasını görmez.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isOn}
              disabled={!canEdit}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Bu raporu düzenli olarak gönder
          </label>

          {isOn && (
            <>
              <div className="max-w-xs">
                <Label htmlFor="schedule-interval">Sıklık</Label>
                <Select
                  id="schedule-interval"
                  value={currentInterval}
                  disabled={!canEdit}
                  onChange={(e) => setInterval(Number(e.target.value))}
                >
                  {INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="schedule-recipient" hint="e-posta adresi">
                  Alıcılar
                </Label>
                <div className="flex gap-2">
                  <TextInput
                    id="schedule-recipient"
                    type="email"
                    value={draft}
                    disabled={!canEdit}
                    placeholder="ornek@firma.com"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                  />
                  <Button variant="secondary" disabled={!canEdit} onClick={addRecipient}>
                    <Plus className="h-4 w-4" />
                    Ekle
                  </Button>
                </div>

                {currentRecipients.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {currentRecipients.map((r) => (
                      <li
                        key={r}
                        className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800"
                      >
                        <Mail className="h-3 w-3 text-neutral-400" />
                        {r}
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={`${r} adresini kaldır`}
                            onClick={() =>
                              setRecipients(currentRecipients.filter((x) => x !== r))
                            }
                            className="text-neutral-400 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">
                    En az bir alıcı ekleyin.
                  </p>
                )}
              </div>
            </>
          )}

          <dl className="grid gap-x-6 gap-y-1 text-xs text-neutral-500 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt>Sıradaki gönderim:</dt>
              <dd className="font-medium text-neutral-700 dark:text-neutral-300">
                {formatMoment(schedule?.nextRunAt ?? null)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>Son gönderim:</dt>
              <dd className="font-medium text-neutral-700 dark:text-neutral-300">
                {formatMoment(schedule?.lastRunAt ?? null)}
              </dd>
            </div>
            {schedule?.lastSummary && (
              <div className="flex gap-2 sm:col-span-2">
                <dt>Sonuç:</dt>
                <dd>{schedule.lastSummary}</dd>
              </div>
            )}
          </dl>

          {canEdit && (
            <div>
              <Button
                onClick={() => save.mutate()}
                loading={save.isPending}
                disabled={isOn && currentRecipients.length === 0}
              >
                Gönderim ayarını kaydet
              </Button>
              <ErrorLine error={save.error} />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
