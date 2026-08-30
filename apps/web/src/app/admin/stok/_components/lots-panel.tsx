"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LotExpirySummary, StockLotRow } from "@repo/services";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { ShowMore, useVisibleSlice } from "@/components/show-more";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Modal,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import {
  Badge,
  Note,
  StatTile,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  LoadingState,
} from "@/components/ui";
import { VariantPicker } from "./variant-picker";

// Parti & son kullanma tarihi.
//
// Listenin sırası kasıtlı: SKT'si en yakın olan üstte. Gıda deposunda bu ekrana
// bakan kişinin sorusu "hangi mal önce çıkmalı" — ve o soruya cevap veren tek
// sıralama budur. Tarihi bilinmeyen partiler sona iniyor.
//
// Uyarı kutuları listeden ayrı bir sayı kümesi (`summary`) okuyor: süzgeç
// değiştikçe listedeki satırlar değişir ama "kaç parti bozulmuş" sabit kalmalı,
// yoksa süzgeç uyarıyı gizleyebilirdi.

interface LotsResponse {
  lots: StockLotRow[];
  summary: LotExpirySummary;
}

type Filter = "ALL" | "EXPIRED" | "SOON";

const FILTER_QUERY: Record<Filter, string> = {
  ALL: "",
  EXPIRED: "expiredOnly=1",
  SOON: "withinDays=30",
};

const STATE_BADGE: Record<
  StockLotRow["state"],
  { tone: "success" | "warning" | "danger" | "neutral"; label: string }
> = {
  OK: { tone: "success", label: "Uygun" },
  WARNING: { tone: "warning", label: "Yaklaşıyor" },
  EXPIRED: { tone: "danger", label: "Geçmiş" },
  UNKNOWN: { tone: "neutral", label: "Tarihsiz" },
};

/** Sunucudan inen satır sayısı — gerisi süzgeçle bulunur. */
const PAGE_SIZE = 50;

/** İnenin ilk dilimi. Kesme çizimde: sıralama ve sayma elli satırın tamamında. */
const RENDER_STEP = 20;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR");
}

export function LotsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [writeOff, setWriteOff] = useState<StockLotRow | null>(null);

  const query = useQuery({
    queryKey: ["stock-lots", filter, search],
    queryFn: () => {
      const params = new URLSearchParams(FILTER_QUERY[filter]);
      params.set("limit", String(PAGE_SIZE));
      if (search.trim()) params.set("q", search.trim());
      return apiGet<LotsResponse>(`/api/admin/stock-lots?${params}`);
    },
  });

  const block = useMutation({
    mutationFn: (lot: StockLotRow) =>
      apiPatch(`/api/admin/stock-lots/${lot.id}`, {
        isBlocked: !lot.isBlocked,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock-lots"] });
    },
  });

  const rows = query.data?.lots ?? [];
  const page = useVisibleSlice(rows, RENDER_STEP);
  const summary = query.data?.summary;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="SKT'si geçmiş"
          value={summary ? summary.expiredLots : "—"}
          tone="critical"
          hint={summary ? `${summary.expiredUnits} adet` : undefined}
        />
        <StatTile
          label="30 gün içinde"
          value={summary ? summary.warningLots : "—"}
          tone="caution"
          hint={summary ? `${summary.warningUnits} adet` : undefined}
        />
        <StatTile label="Bloke" value={summary ? summary.blockedLots : "—"} />
        <StatTile
          label="En yakın SKT"
          value={summary ? formatDate(summary.nextExpiryDate) : "—"}
        />
      </div>

      <Panel
        title="Partiler & son kullanma"
        className="mt-4"
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="lot-q">Ara</Label>
              <TextInput
                id="lot-q"
                size="sm"
                value={search}
                placeholder="Parti kodu, SKU, ürün"
                onChange={(e) => setSearch(e.target.value)}
                className="w-44"
              />
            </div>
            <div>
              <Label htmlFor="lot-filter">Süzgeç</Label>
              <Select
                id="lot-filter"
                size="sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="w-40"
              >
                <option value="ALL">Elde duran hepsi</option>
                <option value="SOON">30 gün içinde</option>
                <option value="EXPIRED">SKT&apos;si geçmiş</option>
              </Select>
            </div>
            <Button size="sm" onClick={() => setEntryOpen(true)}>
              Mal kabul
            </Button>
          </div>
        }
      >
        {query.isLoading && (
          <div className="px-4">
            <LoadingState />
          </div>
        )}
        <div className="px-4">
          <ErrorLine error={query.error} />
          <ErrorLine error={block.error} />
        </div>

        {query.data && (
          <Table>
            <THead>
              <tr>
                <Th>Ürün</Th>
                <Th>Parti</Th>
                <Th>SKT</Th>
                <Th align="right">Kalan gün</Th>
                <Th align="right">Adet</Th>
                <Th>Durum</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={7} label="Parti kaydı yok." />
              ) : (
                page.visible.map((lot) => {
                  const badge = STATE_BADGE[lot.state];
                  return (
                    <tr key={lot.id}>
                      <Td>
                        <div className="text-ink">{lot.productName}</div>
                        <div className="text-xs text-ink-faint">{lot.sku}</div>
                      </Td>
                      <Td className="tech-num">{lot.code}</Td>
                      <Td className="whitespace-nowrap">
                        {formatDate(lot.expiryDate)}
                      </Td>
                      <Td align="right" numeric>
                        {lot.daysLeft === null ? "—" : lot.daysLeft}
                      </Td>
                      <Td align="right" numeric>
                        {lot.onHand}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          {lot.isBlocked && <Badge tone="neutral">Bloke</Badge>}
                        </div>
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => block.mutate(lot)}
                            disabled={block.isPending}
                          >
                            {lot.isBlocked ? "Blokeyi kaldır" : "Bloke et"}
                          </Button>
                          {/* Adım 4'ün dangerQuiet'i dört satırlık bir ayar
                              ekranı içindi; burada elli satır var ve kırmızı
                              yazı sağ kenarda bir sütuna dönüşüyor. Yıkıcılığı
                              taşıyan şey zaten pencere: gerekçe zorunlu, tüm
                              parti düşülüyorsa ayrıca onay isteniyor. */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setWriteOff(lot)}
                          >
                            Fire
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </TBody>
          </Table>
        )}

        {rows.length > 0 && (
          <div className="border-t border-line px-4 pb-3">
            <ShowMore
              visible={page.visible.length}
              total={page.total}
              hidden={page.hidden}
              onMore={page.showMore}
              noun="parti"
              serverCapped={rows.length >= PAGE_SIZE}
            />
          </div>
        )}
      </Panel>

      <Note>
        Sipariş malı <strong>FEFO</strong> ile ayırır: son kullanma tarihi en
        yakın parti önce çıkar. SKT&apos;si geçmiş ve bloke partiler bu sıraya
        hiç girmez — onlar bir <strong>fire kararıdır</strong>, satış anında
        sessizce çözülecek bir şey değil. Hangi siparişe hangi partinin gittiği
        stok defterinde duruyor; geri çağırmada aranacak yer orası.
      </Note>

      {entryOpen && <LotEntryModal onClose={() => setEntryOpen(false)} />}
      {writeOff && (
        <WriteOffModal lot={writeOff} onClose={() => setWriteOff(null)} />
      )}
    </>
  );
}

