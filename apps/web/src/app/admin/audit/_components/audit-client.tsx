"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AUDIT_ACTION_LABELS,
  AuditActionEnum,
  ROLE_LABELS,
  SECURITY_ACTIONS,
  type AuditAction,
  type AuditEntry,
} from "@repo/types";
import { Button, Label, Select, TextInput } from "@/components/form";
import { apiGet } from "@/lib/fetcher";

interface Page {
  entries: AuditEntry[];
  nextCursor: string | null;
}

/** Actions that mean something went wrong or someone gained power. */
const ALERT_ACTIONS = new Set<AuditAction>(SECURITY_ACTIONS);

export function AuditClient() {
  const [action, setAction] = useState<"" | AuditAction>("");
  const [search, setSearch] = useState("");
  const [securityOnly, setSecurityOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  /** Pages already walked, so "geri" can pop back one. */
  const [trail, setTrail] = useState<string[]>([]);

  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (search.trim()) params.set("search", search.trim());
  if (securityOnly) params.set("securityOnly", "true");
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "100");

  const query = useQuery({
    queryKey: ["audit", params.toString()],
    queryFn: () => apiGet<Page>(`/api/admin/audit?${params.toString()}`),
  });

  function resetPaging() {
    setCursor(null);
    setTrail([]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-5 dark:border-neutral-800">
        <div>
          <Label>Olay</Label>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as "" | AuditAction);
              resetPaging();
            }}
          >
            <option value="">Tümü</option>
            {AuditActionEnum.options.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Ara</Label>
          <TextInput
            placeholder="e-posta veya açıklama"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPaging();
            }}
          />
        </div>
        <div>
          <Label>Başlangıç</Label>
          <TextInput
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPaging();
            }}
          />
        </div>
        <div>
          <Label>Bitiş</Label>
          <TextInput
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPaging();
            }}
          />
        </div>
        <label className="flex items-end gap-2 pb-1 text-sm">
          <input
            type="checkbox"
            checked={securityOnly}
            onChange={(e) => {
              setSecurityOnly(e.target.checked);
              resetPaging();
            }}
          />
          Sadece güvenlik olayları
        </label>
      </div>

      {query.isPending && <p className="text-sm text-neutral-500">Yükleniyor…</p>}
      {query.isError && (
        <p className="text-sm text-red-600">
          {query.error instanceof Error ? query.error.message : "Hata"}
        </p>
      )}

      {query.data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2 pr-3">Zaman</th>
                  <th className="py-2 pr-3">Kim</th>
                  <th className="py-2 pr-3">Olay</th>
                  <th className="py-2 pr-3">Açıklama</th>
                  <th className="py-2 pr-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {query.data.entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-neutral-500">
                      Kayıt yok.
                    </td>
                  </tr>
                )}
                {query.data.entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-neutral-100 dark:border-neutral-900"
                  >
                    <td className="whitespace-nowrap py-1.5 pr-3 text-neutral-500">
                      {new Date(e.createdAt).toLocaleString("tr-TR")}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="font-medium">{e.actorEmail}</span>
                      {e.actorRole && (
                        <span className="ml-1 text-xs text-neutral-400">
                          {ROLE_LABELS[e.actorRole]}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      <span
                        className={
                          ALERT_ACTIONS.has(e.action)
                            ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                            : "text-xs text-neutral-600 dark:text-neutral-400"
                        }
                      >
                        {AUDIT_ACTION_LABELS[e.action]}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">{e.summary}</td>
                    <td className="py-1.5 pr-3 text-xs text-neutral-400">
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={trail.length === 0}
              onClick={() => {
                const next = [...trail];
                next.pop();
                setTrail(next);
                setCursor(next[next.length - 1] ?? null);
              }}
            >
              ← Geri
            </Button>
            <Button
              variant="secondary"
              disabled={!query.data.nextCursor}
              onClick={() => {
                const c = query.data.nextCursor;
                if (!c) return;
                setTrail([...trail, c]);
                setCursor(c);
              }}
            >
              İleri →
            </Button>
            <span className="text-xs text-neutral-500">
              {query.data.entries.length} kayıt
            </span>
          </div>
        </>
      )}
    </div>
  );
}
