"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnnouncementView, CustomerGroupRow } from "@repo/services";
import {
  ANNOUNCEMENT_PLACEMENT_LABELS,
  ANNOUNCEMENT_TONE_LABELS,
  type AnnouncementPlacement,
  type AnnouncementTone,
} from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextArea,
  TextInput,
} from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

// Vitrin duyuruları. Kampanya motorundan bağımsız: buradaki hiçbir kayıt bir
// tutarı değiştirmez, yalnızca müşteriye ne gösterileceğini söyler.

const EMPTY = {
  title: "",
  body: "",
  linkUrl: "",
  linkLabel: "",
  placement: "BANNER" as AnnouncementPlacement,
  tone: "brand" as AnnouncementTone,
  dismissible: true,
  priority: 0,
  customerGroupIds: [] as string[],
};

export function AnnouncementsManager() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ ...EMPTY });

  const query = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () =>
      apiGet<{ announcements: AnnouncementView[] }>("/api/admin/announcements"),
  });
  const groupsQuery = useQuery({
    queryKey: ["admin-customer-groups"],
    queryFn: () =>
      apiGet<{ groups: CustomerGroupRow[] }>("/api/admin/customer-groups"),
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin-announcements"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/announcements", {
        title: draft.title,
        body: draft.body || null,
        linkUrl: draft.linkUrl || null,
        linkLabel: draft.linkLabel || null,
        placement: draft.placement,
        tone: draft.tone,
        dismissible: draft.dismissible,
        priority: draft.priority,
        customerGroupIds: draft.customerGroupIds,
      }),
    onSuccess: () => {
      setDraft({ ...EMPTY });
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiPatch(`/api/admin/announcements/${id}`, { enabled }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/announcements/${id}`),
    onSuccess: invalidate,
  });

  const groups = groupsQuery.data?.groups ?? [];
  const items = query.data?.announcements ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Yeni duyuru">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <Label>Başlık</Label>
            <TextInput
              value={draft.title}
              placeholder="Kasım kampanyası başladı"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>

          <label className="sm:col-span-2">
            <Label hint="(isteğe bağlı)">Metin</Label>
            <TextArea
              value={draft.body}
              placeholder="Seçili kategorilerde %25'e varan indirim."
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>

          <label>
            <Label>Konum</Label>
            <Select
              value={draft.placement}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  placement: e.target.value as AnnouncementPlacement,
                })
              }
            >
              {Object.entries(ANNOUNCEMENT_PLACEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <Label>Ton</Label>
            <Select
              value={draft.tone}
              onChange={(e) =>
                setDraft({ ...draft, tone: e.target.value as AnnouncementTone })
              }
            >
              {Object.entries(ANNOUNCEMENT_TONE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <Label hint="(isteğe bağlı)">Bağlantı</Label>
            <TextInput
              value={draft.linkUrl}
              placeholder="/portal?categoryId=…"
              onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
            />
          </label>

          <label>
            <Label hint="(isteğe bağlı)">Bağlantı yazısı</Label>
            <TextInput
              value={draft.linkLabel}
              placeholder="Kampanyayı gör"
              onChange={(e) =>
                setDraft({ ...draft, linkLabel: e.target.value })
              }
            />
          </label>

          <label>
            <Label hint="büyük olan önce">Öncelik</Label>
            <TextInput
              type="number"
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: Number(e.target.value) })
              }
            />
          </label>

          <Checkbox
            checked={draft.dismissible}
            onChange={(e) =>
              setDraft({ ...draft, dismissible: e.target.checked })
            }
            label={
              <>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  Müşteri kapatabilsin
                </span>
              </>
            }
          />

          {groups.length > 0 && (
            <div className="sm:col-span-2">
              <Label hint="boş = herkese">Hedef müşteri grupları</Label>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = draft.customerGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          customerGroupIds: on
                            ? draft.customerGroupIds.filter((x) => x !== g.id)
                            : [...draft.customerGroupIds, g.id],
                        })
                      }
                      className={`border px-2.5 py-1 text-xs transition-colors ${
                        on
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
                      }`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <ErrorLine error={create.error} />

        <div className="mt-4">
          <Button
            loading={create.isPending}
            disabled={!draft.title.trim()}
            onClick={() => create.mutate()}
          >
            Duyuruyu yayınla
          </Button>
        </div>
      </Panel>

      <Panel title={`Duyurular (${items.length})`}>
        {query.isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState label="Henüz duyuru yok." />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {items.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{a.title}</span>
                    <Badge tone={a.enabled ? "success" : "neutral"}>
                      {a.enabled ? "Yayında" : "Kapalı"}
                    </Badge>
                    <Badge tone="info">
                      {ANNOUNCEMENT_PLACEMENT_LABELS[a.placement]}
                    </Badge>
                    {a.customerGroupIds.length > 0 && (
                      <Badge tone="warning">
                        {a.customerGroupIds.length} gruba özel
                      </Badge>
                    )}
                  </div>
                  {a.body && (
                    <p className="mt-1 text-xs text-neutral-500">{a.body}</p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-neutral-400">
                    öncelik {a.priority}
                    {a.dismissible ? " · kapatılabilir" : " · kapatılamaz"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={toggle.isPending}
                    onClick={() =>
                      toggle.mutate({ id: a.id, enabled: !a.enabled })
                    }
                  >
                    {a.enabled ? "Durdur" : "Yayınla"}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={remove.isPending}
                    onClick={() => remove.mutate(a.id)}
                  >
                    Sil
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <ErrorLine error={toggle.error ?? remove.error} />
      </Panel>
    </div>
  );
}
