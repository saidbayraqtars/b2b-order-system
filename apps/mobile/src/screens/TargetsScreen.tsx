import { ScrollView, Text, View } from "react-native";
import { TARGET_METRIC_LABELS, TARGET_PERIOD_LABELS } from "@repo/types";
import { useTargetProgress } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { Card, Empty, ErrorState, Loading, Row } from "@/components/ui";
import type { TargetProgress } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Hedef karnesi.
//
// Yüzde tek başına yalan söyler: ayın ilk günü %10 iyidir, son günü felakettir.
// O yüzden her satırda dönemin ne kadarının geçtiği de çizilir ve iki çubuk
// yan yana durur — "hedefin %40'ı, ayın %80'i" cümlesi tek bakışta okunmalı.
export default function TargetsScreen(_props: ScreenProps<"Targets">) {
  const user = useAuthStore((s) => s.user);
  const { data, isPending, error, refetch } = useTargetProgress(user?.id);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-3 p-4 pb-10"
    >
      {(data ?? []).length === 0 ? (
        <Empty text="Size tanımlı bir hedef yok." />
      ) : (
        data!.map((t) => <TargetCard key={t.id} target={t} />)
      )}
    </ScrollView>
  );
}

function TargetCard({ target: t }: { target: TargetProgress }) {
  const isMoney = t.metric === "REVENUE";
  const show = (v: string) => (isMoney ? formatMoney(v) : `${Number(v)} ziyaret`);
  // Behind is "the period has run further than the work has" — the only
  // comparison that means anything mid-period.
  const behind = t.percent < Math.round(t.elapsed * 100);

  return (
    <Card className="gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
          {TARGET_METRIC_LABELS[t.metric]} · {TARGET_PERIOD_LABELS[t.period]}
        </Text>
        <Text
          className={`text-lg font-bold ${
            behind
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          %{t.percent}
        </Text>
      </View>

      <Text className="text-xs text-neutral-500">
        {formatDate(t.periodStart)} — {formatDate(t.periodEnd)}
      </Text>

      <Bar
        label="Gerçekleşen"
        ratio={t.percent / 100}
        tone={behind ? "bg-amber-500" : "bg-emerald-500"}
      />
      <Bar label="Geçen süre" ratio={t.elapsed} tone="bg-neutral-400" />

      <Row label="Hedef" value={show(t.targetValue)} />
      <Row label="Gerçekleşen" value={show(t.achieved)} strong />
      {t.note ? (
        <Text className="text-sm text-neutral-500">{t.note}</Text>
      ) : null}
    </Card>
  );
}

function Bar({
  label,
  ratio,
  tone,
}: {
  label: string;
  ratio: number;
  tone: string;
}) {
  // Over-achievement is real and worth seeing, but a bar wider than its track
  // would spill out of the card — the number above already says 140%.
  const width = `${Math.min(100, Math.max(0, Math.round(ratio * 100)))}%` as const;
  return (
    <View className="gap-1">
      <Text className="text-xs text-neutral-500">{label}</Text>
      <View className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <View className={`h-2 rounded-full ${tone}`} style={{ width }} />
      </View>
    </View>
  );
}
