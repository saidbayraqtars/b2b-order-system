"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ErpPushStatus, ErpWriteOrderResult } from "@repo/services";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Panel } from "@/components/form";
import { Badge, LoadingState } from "@/components/ui";

// "ERP'ye aktar" — üç katmanlı kilidin insan katmanı.
//
// Belge kendiliğinden gitmiyor. Sipariş onaylandıktan sonra `erp.push` yetkisi
// olan biri buraya basıyor, ajan da kendi tarafındaki kilit açıksa yazıyor.
// Otomatik aktarım bilerek yok: müşterinin muhasebe veritabanına yazan bir
// akışın, kimsenin görmediği bir zamanlayıcıdan tetiklenmesi istenmiyor.
//
// Aktarılmış sipariş bir daha aktarılmaz ve düğme kaybolur — yerini ERP'deki
// belge numarası alır. Mükerrer kayıt, müşterinin muhasebesinde iki kez sayılan
// bir sipariş demek.

interface Props {
  orderId: string;
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR");
}

export function ErpPanel({ orderId }: Props) {
  const qc = useQueryClient();
  const [written, setWritten] = useState<ErpWriteOrderResult | null>(null);

  const status = useQuery({
    queryKey: ["order-erp", orderId],
    queryFn: () => apiGet<ErpPushStatus>(`/api/orders/${orderId}/erp`),
    // Yetkisi olmayanda 403 dönüyor; panel o zaman hiç çizilmiyor.
    retry: false,
  });

  const push = useMutation({
    mutationFn: () =>
      apiPost<ErpWriteOrderResult>(`/api/orders/${orderId}/erp`, {}),
    onSuccess: (result) => {
      setWritten(result);
      void qc.invalidateQueries({ queryKey: ["order-erp", orderId] });
    },
  });

  // Yetki yoksa (403) ya da ortam tanımlı değilse ekranda yer kaplamıyor: bu
  // kurulumda ERP köprüsü olmayabilir ve olmayan bir şeyin boş kutusu, bir
  // ayarın eksik olduğunu düşündürür.
  if (status.isLoading) return <LoadingState />;
  if (status.error || !status.data?.configured) return null;

  const s = status.data;

  return (
    <Panel
      title="ERP'ye aktarım"
      action={
        s.documentNo ? (
          <Badge tone="success">Aktarıldı</Badge>
        ) : (
          <Badge tone="neutral">Aktarılmadı</Badge>
        )
      }
    >
      {s.documentNo ? (
        <div className="space-y-1 text-sm">
          <p>
            ERP belge numarası:{" "}
            <span className="font-medium tabular-nums">{s.documentNo}</span>
            {s.documentInd != null && (
              <span className="text-neutral-500"> (IND {s.documentInd})</span>
            )}
          </p>
          <p className="text-neutral-500">
            {s.pushedAt ? dateTime(s.pushedAt) : "—"}
            {s.pushedByName ? ` · ${s.pushedByName}` : ""}
          </p>
          <p className="text-neutral-500">
            Belge ERP&apos;de <strong>alınan sipariş</strong> olarak duruyor.
            Faturaya çevirme ve e-fatura gönderimi ERP&apos;nin kendi ekranından
            yapılır.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-neutral-500">
            Sipariş, ERP&apos;ye <strong>alınan sipariş</strong> olarak yazılır
            — yasal belge değil. Cari ve stok kodları ERP&apos;de eşleşmiyorsa
            hiçbir şey yazılmaz. Kargo bedeli satır olarak girmez, belgenin
            notuna yazılır.
          </p>

          {s.reason ? (
            <p className="text-sm text-amber-700 dark:text-amber-500">
              {s.reason}
            </p>
          ) : (
            <Button
              onClick={() => push.mutate()}
              loading={push.isPending}
              disabled={!s.canPush}
            >
              ERP&apos;ye aktar
            </Button>
          )}

          {s.error && !push.isPending && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Son deneme başarısız: {s.error}
            </p>
          )}
          <ErrorLine error={push.error} />
        </div>
      )}

      {written && (
        <div className="mt-3 space-y-1 text-sm">
          {written.duplicate && (
            <p className="text-neutral-500">
              Belge ERP&apos;de zaten vardı; yeniden yazılmadı.
            </p>
          )}
          {written.omittedColumns.length > 0 && (
            // Eksik sütun belgeyi düşürmüyor (şemaya uyumlu INSERT), ama neyin
            // yazılamadığını operatörün görmesi gerekiyor.
            <p className="text-neutral-500">
              Bu ERP kurulumunda bulunmayan alanlar yazılamadı:{" "}
              {written.omittedColumns.join(", ")}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
