"use client";

import type { Pace } from "@repo/services";
import { formatTRY } from "@/lib/format";
import { Panel } from "@/components/form";
import { Meter, Note } from "@/components/ui";
import { NoValue, SourceTile } from "./shared";

// F. Gidişat: ay sonu projeksiyonu ve hedefe göre tempo.

export function PaceSection({ data }: { data: Pace }) {
  const elapsedPct =
    data.businessDaysInMonth > 0
      ? (data.businessDaysElapsed / data.businessDaysInMonth) * 100
      : 0;
  const targetPct = data.targetAchievedPct;
  const behind = targetPct !== null && targetPct + 5 < elapsedPct;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SourceTile
          label="Bu ay yapılan"
          value={formatTRY(data.achieved)}
          // Tatil takvimi girildiğinde iş günü kesirli olabilir (arife 0,5).
          hint={`${days(data.businessDaysElapsed)} / ${days(
            data.businessDaysInMonth,
          )} iş günü`}
          href="/admin/reports?bolum=satis"
          sourceLabel="Satış raporu"
        />
        <SourceTile
          label="Ay sonu tahmini"
          value={
            data.projection === null ? <NoValue /> : formatTRY(data.projection)
          }
          hint={
            data.seasonalIndex === null
              ? "doğrusal — geçen yılın aynı ayı yok"
              : "geçen yılın aynı ayının ritmiyle düzeltildi"
          }
        />
        <SourceTile
          label="Hedef"
          value={
            data.targetTotal === null ? (
              <NoValue label="hedef yok" />
            ) : (
              formatTRY(data.targetTotal)
            )
          }
          hint={
            data.targetTotal === null
              ? "bu ay için ciro hedefi tanımlı değil"
              : "plasiyer hedeflerinin toplamı"
          }
          href="/admin/targets"
          sourceLabel="Hedefler"
        />
        <SourceTile
          label="Hedefe göre"
          value={
            targetPct === null ? (
              <NoValue label="hedef yok" />
            ) : (
              `%${targetPct.toFixed(0)}`
            )
          }
          tone={targetPct === null ? "neutral" : behind ? "caution" : "positive"}
          hint={
            targetPct === null
              ? "hedef yok"
              : behind
                ? `dönemin %${elapsedPct.toFixed(0)}'i geçti — geride`
                : `dönemin %${elapsedPct.toFixed(0)}'i geçti`
          }
        />
      </section>

      <Panel title="Tempo">
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-baseline justify-between text-body-sm">
              <span className="text-ink-muted">Dönemin geçen kısmı</span>
              <span className="tabular-nums text-ink">
                %{elapsedPct.toFixed(0)}
              </span>
            </div>
            <Meter value={elapsedPct} label="Dönemin geçen kısmı" />
          </div>
          {targetPct !== null && (
            <div>
              <div className="mb-1 flex items-baseline justify-between text-body-sm">
                <span className="text-ink-muted">Hedefin yapılan kısmı</span>
                <span className="tabular-nums text-ink">
                  %{targetPct.toFixed(0)}
                </span>
              </div>
              <Meter
                value={targetPct}
                tone={targetPct >= 100 ? "positive" : behind ? "caution" : "neutral"}
                label="Hedefin yapılan kısmı"
              />
            </div>
          )}
        </div>

        <Note className="mt-6">
          Tempo <strong>iş gününe</strong> göre ölçülüyor, takvim gününe göre
          değil: ayın 15&apos;i pazara denk geldiğinde &ldquo;ayın yarısı
          geçti&rdquo; demek toptancıda yanlış olur, çünkü satış hafta içi
          oluyor.{" "}
          {data.holidays.length === 0 ? (
            <>
              Bu ay için <strong>resmî tatil girilmemiş</strong>: bütün hafta
              içi günler çalışılmış sayılıyor, yani bayram ayında tahmin yüksek
              çıkar.{" "}
              <a
                href="/admin/tatiller"
                className="underline underline-offset-4 hover:text-ink"
              >
                Tatil takvimi
              </a>{" "}
              girilirse düzelir.
            </>
          ) : (
            <>
              Bu ayın iş gününden <strong>{holidayLabel(data.holidays)}</strong>{" "}
              düşüldü:{" "}
              {data.holidays
                .map((h) => `${h.name}${h.halfDay ? " (yarım gün)" : ""}`)
                .join(", ")}
              .
            </>
          )}
          {data.seasonalIndex !== null && (
            <>
              {" "}
              Mevsimsel düzeltme geçen yılın aynı ayından geliyor: o ayın
              cirosunun %{(data.seasonalIndex * 100).toFixed(0)}&apos;i bu
              noktada yapılmıştı.
            </>
          )}
        </Note>
      </Panel>
    </div>
  );
}

/** Kesirli iş günü Türkçe yazımla: 10,5 — `10.5` değil. */
function days(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

/** "iki tam gün + bir yarım gün" yerine tek satır: kaç iş günü düştü. */
function holidayLabel(
  holidays: ReadonlyArray<{ halfDay: boolean }>,
): string {
  const days = holidays.reduce((sum, h) => sum + (h.halfDay ? 0.5 : 1), 0);
  const text = days.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  return `${text} iş günü`;
}
