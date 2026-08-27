"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentSeriesRow } from "@repo/services";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@repo/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Badge, EmptyState, LoadingState } from "@/components/ui";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";

// Numaralandırma serileri. Ekranın hassas yeri sayaç: ERP'de zaten 4711'e
// gelmiş bir seriye devam etmek için ileri alınabilir, ama asla geri
// alınamaz — basılmış bir numara ikinci kez verilemez.
//
// Liste tablo değil: kurulum başına iki üç seri var ve her satırın içinde
// düzenlenen bir sayaç alanı duruyor. Üç satırlık bir tabloya form kutusu
// koymak, tablonun sütun hizasını satırın içindeki kontrole feda ediyordu.

export function SeriesManager() {
  const qc = useQueryClient();
  const [type, setType] = useState<DocumentType>("WAYBILL");
  const [prefix, setPrefix] = useState("");
  const [padding, setPadding] = useState("6");
  const [startFrom, setStartFrom] = useState("0");
  const [externalOnly, setExternalOnly] = useState(false);

  const query = useQuery({
    queryKey: ["document-series"],
    queryFn: () =>
      apiGet<{ series: DocumentSeriesRow[] }>("/api/admin/document-series"),
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["document-series"] });

  const create = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/document-series", {
        type,
        prefix: prefix.trim().toUpperCase(),
        padding: Number(padding) || 6,
        startFrom: Number(startFrom) || 0,
        isDefault: true,
        externalOnly,
      }),
    onSuccess: () => {
      setPrefix("");
      setStartFrom("0");
      setExternalOnly(false);
      invalidate();
    },
  });

  const rows = query.data?.series ?? [];

  return (
    <Panel title="Seriler" bodyClassName="p-0">
      {/* Ekleme şeridi gömük zeminde — tablo başlığıyla aynı yüzey. */}
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-sunken p-3">
        <div>
          <Label htmlFor="ser-type">Belge türü</Label>
          <Select
            id="ser-type"
            className="w-40"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
          >
            <option value="WAYBILL">{DOCUMENT_TYPE_LABELS.WAYBILL}</option>
            <option value="INVOICE">{DOCUMENT_TYPE_LABELS.INVOICE}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ser-prefix" hint="IRS, FTR…">
            Ön ek
          </Label>
          <TextInput
            id="ser-prefix"
            className="w-28"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Label htmlFor="ser-pad" hint="basamak">
            Genişlik
          </Label>
          <TextInput
            id="ser-pad"
            type="number"
            min={1}
            max={12}
            className="w-24"
            value={padding}
            onChange={(e) => setPadding(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ser-start" hint="devam edilecek son numara">
            Sayaç
          </Label>
          <TextInput
            id="ser-start"
            type="number"
            min={0}
            className="w-28"
            value={startFrom}
            onChange={(e) => setStartFrom(e.target.value)}
          />
        </div>
        {/* Kutu, yanındaki girdilerin etiketi kadar aşağıda dursun diye
            sarmalanıyor: `Checkbox`un className'i kutunun kendisine gidiyor. */}
        <div className="pb-2.5">
          <Checkbox
            checked={externalOnly}
            onChange={(e) => setExternalOnly(e.target.checked)}
            label="Numarayı ERP veriyor"
          />
        </div>
        <Button
          disabled={!prefix.trim()}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          Ekle
        </Button>
      </div>

      <div className="p-4">
        <ErrorLine error={create.error} />
        <ErrorLine error={query.error} />

        {query.isLoading && <LoadingState />}

        {query.data &&
          (rows.length === 0 ? (
            <EmptyState label="Henüz seri yok. İrsaliye ve fatura kesebilmek için her tür için bir seri tanımlayın." />
          ) : (
            <ul className="space-y-2">
              {rows.map((s) => (
                <SeriesRow key={s.id} series={s} onChanged={invalidate} />
              ))}
            </ul>
          ))}
      </div>
    </Panel>
  );
}

function SeriesRow({
  series,
  onChanged,
}: {
  series: DocumentSeriesRow;
  onChanged: () => void;
}) {
  const [counter, setCounter] = useState(String(series.lastNumber));

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch(`/api/admin/document-series/${series.id}`, body),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/admin/document-series/${series.id}`),
    onSuccess: onChanged,
  });

  const used = series.lastNumber > 0;

  return (
    <li className="rounded border border-line p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink">
            <span className="font-medium">
              {DOCUMENT_TYPE_LABELS[series.type]}
            </span>
            <span className="tech-num">{series.prefix}</span>
            {series.isDefault && <Badge tone="success">Varsayılan</Badge>}
            {series.externalOnly && <Badge tone="warning">ERP</Badge>}
          </p>
          <p className="mt-1 text-xs tabular-nums text-ink-faint">
            Son numara {series.lastNumber} · sıradaki {series.nextNumber}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor={`ctr-${series.id}`} hint="geri alınamaz">
              Sayaç
            </Label>
            <TextInput
              id={`ctr-${series.id}`}
              type="number"
              size="sm"
              min={series.lastNumber}
              className="w-28"
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={Number(counter) === series.lastNumber}
            loading={patch.isPending}
            onClick={() => patch.mutate({ startFrom: Number(counter) })}
          >
            Kaydet
          </Button>
          {!series.isDefault && (
            <Button
              size="sm"
              variant="secondary"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ isDefault: true })}
            >
              Varsayılan yap
            </Button>
          )}
          <Button
            size="sm"
            variant="dangerQuiet"
            disabled={used}
            loading={remove.isPending}
            title={used ? "Numara vermiş seri silinemez" : undefined}
            onClick={() => {
              if (confirm(`${series.prefix} serisi silinsin mi?`))
                remove.mutate();
            }}
          >
            Sil
          </Button>
        </div>
      </div>
      <ErrorLine error={patch.error ?? remove.error} />
    </li>
  );
}
