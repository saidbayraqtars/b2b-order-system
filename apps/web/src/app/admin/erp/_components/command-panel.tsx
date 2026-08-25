"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Panel } from "@/components/form";

// Ajanla konuşma — kurulum sırasında bakılan iki şey.
//
// Yazmayı açmadan önceki kontrol listesinin (Vega kılavuzu §43.2) ilk adımı
// "tabloların gerçek hâline bak". Bu panel o adımı ekrana getiriyor; olmasaydı
// operatörün elinde curl'den başka bir şey olmazdı.
//
// Buradan **yazan komut çağrılamaz**. Uç, adı yalnızca okuyan iki komutla
// sınırlıyor; bir belge, siparişinin kendi ekranındaki onaydan gider.

const COMMANDS = [
  { name: "ping", label: "Ajanı yokla", hint: "Tünel ayakta mı, yazma açık mı" },
  {
    name: "describeOrderTables",
    label: "Sipariş tablolarını incele",
    hint: "Gerçek sütunlar, belge serileri, örnek bir sipariş",
  },
] as const;

export function CommandPanel() {
  const [output, setOutput] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (command: string) =>
      apiPost<{ command: string; result: unknown }>("/api/admin/erp/command", { command }),
    onSuccess: (data) => setOutput(JSON.stringify(data.result, null, 2)),
    onError: () => setOutput(null),
  });

  return (
    <Panel title="Ajanla bağlantı">
      <div className="flex flex-wrap gap-2">
        {COMMANDS.map((c) => (
          <Button
            key={c.name}
            variant="secondary"
            onClick={() => run.mutate(c.name)}
            loading={run.isPending && run.variables === c.name}
            title={c.hint}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <ErrorLine error={run.error} />

      {output && (
        <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-neutral-50 p-3 text-xs dark:bg-neutral-950">
          {output}
        </pre>
      )}

      <p className="mt-3 text-sm text-neutral-500">
        Bu iki komut ERP&apos;yi yalnızca <strong>okur</strong>. Sipariş aktarımı
        buradan değil, siparişin kendi ekranından yapılır.{" "}
        <em>Sipariş tablolarını incele</em> çıktısında bakılacaklar:{" "}
        <code>configured.referenceColumnExists</code> (sipariş numarasının
        yazılacağı sütun bu kurulumda var mı), <code>series</code> (kendi
        önekimiz Vega&apos;nın serileriyle çakışmamalı) ve{" "}
        <code>sampleHeader</code> (Vega&apos;nın kendi yazdığı son sipariş neye
        benziyor).
      </p>
    </Panel>
  );
}
