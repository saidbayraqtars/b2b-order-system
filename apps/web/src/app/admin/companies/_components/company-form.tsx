"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CompanyRow, CustomerGroupRow } from "@repo/services";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import { Button, ErrorLine, Label, Panel, Select, TextInput } from "@/components/form";

// Company create / edit. The same form serves both; `company` decides which.

export interface CompanyFormValues {
  id?: string;
  name: string;
  taxNumber: string;
  taxOffice: string;
  email: string;
  phone: string;
  creditLimit: string;
  paymentTermDays: string;
  currency: string;
  requiresOrderApproval: boolean;
  isActive: boolean;
  customerGroupId: string;
  salesRepId: string;
}

export function CompanyForm({ company }: { company?: CompanyFormValues }) {
  const router = useRouter();
  const editing = Boolean(company?.id);

  const [v, setV] = useState<CompanyFormValues>(
    company ?? {
      name: "",
      taxNumber: "",
      taxOffice: "",
      email: "",
      phone: "",
      creditLimit: "0",
      paymentTermDays: "0",
      currency: "TRY",
      requiresOrderApproval: false,
      isActive: true,
      customerGroupId: "",
      salesRepId: "",
    },
  );
  const set = <K extends keyof CompanyFormValues>(k: K, val: CompanyFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const groups = useQuery({
    queryKey: ["admin-customer-groups"],
    queryFn: () => apiGet<{ groups: CustomerGroupRow[] }>("/api/admin/customer-groups"),
  });
  const reps = useQuery({
    queryKey: ["admin-sales-reps"],
    queryFn: () =>
      apiGet<{ salesReps: { id: string; name: string }[] }>("/api/admin/sales-reps"),
  });

  const save = useMutation({
    mutationFn: async () => {
      // Empty strings mean "not set"; null clears a relation on update, while a
      // create simply omits the field.
      const body = {
        name: v.name,
        taxNumber: v.taxNumber || (editing ? null : undefined),
        taxOffice: v.taxOffice || (editing ? null : undefined),
        email: v.email || (editing ? null : undefined),
        phone: v.phone || (editing ? null : undefined),
        creditLimit: Number(v.creditLimit || 0),
        paymentTermDays: Number(v.paymentTermDays || 0),
        currency: v.currency || "TRY",
        requiresOrderApproval: v.requiresOrderApproval,
        isActive: v.isActive,
        customerGroupId: v.customerGroupId || (editing ? null : undefined),
        salesRepId: v.salesRepId || (editing ? null : undefined),
      };
      if (editing) {
        await apiPatch(`/api/admin/companies/${company!.id}`, body);
        return company!.id!;
      }
      const created = await apiPost<{ company: CompanyRow }>(
        "/api/admin/companies",
        body,
      );
      return created.company.id;
    },
    onSuccess: (id) => {
      router.push(`/admin/companies/${id}`);
      router.refresh();
    },
  });

  return (
    <Panel title={editing ? "Firma bilgileri" : "Yeni firma"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="sm:col-span-2">
          <Label>Firma adı</Label>
          <TextInput value={v.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          <Label hint="10 veya 11 hane">Vergi / TC no</Label>
          <TextInput
            value={v.taxNumber}
            onChange={(e) => set("taxNumber", e.target.value)}
          />
        </label>
        <label>
          <Label>Vergi dairesi</Label>
          <TextInput
            value={v.taxOffice}
            onChange={(e) => set("taxOffice", e.target.value)}
          />
        </label>
        <label>
          <Label>E-posta</Label>
          <TextInput
            type="email"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>
        <label>
          <Label>Telefon</Label>
          <TextInput value={v.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label>
          <Label>Kredi limiti</Label>
          <TextInput
            type="number"
            min={0}
            step="0.01"
            value={v.creditLimit}
            onChange={(e) => set("creditLimit", e.target.value)}
          />
        </label>
        <label>
          <Label hint="yaşlandırma bu değere göre hesaplanır">Vade (gün)</Label>
          <TextInput
            type="number"
            min={0}
            max={365}
            value={v.paymentTermDays}
            onChange={(e) => set("paymentTermDays", e.target.value)}
          />
        </label>
        <label>
          <Label>Para birimi</Label>
          <TextInput
            value={v.currency}
            maxLength={3}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </label>
        <label>
          <Label>Müşteri grubu</Label>
          <Select
            value={v.customerGroupId}
            onChange={(e) => set("customerGroupId", e.target.value)}
          >
            <option value="">— yok —</option>
            {(groups.data?.groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Plasiyer</Label>
          <Select value={v.salesRepId} onChange={(e) => set("salesRepId", e.target.value)}>
            <option value="">— atanmamış —</option>
            {(reps.data?.salesReps ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.requiresOrderApproval}
            onChange={(e) => set("requiresOrderApproval", e.target.checked)}
          />
          Personel siparişleri yönetici onayı istesin
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Aktif
        </label>
      </div>

      <div className="mt-4">
        <Button disabled={save.isPending || !v.name.trim()} onClick={() => save.mutate()}>
          {editing ? "Kaydet" : "Firmayı oluştur"}
        </Button>
      </div>
      <ErrorLine error={save.error} />
    </Panel>
  );
}
