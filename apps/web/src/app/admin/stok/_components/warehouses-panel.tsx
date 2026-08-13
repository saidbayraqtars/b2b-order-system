"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WarehouseRow } from "@repo/services";
import { apiGet, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, TextInput } from "@/components/form";
import { Badge, EmptyState, LoadingState } from "@/components/ui";

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
    queryFn: () => apiGet<{ warehouses: WarehouseRow[] }>("/api/admin/warehouses"),
  });

  const save = useMutation({
    mutationFn: (input: { code: string; name: string; isDefault?: boolean; isActive?: boolean }) =>
      apiPost("/api/admin/warehouses", input),
    onSuccess: () => {
      setCode("");
      setName("");
      void qc.invalidateQueries({ queryKey: ["warehouses"] });
      void qc.invalidateQueries({ queryKey: ["stock-levels"] });
    },
  });

  const rows = warehouses.data?.warehouses ?? [];

  return (
    <Panel title="Depolar">
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <label>
          <Label hint="ERP ambar kodu">Kod</Label>
          <TextInput
            value={code}
            placeholder="MERKEZ"
            onChange={(e) => setCode(e.target.value)}
            className="w-32"
          />
        </label>
        <label className="min-w-40 flex-1">
          <Label>Ad</Label>
          <TextInput
            value={name}
            placeholder="Merkez depo"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
      <ErrorLine error={save.error} />

      {warehouses.isLoading && <LoadingState />}
      <ErrorLine error={warehouses.error} />

      {warehouses.data &&
        (rows.length === 0 ? (
          <EmptyState label="Depo tanımlı değil — tek depolu çalışıyorsunuz." />
        ) : (
          <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
            {rows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="flex flex-wrap items-center gap-2">
                  <strong>{w.name}</strong>
                  <span className="text-neutral-500">{w.code}</span>
                  {w.isDefault && <Badge tone="success">Varsayılan</Badge>}
                  {!w.isActive && <Badge tone="neutral">Kapalı</Badge>}
                </span>
                <span className="flex gap-2">
                  {!w.isDefault && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        save.mutate({ code: w.code, name: w.name, isDefault: true })
                      }
                    >
                      Varsayılan yap
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      save.mutate({ code: w.code, name: w.name, isActive: !w.isActive })
                    }
                  >
                    {w.isActive ? "Kapat" : "Aç"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Panel>
  );
}
