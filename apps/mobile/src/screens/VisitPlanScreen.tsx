import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  VISIT_REQUEST_STATUS_LABELS,
  type VisitRequestStatus,
} from "@repo/types";
import {
  useReorderVisits,
  useUpdateVisitRequest,
  useVisitRequests,
} from "@/lib/queries";
import { formatDate } from "@/lib/format";
import {
  callNumber,
  destinationOf,
  directionsUrl,
  openExternal,
  routeUrl,
} from "@/lib/maps";
import { Badge, Button, Card, Empty, ErrorState, Loading } from "@/components/ui";
import type { VisitRequestRow } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Günün ziyaret planı: bayinin açtığı çağrılar, elle sıra ve yol tarifi.
//
// Sıra sunucuda tutuluyor (VisitRequest.sortIndex), telefonda değil: plasiyer
// sabah masaüstünde plan yapıp gün içinde telefondan bakıyor, iki cihazda iki
// farklı sıra planı işe yaramaz hâle getirir. Elle taşıma sırasında yerel sıra
// öne geçiyor, kaydedilince ikisi tekrar aynı oluyor.

const TONE: Record<VisitRequestStatus, "amber" | "blue" | "green" | "neutral"> = {
  OPEN: "amber",
  PLANNED: "blue",
  DONE: "green",
  CANCELLED: "neutral",
};

export default function VisitPlanScreen({ navigation }: ScreenProps<"VisitPlan">) {
  const today = new Date().toISOString().slice(0, 10);
  const list = useVisitRequests(today);
  const reorder = useReorderVisits();
  const setStatus = useUpdateVisitRequest();

  const [order, setOrder] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const data = list.data ?? [];
    if (!order) return data;
    const byId = new Map(data.map((r) => [r.id, r]));
    const ordered = order.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    // Anything the local order does not know about (opened while the rep was
    // dragging) falls in at the end rather than disappearing.
    const rest = data.filter((r) => !order.includes(r.id));
    return [...ordered, ...rest];
  }, [list.data, order]);

  const stops = useMemo(
    () =>
      rows
        .filter((r) => r.status === "OPEN" || r.status === "PLANNED")
        .map((r) => destinationOf(r)),
    [rows],
  );

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (row) next.splice(target, 0, row);
    setOrder(next.map((r) => r.id));
  }

  function save() {
    if (!order) return;
    setError(null);
    reorder.mutate(order, {
      onSuccess: () => setOrder(null),
      onError: (e) =>
        setError(e instanceof Error ? e.message : "Sıra kaydedilemedi"),
    });
  }

  function mark(row: VisitRequestRow, status: VisitRequestStatus) {
    setError(null);
    setStatus.mutate(
      { id: row.id, status },
      {
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Durum değiştirilemedi"),
      },
    );
  }

  if (list.isPending) return <Loading />;
  if (list.error) {
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-3 p-4 pb-10"
    >
      <View className="flex-row gap-2">
        <Button
          title="Rotayı aç"
          variant="secondary"
          className="flex-1"
          disabled={stops.length === 0}
          onPress={() => openExternal(routeUrl(stops))}
        />
        {order ? (
          <Button
            title="Sırayı kaydet"
            className="flex-1"
            loading={reorder.isPending}
            onPress={save}
          />
        ) : null}
      </View>

      {error ? <Text className="text-red-600">{error}</Text> : null}

      {rows.length === 0 ? (
        <Empty text="Bugün için ziyaret çağrısı yok." />
      ) : (
        rows.map((r, index) => {
          const dest = destinationOf(r);
          const active = r.status === "OPEN" || r.status === "PLANNED";
          return (
            <Card key={r.id} className="gap-2">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {index + 1}. {r.companyName}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {[r.addressLine, r.district, r.city].filter(Boolean).join(" · ") ||
                      "Adres yok"}
                  </Text>
                  <Text className="text-xs text-neutral-400">
                    İstenen gün: {r.requestedFor ? formatDate(r.requestedFor) : "—"}
                  </Text>
                </View>
                <Badge
                  label={VISIT_REQUEST_STATUS_LABELS[r.status]}
                  tone={TONE[r.status]}
                />
              </View>

              {r.note ? (
                <Text className="text-sm text-neutral-700 dark:text-neutral-300">
                  {r.note}
                </Text>
              ) : null}

              <View className="flex-row flex-wrap gap-2">
                <MiniButton
                  label="Yol tarifi"
                  disabled={!dest}
                  onPress={() => openExternal(directionsUrl(dest))}
                />
                {r.phone ? (
                  <MiniButton label="Ara" onPress={() => callNumber(r.phone!)} />
                ) : null}
                <MiniButton
                  label="Ziyaret aç"
                  onPress={() =>
                    navigation.navigate("CheckIn", {
                      companyId: r.companyId,
                      companyName: r.companyName,
                    })
                  }
                />
                {active ? (
                  <>
                    <MiniButton label="↑" onPress={() => move(index, -1)} />
                    <MiniButton label="↓" onPress={() => move(index, 1)} />
                  </>
                ) : null}
              </View>

              {active ? (
                <View className="flex-row gap-2">
                  {r.status === "OPEN" ? (
                    <Button
                      title="Güne al"
                      variant="secondary"
                      className="flex-1"
                      onPress={() => mark(r, "PLANNED")}
                    />
                  ) : null}
                  <Button
                    title="Ziyaret edildi"
                    className="flex-1"
                    onPress={() => mark(r, "DONE")}
                  />
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

function MiniButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`h-9 justify-center rounded-lg border px-3 ${
        disabled
          ? "border-neutral-200 dark:border-neutral-800"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <Text
        className={`text-sm ${
          disabled ? "text-neutral-400" : "text-neutral-800 dark:text-neutral-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
