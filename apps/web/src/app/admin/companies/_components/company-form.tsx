"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CompanyRow,
  CustomerGroupRow,
  PaymentTermRow,
  VolumeTierRow,
} from "@repo/services";
import {
  PAYMENT_METHOD_LABELS,
  PaymentMethodEnum,
  VOLUME_DISCOUNT_MODE_LABELS,
  VolumeDiscountModeEnum,
  type PaymentMethod,
  type VolumeDiscountMode,
} from "@repo/types";
import { apiGet, apiPatch, apiPost } from "@/lib/fetcher";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  Select,
  TextInput,
} from "@/components/form";
import { CollapsibleFieldset } from "@/components/disclosure";
import {
  CustomCodeInputs,
  EMPTY_CUSTOM_CODES,
  customCodePayload,
  useCustomCodeFields,
  type CustomCodeForm,
} from "@/components/custom-codes";

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
  /** Boş dize = genel kural geçerli; "0" = bu müşteri muaf. */
  minOrderAmount: string;
  requiresOrderApproval: boolean;
  isActive: boolean;
  customerGroupId: string;
  salesRepId: string;
  /** Empty = no restriction: every method is offered at checkout. */
  allowedPaymentMethods: PaymentMethod[];
  /** Empty = no vade menu; the default term above applies silently. */
  paymentTermIds: string[];
  /** AUTO earns the hacim rung from turnover; MANUAL pins the one below. */
  volumeDiscountMode: VolumeDiscountMode;
  /** Only read under MANUAL; empty there means "no hacim discount at all". */
  volumeTierId: string;
  /** Özel kodlar — bölge, segment, kanal… */
  codes: CustomCodeForm;
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
      minOrderAmount: "",
      requiresOrderApproval: false,
      isActive: true,
      customerGroupId: "",
      salesRepId: "",
      allowedPaymentMethods: [],
      paymentTermIds: [],
      volumeDiscountMode: "AUTO",
      volumeTierId: "",
      codes: { ...EMPTY_CUSTOM_CODES },
    },
  );
  const codeFields = useCustomCodeFields("COMPANY");
  const set = <K extends keyof CompanyFormValues>(
    k: K,
    val: CompanyFormValues[K],
  ) => setV((prev) => ({ ...prev, [k]: val }));

  /** Toggle one id in a list-valued field, keeping the rest untouched. */
  const toggleIn = <K extends "allowedPaymentMethods" | "paymentTermIds">(
    k: K,
    id: CompanyFormValues[K][number],
  ) =>
    setV((prev) => {
      const list = prev[k] as string[];
      return {
        ...prev,
        [k]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      };
    });

  const groups = useQuery({
    queryKey: ["admin-customer-groups"],
    queryFn: () =>
      apiGet<{ groups: CustomerGroupRow[] }>("/api/admin/customer-groups"),
  });
  const terms = useQuery({
    queryKey: ["admin-payment-terms"],
    queryFn: () =>
      apiGet<{ terms: PaymentTermRow[] }>("/api/admin/payment-terms"),
  });
  const reps = useQuery({
    queryKey: ["admin-sales-reps"],
    queryFn: () =>
      apiGet<{ salesReps: { id: string; name: string }[] }>(
        "/api/admin/sales-reps",
      ),
  });
  const tiers = useQuery({
    queryKey: ["admin-volume-tiers"],
    queryFn: () =>
      apiGet<{ tiers: VolumeTierRow[] }>("/api/admin/volume-tiers"),
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
        // Boş bırakmak `null` gönderiyor: "genel kural geçerli". 0 yazmak
        // muafiyet — ikisi ayrı şey ve kutu boşken 0 göndermek, genel eşik
        // yükseldiğinde bu firmayı sessizce muaf bırakırdı.
        minOrderAmount:
          v.minOrderAmount.trim() === "" ? null : Number(v.minOrderAmount),
        requiresOrderApproval: v.requiresOrderApproval,
        isActive: v.isActive,
        customerGroupId: v.customerGroupId || (editing ? null : undefined),
        salesRepId: v.salesRepId || (editing ? null : undefined),
        // Always sent, empty included: an empty list is a real value here
        // ("no restriction" / "no menu"), and on update the service replaces
        // the whole set — so omitting it would make un-ticking impossible.
        allowedPaymentMethods: v.allowedPaymentMethods,
        paymentTermIds: v.paymentTermIds,
        volumeDiscountMode: v.volumeDiscountMode,
        // Cleared deliberately when the mode is AUTO: leaving a stale pin behind
        // would make the company page claim a rung the pricing path ignores.
        volumeTierId:
          v.volumeDiscountMode === "MANUAL" && v.volumeTierId
            ? v.volumeTierId
            : editing
              ? null
              : undefined,
        ...customCodePayload(v.codes, codeFields.all),
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
          <TextInput
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
          />
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
          <TextInput
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
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
          <Label hint="boş = genel kural, 0 = muaf">Asgari sipariş (₺)</Label>
          <TextInput
            type="number"
            min={0}
            step="0.01"
            placeholder="genel kural"
            value={v.minOrderAmount}
            onChange={(e) => set("minOrderAmount", e.target.value)}
          />
        </label>
        {/* Firma para birimi alanı kaldırıldı: defter TL ve buraya "USD"
            yazmak hiçbir hesabı değiştirmiyor, yalnızca ekstre belgesine
            yanlış bir satır bastırıyordu. Döviz, ürünün liste fiyatında
            (`/admin/products` → fiyat satırı) seçiliyor. */}
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
          <Select
            value={v.salesRepId}
            onChange={(e) => set("salesRepId", e.target.value)}
          >
            <option value="">— atanmamış —</option>
            {(reps.data?.salesReps ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {codeFields.active.length > 0 && (
        <CollapsibleFieldset
          className="mt-5"
          legend="Özel kodlar"
          storageKey="company-form:codes"
          summary={
            codeFields.active
              .filter((f) => v.codes[f.key])
              .map((f) => `${f.label}: ${v.codes[f.key]}`)
              .join(" · ") || "boş"
          }
        >
          <CustomCodeInputs
            entity="COMPANY"
            value={v.codes}
            onChange={(codes) => set("codes", codes)}
          />
        </CollapsibleFieldset>
      )}

      {/* İki alan kümesi de kapalı başlıyor: firma ekranında günlük iş
          yukarıdaki künye ve iletişim alanları, bunlar ayda bir dokunulan
          sözleşme ayarları. İkisi de uzun açıklama paragrafı taşıyor —
          metin kısaltılmıyor, katlanıyor. */}
      <CollapsibleFieldset
        className="mt-5"
        legend="Ödemede sunulacaklar"
        storageKey="company-form:payment"
        summary={
          v.allowedPaymentMethods.length === 0 && v.paymentTermIds.length === 0
            ? "kısıtlama yok"
            : `${v.allowedPaymentMethods.length || "tüm"} yöntem · ${
                v.paymentTermIds.length || "varsayılan"
              } vade`
        }
      >
        <p className="mb-2 text-xs text-ink-faint">
          Ödeme yöntemi — <strong>hiçbiri seçilmezse hepsi sunulur.</strong>{" "}
          Kısıtlamak istemiyorsanız boş bırakın.
        </p>
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
          {PaymentMethodEnum.options.map((m) => (
            <Checkbox
              key={m}
              checked={v.allowedPaymentMethods.includes(m)}
              onChange={() => toggleIn("allowedPaymentMethods", m)}
              label={<>{PAYMENT_METHOD_LABELS[m]}</>}
            />
          ))}
        </div>

        <p className="mb-2 text-xs text-ink-faint">
          Vade seçenekleri — boş bırakılırsa müşteriye menü çıkmaz, sipariş
          yukarıdaki varsayılan vadeyi alır. Tanımlar <strong>Vadeler</strong>{" "}
          sayfasında yapılır.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(terms.data?.terms ?? [])
            .filter((t) => t.isActive || v.paymentTermIds.includes(t.id))
            .map((t) => (
              <Checkbox
                key={t.id}
                checked={v.paymentTermIds.includes(t.id)}
                onChange={() => toggleIn("paymentTermIds", t.id)}
                label={
                  <>
                    {t.name}
                    <span className="ml-1 text-ink-faint">
                      ({t.days === 0 ? "peşin" : `${t.days}g`})
                    </span>
                  </>
                }
              />
            ))}
          {terms.data?.terms.length === 0 && (
            <span className="text-body-sm text-ink-faint">
              Henüz vade tanımı yok.
            </span>
          )}
        </div>
      </CollapsibleFieldset>

      <CollapsibleFieldset
        className="mt-5"
        legend="Hacim iskontosu"
        storageKey="company-form:volume"
        summary={VOLUME_DISCOUNT_MODE_LABELS[v.volumeDiscountMode]}
      >
        <p className="mb-3 text-xs text-ink-faint">
          Otomatikte firma, cirosuyla hak ettiği en yüksek basamağı
          kendiliğinden alır. Elle atadığınızda ciroya hiç bakılmaz —
          sözleşmeyle söz verilmiş bir oran, düşük geçen bir çeyrekte
          kaybolmasın diye. Basamak seçmezseniz bu firma hacim iskontosu almaz.
          Tanımlar <strong>Hacim</strong> sayfasında yapılır.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <Label>Belirleme şekli</Label>
            <Select
              value={v.volumeDiscountMode}
              onChange={(e) =>
                set("volumeDiscountMode", e.target.value as VolumeDiscountMode)
              }
            >
              {VolumeDiscountModeEnum.options.map((m) => (
                <option key={m} value={m}>
                  {VOLUME_DISCOUNT_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </label>
          {v.volumeDiscountMode === "MANUAL" && (
            <label>
              <Label hint="boş = iskonto yok">Basamak</Label>
              <Select
                value={v.volumeTierId}
                onChange={(e) => set("volumeTierId", e.target.value)}
              >
                <option value="">— yok —</option>
                {(tiers.data?.tiers ?? [])
                  // A retired rung stays selectable while it is the one in
                  // force: the customer keeps the rate, and the admin can see
                  // what that rate is instead of an empty box.
                  .filter((t) => t.isActive || t.id === v.volumeTierId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (%{t.discountPercent})
                      {t.isActive ? "" : " — pasif"}
                    </option>
                  ))}
              </Select>
            </label>
          )}
        </div>
      </CollapsibleFieldset>

      <div className="mt-3 flex flex-wrap gap-5">
        <Checkbox
          checked={v.requiresOrderApproval}
          onChange={(e) => set("requiresOrderApproval", e.target.checked)}
          label="Personel siparişleri yönetici onayı istesin"
        />
        <Checkbox
          checked={v.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          label="Aktif"
        />
      </div>

      <div className="mt-4">
        <Button
          disabled={save.isPending || !v.name.trim()}
          onClick={() => save.mutate()}
        >
          {editing ? "Kaydet" : "Firmayı oluştur"}
        </Button>
      </div>
      <ErrorLine error={save.error} />
    </Panel>
  );
}
