"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WarehouseRow } from "@repo/services";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import {
  Badge,
  LoadingState,
  Note,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";

// Depolar. Tek depolu kurulumda hiç açılmaz ve ekranın geri kalanı depo
// bilmeden çalışır — hareketin deposu isteğe bağlı.
//
// Anahtar **kod**, ad değil: ERP köprüsü ambarları kodla eşliyor, deponun adını
// düzeltmek eşlemeyi bozmamalı. Bu yüzden aynı kodla kayıt, yeni depo açmaz;
// var olanı günceller.

export function WarehousesPanel() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const warehouses = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      apiGet<{ warehouses: WarehouseRow[] }>("/api/admin/warehouses"),
  });

  const save = useMutation({
    mutationFn: (input: {
      code: string;
      name: string;
      isDefault?: boolean;
      isActive?: boolean;
    }) => apiPost("/api/admin/warehouses", input),
    onSuccess: () => {
      setCode("");
      setName("");
      void qc.invalidateQueries({ queryKey: ["warehouses"] });
      void qc.invalidateQueries({ queryKey: ["stock-levels"] });
    },
  });

  const rows = warehouses.data?.warehouses ?? [];

  return (
    <>
      <Panel title="Depolar" bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-2 border-b border-line bg-sunken p-3">
          <div>
            <Label htmlFor="wh-code" hint="ERP ambar kodu">
              Kod
            </Label>
            <TextInput
              id="wh-code"
              value={code}
              placeholder="MERKEZ"
              onChange={(e) => setCode(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="min-w-40 flex-1">
            <Label htmlFor="wh-name">Ad</Label>
            <TextInput
              id="wh-name"
              value={name}
              placeholder="Merkez depo"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            disabled={code.trim() === "" || name.trim() === ""}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                code: code.trim(),
                name: name.trim(),
                isDefault: rows.length === 0,
              })
            }
          >
            Kaydet
          </Button>
        </div>

        <div className="px-4">
          <ErrorLine error={save.error} />
          <ErrorLine error={warehouses.error} />
        </div>
        {warehouses.isLoading && (
          <div className="px-4">
            <LoadingState />
          </div>
        )}

        {warehouses.data && (
          <Table>
            <THead>
              <tr>
                <Th>Depo</Th>
                <Th>Kod</Th>
                <Th>Durum</Th>
                <Th />
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty
                  colSpan={4}
                  label="Depo tanımlı değil — tek depolu çalışıyorsunuz."
                />
              ) : (
                rows.map((w) => (
                  <tr key={w.id}>
                    <Td>{w.name}</Td>
                    <Td className="tech-num">{w.code}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {w.isDefault && (
                          <Badge tone="success">Varsayılan</Badge>
                        )}
                        {!w.isActive && <Badge tone="neutral">Kapalı</Badge>}
                      </div>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        {!w.isDefault && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              save.mutate({
                                code: w.code,
                                name: w.name,
                                isDefault: true,
                              })
                            }
                          >
                            Varsayılan yap
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            save.mutate({
                              code: w.code,
                              name: w.name,
                              isActive: !w.isActive,
                            })
                          }
                        >
                          {w.isActive ? "Kapat" : "Aç"}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </TBody>
          </Table>
        )}
      </Panel>

      <Note collapsible defaultOpen={false}>
        Depo <strong>silinmiyor, kapatılıyor</strong>: kapalı depo yeni
        hareketlere açılmaz ama geçmiş hareketlerin üstünde adı yazılı kalır.
        Kayıt anahtarı ad değil <strong>kod</strong> — aynı kodla kaydetmek yeni
        depo açmaz, var olanın adını düzeltir; ERP ambarları o kodla eşleştiği
        için ad değişikliği eşlemeyi bozmamalı.
      </Note>
    </>
  );
}
