"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type {
  CashSnapshot,
  CustomerSnapshot,
  GrowthSnapshot,
  Indicator,
  LiveStatus,
  Pace,
  ProductSnapshot,
} from "@repo/services";
import {
  ANALYTICS_SECTIONS,
  ANALYTICS_SECTION_LABELS,
  type AnalyticsSection,
} from "@repo/types";
import { apiGet } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import { ErrorLine, Panel } from "@/components/form";
import { LoadingState, Note, PageHeader, Tabs } from "@/components/ui";
import { CashSection } from "./cash-section";
import { CustomerSection } from "./customer-section";
import { GrowthSection } from "./growth-section";
import { LiveSection } from "./live-section";
import { PaceSection } from "./pace-section";
import { ProductSection } from "./product-section";
import { Stale } from "./shared";

// Yönetici panosunun kabuğu: sekme, veri çekme ve "bu sayı ne zaman
// hesaplandı" satırı.
//
// Sekme **URL'de** (`?bolum=`): fotoğraflanamayan ekranın doğru göründüğü
// söylenemez ve betik düğmelere basmıyor. Ayrıca altı bölümün altısını birden
// indirmek, açılışta altı ağır sorgu demek olurdu.

export type Section = AnalyticsSection;

const TABS: ReadonlyArray<{ key: Section; label: string }> = ANALYTICS_SECTIONS.map(
  (key) => ({ key, label: ANALYTICS_SECTION_LABELS[key] }),
);

function sectionFrom(raw: string | null): Section {
  return TABS.some((t) => t.key === raw) ? (raw as Section) : "durum";
}

interface Envelope<T> {
  section: Section;
  live: boolean;
  computedAt: string | null;
  data: T | null;
}

export function AnalyticsBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const section = sectionFrom(params.get("bolum"));

  const query = useQuery({
    queryKey: ["analytics", section],
    queryFn: () => apiGet<Envelope<unknown>>(`/api/analytics?bolum=${section}`),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Yönetici panosu"
        subtitle="Şirketin anlık durumu ve büyümenin matematiği"
      />

      <Tabs
        value={section}
        onChange={(next) =>
          router.replace(`${pathname}?bolum=${next}`, { scroll: false })
        }
        items={TABS}
      />

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorLine error={query.error} />
      ) : (
        <>
          <Stale live={query.data!.live} computedAt={query.data!.computedAt} />
          <Body section={section} envelope={query.data!} />
        </>
      )}

      <Note>
        Bu ekran <strong>küratörlü</strong>: hangi göstergenin gösterileceği
        kodda yazılı. Kendi sütunlarınızı seçmek için{" "}
        <a href="/reports/new" className="underline underline-offset-4">
          rapor tasarımcısı
        </a>{" "}
        var — ikisi aynı veri kümesi kayıt defterini paylaşıyor, panonun kendi
        ham SQL&apos;i yok. Karşılaştırmalar <strong>yıl-üstü-yıl</strong>:
        toptan gıdada aydan aya kıyas ramazanı, yazı ve okul dönemini büyüme
        sanır.
      </Note>
    </div>
  );
}

function Body({
  section,
  envelope,
}: {
  section: Section;
  envelope: Envelope<unknown>;
}) {
  if (!envelope.data) {
    return (
      <Panel title="Henüz hesaplanmadı">
        <p className="text-body-sm text-ink-muted">
          Bu bölüm gecelik işten besleniyor ve iş henüz koşmadı.{" "}
          <a
            href="/admin/jobs"
            className="underline underline-offset-4 hover:text-ink"
          >
            Bakım işleri
          </a>{" "}
          ekranından <strong>Yönetici panosu özeti</strong> işini elle
          çalıştırabilirsiniz.
        </p>
      </Panel>
    );
  }

  switch (section) {
    case "durum":
      return <LiveSection data={envelope.data as LiveStatus} />;
    case "buyume":
      return <GrowthSection data={envelope.data as GrowthSnapshot} />;
    case "musteri":
      return <CustomerSection data={envelope.data as CustomerSnapshot} />;
    case "urun":
      return <ProductSection data={envelope.data as ProductSnapshot} />;
    case "nakit":
      return <CashSection data={envelope.data as CashSnapshot} />;
    case "gidisat":
      return <PaceSection data={envelope.data as Pace} />;
  }
}

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `%${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatTRY(value);
}

export type { Indicator };
