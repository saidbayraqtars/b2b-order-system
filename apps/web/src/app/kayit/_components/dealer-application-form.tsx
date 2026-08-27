"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { dealerApplicationSchema } from "@repo/types";
import { Stagger } from "@/components/auth-shell";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  TextArea,
  TextInput,
} from "@/components/form";

/**
 * Başvuru formu.
 *
 * Alanlar bilerek az ve hiçbiri ticari şart sormuyor: kredi limiti, vade,
 * müşteri grubu, fiyat listesi burada yok. Onlar başvuranın söyleyeceği şeyler
 * değil, onaylayanın karar verdiği şeyler — forma konsaydı, başvuran kendi
 * limitini yazdığı bir belge doldurmuş olurdu.
 *
 * Doğrulama sunucudakiyle **aynı şemadan** okunuyor (`dealerApplicationSchema`).
 * İkinci bir istemci kuralı yazmak, formun kabul edip ucun reddettiği bir alan
 * demektir.
 */
export function DealerApplicationForm() {
  const [form, setForm] = useState({
    companyName: "",
    taxNumber: "",
    taxOffice: "",
    city: "",
    district: "",
    contactName: "",
    email: "",
    phone: "",
    note: "",
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = dealerApplicationSchema.safeParse({ ...form, consent });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Formu kontrol edin");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/dealer-applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    }).catch(() => null);
    setLoading(false);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? "Başvuru gönderilemedi, tekrar deneyin");
      return;
    }
    const body = (await res.json()) as { message?: string };
    setSent(body.message ?? "Başvurunuz alındı.");
  }

  if (sent) {
    /**
     * Başarı ekranı hesabın açıldığını **söylemiyor**, çünkü açılmadı. Aynı
     * ekran, e-postası zaten kayıtlı olan ya da hız sınırına takılan gönderim
     * için de çıkıyor: uç, kayıtlı adresleri sorgulayan bir araca dönüşmesin
     * diye her durumda aynı cevabı veriyor (bkz. dealer-application.ts).
     */
    return (
      <div className="animate-fade-up text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-positive/30 bg-positive/10">
          <CheckCircle2 className="h-5 w-5 text-positive" />
        </span>
        <h2 className="mt-4 text-headline-sm text-ink">Başvurunuz alındı</h2>
        <p className="mt-2 text-body-sm text-ink-muted">{sent}</p>
        <p className="mt-4 text-xs text-ink-faint">
          Onaylandığında portal hesabınız açılır ve şifre belirleme bağlantısı
          bu adrese gönderilir.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block text-body-sm text-ink-faint underline underline-offset-4 transition-colors hover:text-ink"
        >
          Giriş ekranına dön
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Stagger index={0}>
        <Label htmlFor="companyName">Firma ünvanı</Label>
        <TextInput
          id="companyName"
          placeholder="Örnek Gıda Ticaret Ltd. Şti."
          value={form.companyName}
          onChange={(e) => set("companyName")(e.target.value)}
          autoComplete="organization"
          autoFocus
        />
      </Stagger>

      <Stagger index={1} className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="taxNumber" hint="(isteğe bağlı)">
            Vergi / TC no
          </Label>
          <TextInput
            id="taxNumber"
            inputMode="numeric"
            placeholder="1234567890"
            value={form.taxNumber}
            onChange={(e) => set("taxNumber")(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="taxOffice" hint="(isteğe bağlı)">
            Vergi dairesi
          </Label>
          <TextInput
            id="taxOffice"
            placeholder="Kadıköy"
            value={form.taxOffice}
            onChange={(e) => set("taxOffice")(e.target.value)}
          />
        </div>
      </Stagger>

      <Stagger index={2} className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="city">İl</Label>
          <TextInput
            id="city"
            placeholder="İstanbul"
            value={form.city}
            onChange={(e) => set("city")(e.target.value)}
            autoComplete="address-level1"
          />
        </div>
        <div>
          <Label htmlFor="district" hint="(isteğe bağlı)">
            İlçe
          </Label>
          <TextInput
            id="district"
            placeholder="Ataşehir"
            value={form.district}
            onChange={(e) => set("district")(e.target.value)}
            autoComplete="address-level2"
          />
        </div>
      </Stagger>

      <Stagger index={3}>
        <Label htmlFor="contactName">Yetkili adı soyadı</Label>
        <TextInput
          id="contactName"
          placeholder="Ayşe Yılmaz"
          value={form.contactName}
          onChange={(e) => set("contactName")(e.target.value)}
          autoComplete="name"
        />
      </Stagger>

      <Stagger index={4} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">E-posta</Label>
          <TextInput
            id="email"
            type="email"
            placeholder="ad@firma.com"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="phone">Telefon</Label>
          <TextInput
            id="phone"
            type="tel"
            placeholder="0532 000 00 00"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            autoComplete="tel"
          />
        </div>
      </Stagger>

      <Stagger index={5}>
        <Label htmlFor="note" hint="(isteğe bağlı)">
          Eklemek istedikleriniz
        </Label>
        <TextArea
          id="note"
          placeholder="Faaliyet alanınız, şube sayınız, ilgilendiğiniz ürün grupları…"
          value={form.note}
          onChange={(e) => set("note")(e.target.value)}
          rows={3}
        />
      </Stagger>

      <Stagger index={6}>
        <Checkbox
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          label="Başvuru formundaki bilgilerin değerlendirme amacıyla işlenmesini kabul ediyorum."
        />
      </Stagger>

      <ErrorLine error={error ? new Error(error) : null} />

      <Stagger index={7} className="mt-1">
        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Gönderiliyor…" : "Başvuruyu gönder"}
        </Button>
      </Stagger>

      <Stagger index={8}>
        <p className="text-center text-xs text-ink-faint">
          Başvuru göndermek hesap açmaz. Değerlendirme sonucunu e-posta ile
          bildiririz.
        </p>
      </Stagger>
    </form>
  );
}
