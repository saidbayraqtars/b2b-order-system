"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  AUDIT_ACTION_LABELS,
  AuditActionEnum,
  ROLE_LABELS,
  SECURITY_ACTIONS,
  type AuditAction,
  type AuditEntry,
} from "@repo/types";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Select,
  TextInput,
} from "@/components/form";
import { apiGet } from "@/lib/fetcher";
import { useUrlState } from "@/lib/url-state";
import {
  Badge,
  LoadingState,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";

interface Page {
  entries: AuditEntry[];
  nextCursor: string | null;
}

/** Actions that mean something went wrong or someone gained power. */
const ALERT_ACTIONS = new Set<AuditAction>(SECURITY_ACTIONS);

/** Süzgeç varsayılanları — modül düzeyinde, `useUrlState` kimlik bekliyor. */
const FILTER_DEFAULTS = {
  olay: "",
  ara: "",
  baslangic: "",
  bitis: "",
  guvenlik: "",
};

export function AuditClient() {
  const filters = useUrlState(FILTER_DEFAULTS);
  const action = filters.value.olay as "" | AuditAction;
  const search = filters.value.ara;
  const securityOnly = filters.value.guvenlik === "1";
  const from = filters.value.baslangic;
  const to = filters.value.bitis;

  // Arama kutusunun **yazılan** hâli yerelde: her tuşta adres yazmak, her
  // tuşta bir sunucu gidiş-dönüşü demek. Adrese Enter'da ya da alandan
  // çıkınca işleniyor — ürün listesindeki arama kutusuyla aynı davranış.
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);

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
  // 50, 100 değil: yüz satır sayfayı altı bin pikselin ötesine taşıyor ve
  // altındaki sayfalama düğmeleri ile dipnot hiç görünmüyordu. Aranan kayda
  // giden yol kaydırmak değil, üstteki süzgeç ve İleri düğmesi.
  params.set("limit", "50");

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
      {/* Süzgeç şeridi gömük zeminde — aranan şeye giden yol kaydırmak
          değil, buradan daraltmak. */}
      <div className="grid gap-3 rounded-lg border border-line bg-sunken p-3 sm:grid-cols-5">
        <div>
          <Label>Olay</Label>
          <Select
            value={action}
            onChange={(e) => {
              filters.set({ olay: e.target.value });
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
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onBlur={() => {
              if (searchDraft !== search) {
                filters.set({ ara: searchDraft });
                resetPaging();
              }
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              filters.set({ ara: searchDraft });
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
              filters.set({ baslangic: e.target.value });
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
              filters.set({ bitis: e.target.value });
              resetPaging();
            }}
          />
        </div>
        <div className="pb-2.5 sm:self-end">
          <Checkbox
            checked={securityOnly}
            onChange={(e) => {
              filters.set({ guvenlik: e.target.checked ? "1" : "" });
              resetPaging();
            }}
            label="Sadece güvenlik olayları"
          />
        </div>
      </div>

      {query.isPending && <LoadingState />}
      <ErrorLine error={query.error} />

      {query.data && (
        <>
          <div className="rounded-lg border border-line bg-panel">
            {/* Sıralama yok: liste imleçle sayfalanıyor ve yalnızca *görünen*
                elli satırı sıralamak, "en eski kayıt" diye yanlış bir cevap
                verirdi. Yapışkan başlık ise tam da bu ekran için: 3530 piksel. */}
            <Table stickyHead>
              <THead>
                <tr>
                  <Th>Zaman</Th>
                  <Th>Kim</Th>
                  <Th>Olay</Th>
                  <Th>Açıklama</Th>
                  <Th>IP</Th>
                </tr>
              </THead>
              <TBody>
                {query.data.entries.length === 0 && (
                  <TableEmpty
                    colSpan={5}
                    label={
                      filters.isFiltered
                        ? "Bu süzgeçte kayıt yok."
                        : "Kayıt yok."
                    }
                    action={
                      filters.isFiltered ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            filters.clear();
                            resetPaging();
                          }}
                        >
                          Süzgeci temizle
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                {query.data.entries.map((e) => (
                  <tr key={e.id}>
                    <Td numeric muted className="whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString("tr-TR")}
                    </Td>
                    <Td>
                      <span className="font-medium text-ink">
                        {e.actorEmail}
                      </span>
                      {e.actorRole && (
                        <span className="ml-1 text-xs text-ink-faint">
                          {ROLE_LABELS[e.actorRole]}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {/* Yetki kazandıran ya da reddedilen olay künyeye
                          çıkıyor; gerisi düz metin kalıyor ki kehribar,
                          bakılması gereken satırı işaret etsin. */}
                      {ALERT_ACTIONS.has(e.action) ? (
                        <Badge tone="warning">
                          {AUDIT_ACTION_LABELS[e.action]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-muted">
                          {AUDIT_ACTION_LABELS[e.action]}
                        </span>
                      )}
                    </Td>
                    <Td>{e.summary}</Td>
                    <Td muted>{e.ip ?? "—"}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={trail.length === 0}
              onClick={() => {
                const next = [...trail];
                next.pop();
                setTrail(next);
                setCursor(next[next.length - 1] ?? null);
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Geri
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!query.data.nextCursor}
              onClick={() => {
                const c = query.data.nextCursor;
                if (!c) return;
                setTrail([...trail, c]);
                setCursor(c);
              }}
            >
              İleri
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-ink-faint">
              {query.data.entries.length} kayıt gösteriliyor
              {query.data.nextCursor
                ? " — gerisi için İleri, aradığınız kayıt için süzgeç"
                : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
