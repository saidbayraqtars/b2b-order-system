"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/fetcher";
import {
  LoadingState,
  Note,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
} from "@/components/ui";
import {
  Button,
  Checkbox,
  ErrorLine,
  Label,
  Panel,
  TextInput,
} from "@/components/form";

// Tatil takvimi girişi.
//
// İki şey bilerek böyle:
//
//  1. **Öneriler basılmıyor, öneriliyor.** Sabit tarihli millî günler tek
//     tıkla eklenebiliyor ama kendiliğinden eklenmiyor: kurulumun çalıştığı
//     gün sayısı bir iş bilgisi, varsayılan değil.
//  2. **Dinî bayramlar önerilmiyor.** Ay takvimine göre kayıyorlar; kodda
//     yazılı bir tarih ikinci yıl sessizce yanlış olur. Elle girilir.
//
// Yıl adres çubuğunda değil bileşen durumunda: bu bir sekme değil, bir
// gezinme oku — ekran görüntüsü açılış yılını gösteriyor ve doğru olan o.

interface Holiday {
  id: string;
  date: string;
  name: string;
  halfDay: boolean;
}

interface Payload {
  year: number;
  holidays: Holiday[];
  suggestions: Array<{ date: string; name: string }>;
}

function trDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
  });
}

/** Hafta sonuna düşen tatil iş gününü zaten düşürmüyor — satır bunu söyler. */
function isWeekend(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(y!, m! - 1, d!).getDay();
  return wd === 0 || wd === 6;
}

export function HolidayManager() {
  const qc = useQueryClient();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => apiGet<Payload>(`/api/admin/holidays?yil=${year}`),
  });

  const save = useMutation({
    mutationFn: (input: { date: string; name: string; halfDay: boolean }) =>
      apiPost("/api/admin/holidays", input),
    onSuccess: () => {
      setDate("");
      setName("");
      setHalfDay(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/holidays/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["holidays"] }),
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <LoadingState />;

  const rows = data?.holidays ?? [];
  const have = new Set(rows.map((r) => r.date));
  const missing = (data?.suggestions ?? []).filter((s) => !have.has(s.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setYear((y) => y - 1)}>
          ← {year - 1}
        </Button>
        <p className="text-headline-sm">{year}</p>
        <Button variant="ghost" onClick={() => setYear((y) => y + 1)}>
          {year + 1} →
        </Button>
      </div>

      <Panel title="Gün ekle">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
              setError("Gün seçilmedi");
              return;
            }
            if (name.trim().length < 2) {
              setError("Tatil adı gerekli");
              return;
            }
            save.mutate({ date, name: name.trim(), halfDay });
          }}
        >
          <div>
            <Label htmlFor="holiday-date">Gün</Label>
            <TextInput
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="holiday-name">Adı</Label>
            <TextInput
              id="holiday-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramazan Bayramı 1. gün"
              className="w-72"
            />
          </div>
          <Checkbox
            checked={halfDay}
            onChange={(e) => setHalfDay(e.target.checked)}
            label="Yarım gün (arife)"
            className="mb-3"
          />
          <Button type="submit" loading={save.isPending}>
            Kaydet
          </Button>
        </form>
        <ErrorLine error={error ? new Error(error) : null} />
        <p className="mt-3 text-xs text-ink-faint">
          Aynı güne ikinci kayıt <strong>üzerine yazar</strong>. Yarım gün 0,5
          iş günü sayılır; tam tatil 0. Hafta sonuna düşen tatil iş gününü zaten
          düşürmez, kayıt yine de tutulabilir.
        </p>
      </Panel>

      {missing.length > 0 && (
        <Panel title="Sabit tarihli millî günler">
          <p className="mb-3 text-body-sm text-ink-muted">
            Bu {year} yılında henüz takvimde değil. Dinî bayramlar burada yok —
            ay takvimine göre kaydıkları için tarihleri uydurulmuyor, elle
            girilir.
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.map((s) => (
              <Button
                key={s.date}
                variant="secondary"
                size="sm"
                loading={save.isPending}
                onClick={() =>
                  save.mutate({ date: s.date, name: s.name, halfDay: false })
                }
              >
                {trDay(s.date)} — {s.name}
              </Button>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`${year} takvimi`} bodyClassName="p-0">
        <Table>
          <THead>
            <tr>
              <Th>Gün</Th>
              <Th>Adı</Th>
              <Th>İş günü etkisi</Th>
              <Th align="right">İşlem</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((h) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap">{trDay(h.date)}</Td>
                <Td>{h.name}</Td>
                <Td muted>
                  {isWeekend(h.date)
                    ? "hafta sonu — zaten sayılmıyor"
                    : h.halfDay
                      ? "yarım gün (0,5)"
                      : "tam gün (0)"}
                </Td>
                <Td align="right">
                  {/* Kısa ayar listesi: dolu kırmızı bir duvar değil,
                      `dangerQuiet`. Kayıt geri getirilebilir — takvimden bir
                      gün çıkarmak geçmiş bir sayıyı bozmuyor. */}
                  <Button
                    variant="dangerQuiet"
                    size="sm"
                    loading={remove.isPending}
                    onClick={() => remove.mutate(h.id)}
                  >
                    Çıkar
                  </Button>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <TableEmpty
                colSpan={4}
                label={`${year} için tatil girilmemiş — bütün hafta içi günler çalışılmış sayılıyor.`}
              />
            )}
          </TBody>
        </Table>
      </Panel>

      <Note collapsible defaultOpen={false}>
        Bu takvimin tek tüketicisi <strong>ay sonu projeksiyonu</strong>. Tahmin
        iş gününe göre yapılıyor: ayın 15&apos;i bir pazara denk geldiğinde
        &quot;ayın yarısı geçti&quot; demek toptancıda yanlış. Tatil girilmemiş
        bir kurulumda hesap eskisiyle birebir aynı çalışır — bu ekran hiçbir
        sayıyı geriye dönük değiştirmez, bundan sonraki tahminleri düzeltir.
      </Note>
    </div>
  );
}