/**
 * Mal kabul.
 *
 * Adet ile parti künyesi aynı formda: iki adım olsaydı girişi yapan kişi
 * ikincisini atlar ve defter partisi girilmemiş bakiyeyle dolardı.
 */
function LotEntryModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [variantId, setVariantId] = useState("");
  const [code, setCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [producedAt, setProducedAt] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/stock-lots", {
        variantId,
        code: code.trim() || undefined,
        expiryDate: expiryDate || undefined,
        producedAt: producedAt || undefined,
        quantity: Number(quantity),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock-lots"] });
      void qc.invalidateQueries({ queryKey: ["stock-levels"] });
      void qc.invalidateQueries({ queryKey: ["stock-movements"] });
      onClose();
    },
  });

  return (
    <Modal title="Mal kabul — parti girişi" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <VariantPicker value={variantId} onChange={setVariantId} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="lot-code">Parti kodu</Label>
            <TextInput
              id="lot-code"
              value={code}
              placeholder="Boş bırakılırsa üretilir"
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lot-qty">Adet</Label>
            <TextInput
              id="lot-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="lot-exp">Son kullanma tarihi</Label>
            <TextInput
              id="lot-exp"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lot-prod">Üretim tarihi</Label>
            <TextInput
              id="lot-prod"
              type="date"
              value={producedAt}
              onChange={(e) => setProducedAt(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="lot-note">Not</Label>
          <TextInput
            id="lot-note"
            value={note}
            placeholder="Tedarikçi, irsaliye no…"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <p className="text-xs text-ink-faint">
          SKT boş bırakılırsa ve kalemde raf ömrü tanımlıysa üretim tarihinden
          hesaplanır.
        </p>

        <ErrorLine error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            disabled={!variantId || !quantity}
            loading={save.isPending}
          >
            Girişi yaz
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Fire: sayımdan ayrı, çünkü "mal gitti" ile "defter yanılmış" aynı şey değil. */
function WriteOffModal({
  lot,
  onClose,
}: {
  lot: StockLotRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState(String(lot.onHand));
  const [reason, setReason] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/stock-lots/${lot.id}/write-off`, {
        quantity: Number(quantity),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock-lots"] });
      void qc.invalidateQueries({ queryKey: ["stock-levels"] });
      void qc.invalidateQueries({ queryKey: ["stock-movements"] });
      onClose();
    },
  });

  const wholeLot = Number(quantity) === lot.onHand;

  return (
    <Modal title={`Fire — ${lot.code}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-body-sm text-ink-muted">
          {lot.productName} · {lot.sku} · elde {lot.onHand} adet · SKT{" "}
          {formatDate(lot.expiryDate)}
        </p>

        <div>
          <Label htmlFor="wo-qty">Düşülecek adet</Label>
          <TextInput
            id="wo-qty"
            type="number"
            min={1}
            max={lot.onHand}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="wo-reason">Gerekçe</Label>
          <TextInput
            id="wo-reason"
            value={reason}
            placeholder="SKT geçti, kırık, iade edildi…"
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        {wholeLot && (
          <Checkbox
            checked={confirmAll}
            onChange={(e) => setConfirmAll(e.target.checked)}
            label="Partinin tamamı düşülecek — onaylıyorum"
          />
        )}

        <ErrorLine error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={!reason.trim() || (wholeLot && !confirmAll)}
            loading={save.isPending}
          >
            Fire yaz
          </Button>
        </div>
      </form>
    </Modal>
  );
}
