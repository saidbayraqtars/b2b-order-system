"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LotExpirySummary, StockLotRow } from "@repo/services";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
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
  EmptyState,
  LoadingState,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import { VariantPicker } from "./variant-picker";

// Parti & son kullanma tarihi.
//
// Listenin sırası kasıtlı: SKT'si en yakın olan üstte. Gıda deposunda bu ekrana
// bakan kişinin sorusu "hangi mal önce çıkmalı" — ve o soruya cevap veren tek
// sıralama budur. Tarihi bilinmeyen partiler sona iniyor.
//
// Uyarı şeridi listeden ayrı bir sayı kümesi (`summary`) okuyor: süzgeç
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
      if (search.trim()) params.set("q", search.trim());
      return apiGet<LotsResponse>(`/api/admin/stock-lots?${params}`);
    },
  });

  const block = useMutation({
    mutationFn: (lot: StockLotRow) =>
      apiPatch(`/api/admin/stock-lots/${lot.id}`, { isBlocked: !lot.isBlocked }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stock-lots"] });
    },
  });

  const rows = query.data?.lots ?? [];
  const summary = query.data?.summary;

  return (
    <Panel
      title="Partiler & son kullanma"
      action={
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <Label>Ara</Label>
            <TextInput
              value={search}
              placeholder="Parti kodu, SKU, ürün"
              onChange={(e) => setSearch(e.target.value)}
              className="w-44"
            />
          </label>
          <label>
            <Label>Süzgeç</Label>
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="w-40"
            >
              <option value="ALL">Elde duran hepsi</option>
              <option value="SOON">30 gün içinde</option>
              <option value="EXPIRED">SKT&apos;si geçmiş</option>
            </Select>
          </label>
          <Button size="sm" onClick={() => setEntryOpen(true)}>
            Mal kabul
          </Button>
        </div>
      }
    >
      {summary && (
        <div className="mb-3 flex flex-wrap gap-4 text-sm">
          <span>
            SKT&apos;si geçmiş:{" "}
            <strong className="text-red-600 dark:text-red-400">
              {summary.expiredLots}
            </strong>{" "}
            parti / {summary.expiredUnits} adet
          </span>
          <span>
            30 gün içinde:{" "}
            <strong className="text-amber-600 dark:text-amber-400">
              {summary.warningLots}
            </strong>{" "}
            parti / {summary.warningUnits} adet
          </span>
          <span>
            Bloke: <strong>{summary.blockedLots}</strong>
          </span>
          <span className="text-neutral-500">
            En yakın SKT: {formatDate(summary.nextExpiryDate)}
          </span>
        </div>
      )}

      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />
      <ErrorLine error={block.error} />

      {query.data && rows.length === 0 && <EmptyState label="Parti kaydı yok" />}

      {rows.length > 0 && (
        <Table>
          <THead>
            <tr>
              <Th>Ürün</Th>
              <Th>Parti</Th>
              <Th>SKT</Th>
              <Th align="right">Kalan gün</Th>
              <Th align="right">Adet</Th>
              <Th>Durum</Th>
              <Th align="right">İşlem</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((lot) => {
              const badge = STATE_BADGE[lot.state];
              return (
                <tr key={lot.id}>
                  <Td>
                    <div className="font-medium">{lot.productName}</div>
                    <div className="text-xs text-neutral-500">{lot.sku}</div>
                  </Td>
                  <Td className="tech-num">{lot.code}</Td>
                  <Td>{formatDate(lot.expiryDate)}</Td>
                  <Td align="right" className="tech-num">
                    {lot.daysLeft === null ? "—" : lot.daysLeft}
                  </Td>
                  <Td align="right" className="tech-num">
                    {lot.onHand}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {lot.isBlocked && <Badge tone="neutral">Bloke</Badge>}
                    </div>
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => block.mutate(lot)}
                        disabled={block.isPending}
                      >
                        {lot.isBlocked ? "Blokeyi kaldır" : "Bloke et"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setWriteOff(lot)}>
                        Fire
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <p className="mt-3 text-sm text-neutral-500">
        Sipariş malı <strong>FEFO</strong> ile ayırır: son kullanma tarihi en yakın
        parti önce çıkar. SKT&apos;si geçmiş ve bloke partiler bu sıraya hiç
        girmez — onlar bir <strong>fire kararıdır</strong>, satış anında sessizce
        çözülecek bir şey değil. Hangi siparişe hangi partinin gittiği stok
        defterinde duruyor; geri çağırmada aranacak yer orası.
      </p>

      {entryOpen && <LotEntryModal onClose={() => setEntryOpen(false)} />}
      {writeOff && (
        <WriteOffModal lot={writeOff} onClose={() => setWriteOff(null)} />
      )}
    </Panel>
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
          <label>
            <Label>Parti kodu</Label>
            <TextInput
              value={code}
              placeholder="Boş bırakılırsa üretilir"
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label>
            <Label>Adet</Label>
            <TextInput
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label>
            <Label>Son kullanma tarihi</Label>
            <TextInput
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <label>
            <Label>Üretim tarihi</Label>
            <TextInput
              type="date"
              value={producedAt}
              onChange={(e) => setProducedAt(e.target.value)}
            />
          </label>
        </div>

        <label className="block">
          <Label>Not</Label>
          <TextInput
            value={note}
            placeholder="Tedarikçi, irsaliye no…"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <p className="text-xs text-neutral-500">
          SKT boş bırakılırsa ve kalemde raf ömrü tanımlıysa üretim tarihinden
          hesaplanır.
        </p>

        <ErrorLine error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={!variantId || !quantity || save.isPending}>
            {save.isPending ? "Kaydediliyor…" : "Girişi yaz"}
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
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {lot.productName} · {lot.sku} · elde {lot.onHand} adet · SKT{" "}
          {formatDate(lot.expiryDate)}
        </p>

        <label className="block">
          <Label>Düşülecek adet</Label>
          <TextInput
            type="number"
            min={1}
            max={lot.onHand}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>

        <label className="block">
          <Label>Gerekçe</Label>
          <TextInput
            value={reason}
            placeholder="SKT geçti, kırık, iade edildi…"
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </label>

        {wholeLot && (
          <Checkbox
            checked={confirmAll}
            onChange={(e) => setConfirmAll(e.target.checked)}
            label="Partinin tamamı düşülecek — onaylıyorum"
          />
        )}

        <ErrorLine error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            disabled={
              !reason.trim() || save.isPending || (wholeLot && !confirmAll)
            }
          >
            {save.isPending ? "Kaydediliyor…" : "Fire yaz"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
