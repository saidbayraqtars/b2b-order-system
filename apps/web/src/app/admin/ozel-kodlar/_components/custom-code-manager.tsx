"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SaveCustomCodeFieldResult } from "@repo/services";
import type { CustomCodeEntity, CustomCodeFieldView } from "@repo/types";
import { apiPut } from "@/lib/fetcher";
import { useUrlState } from "@/lib/url-state";
import { useCustomCodeFields } from "@/components/custom-codes";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  TextArea,
  TextInput,
  WarnLine,
} from "@/components/form";
import { LoadingState, Tabs } from "@/components/ui";

/** Sekme adreste (`?varlik=firma`): ekran görüntüsü betiği düğmeye basmıyor. */
const TAB_DEFAULTS = { varlik: "urun" };

const TABS = [
  { key: "urun", label: "Ürün" },
  { key: "firma", label: "Firma" },
] as const;

export function CustomCodeManager() {
  const tab = useUrlState(TAB_DEFAULTS);
  const entity: CustomCodeEntity = tab.value.varlik === "firma" ? "COMPANY" : "PRODUCT";
  const { query, all } = useCustomCodeFields(entity);

  return (
    <div className="space-y-4">
      <Tabs
        value={entity === "COMPANY" ? "firma" : "urun"}
        onChange={(next) => tab.set({ varlik: next })}
        items={TABS}
      />
      <p className="text-body-sm text-ink-muted">
        Her alan bir yuvadır; adı ekranlarda, raporlarda ve kampanya kurallarında
        görünür. Seçenek listesi verirseniz değer listeden seçilir, vermezseniz
        serbest yazılır. Kapattığınız alanın değerleri silinmez — yeniden
        açtığınızda yerinde olur.
      </p>
      {query.isLoading && <LoadingState />}
      <ErrorLine error={query.error} />
      <div className="space-y-3">
        {all.map((f) => (
          <FieldRow key={`${entity}-${f.slot}`} field={f} />
        ))}
      </div>
    </div>
  );
}

function FieldRow({ field }: { field: CustomCodeFieldView }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(field.defined ? field.label : "");
  const [isActive, setIsActive] = useState(field.isActive);
  const [options, setOptions] = useState(field.options.join("\n"));
  const [showInCatalogFilter, setShow] = useState(field.showInCatalogFilter);
  const [outside, setOutside] = useState(0);

  useEffect(() => {
    setLabel(field.defined ? field.label : "");
    setIsActive(field.isActive);
    setOptions(field.options.join("\n"));
    setShow(field.showInCatalogFilter);
  }, [field]);

  const save = useMutation({
    mutationFn: () =>
      apiPut<SaveCustomCodeFieldResult>(
        `/api/admin/custom-codes/${field.entity}/${field.slot}`,
        {
          label: label.trim(),
          isActive,
          options: options.split("\n").map((o) => o.trim()).filter(Boolean),
          showInCatalogFilter,
        },
      ),
    onSuccess: (res) => {
      setOutside(res.outsideOptions);
      void qc.invalidateQueries({ queryKey: ["admin", "custom-codes"] });
    },
  });

  const dirty =
    label.trim() !== (field.defined ? field.label : "") ||
    isActive !== field.isActive ||
    options.trim() !== field.options.join("\n") ||
    showInCatalogFilter !== field.showInCatalogFilter;

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="grid gap-3 sm:grid-cols-[4rem_1fr_1fr]">
        <div className="text-body-sm text-ink-faint">
          <span className="block text-xs">Yuva</span>
          <span className="font-mono text-ink">{field.slot}</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`label-${field.entity}-${field.slot}`}>Alan adı</Label>
          <TextInput
            id={`label-${field.entity}-${field.slot}`}
            value={label}
            placeholder={`Özel kod ${field.slot}`}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              label="Kullanımda"
            />
            {field.entity === "PRODUCT" && (
              <Checkbox
                checked={showInCatalogFilter}
                onChange={(e) => setShow(e.target.checked)}
                label="Katalogda süzgeç olarak göster"
              />
            )}
          </div>
        </div>
        <div>
          <Label
            htmlFor={`options-${field.entity}-${field.slot}`}
            hint="(her satıra bir seçenek; boş = serbest metin)"
          >
            Seçenekler
          </Label>
          <TextArea
            id={`options-${field.entity}-${field.slot}`}
            rows={3}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          disabled={!dirty || !label.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {!label.trim() && dirty && (
          <span className="text-xs text-ink-faint">Kaydetmek için alana bir ad verin.</span>
        )}
      </div>
      <ErrorLine error={save.error} />
      {outside > 0 && (
        <WarnLine className="mt-2">
          {outside} kayıtta bu alanın değeri seçenek listesinde yok. Değerler
          silinmedi; kayıtlar düzenlenirken listeden seçilmesi istenecek.
        </WarnLine>
      )}
    </div>
  );
}
