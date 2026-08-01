import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import * as Location from "expo-location";
import { useCheckIns, useCheckOut, useCreateCheckIn } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, Card, Empty, ErrorState, Field, Loading } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Field visit tracking. GPS is best-effort: if the user denies permission or the
// fix times out we still record the visit, just without coordinates — a missing
// location must never block the rep from working.
export default function CheckInScreen({ route }: ScreenProps<"CheckIn">) {
  const { companyId } = route.params;
  const { data, isPending, error, refetch, isRefetching } = useCheckIns(companyId);
  const createCheckIn = useCreateCheckIn();
  const checkOut = useCheckOut();

  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const open = data?.find((c) => !c.checkOutAt);

  async function currentCoords() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setNotice("Konum izni verilmedi — ziyaret konumsuz kaydedilecek.");
      return {};
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }

  async function onCheckIn() {
    setNotice(null);
    setLocating(true);
    let coords: { latitude?: number; longitude?: number } = {};
    try {
      coords = await currentCoords();
    } catch {
      setNotice("Konum alınamadı — ziyaret konumsuz kaydedilecek.");
    } finally {
      setLocating(false);
    }

    createCheckIn.mutate(
      { companyId, ...coords, note: note.trim() || undefined },
      {
        onSuccess: () => setNote(""),
        onError: (err) =>
          setNotice(err instanceof Error ? err.message : "Ziyaret açılamadı"),
      },
    );
  }

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      <View className="gap-3 p-4">
        {open ? (
          <Card>
            <Text className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
              Açık ziyaret
            </Text>
            <Text className="mb-3 text-sm text-neutral-500">
              Başlangıç: {formatDateTime(open.checkInAt)}
            </Text>
            <Button
              title="Ziyareti kapat"
              onPress={() => checkOut.mutate(open.id)}
              loading={checkOut.isPending}
            />
          </Card>
        ) : (
          <Card>
            <Field
              label="Not (opsiyonel)"
              value={note}
              onChangeText={setNote}
              placeholder="Ziyaret notu"
              className="mb-3"
            />
            <Button
              title="Ziyaret başlat"
              onPress={onCheckIn}
              loading={locating || createCheckIn.isPending}
            />
          </Card>
        )}
        {notice ? <Text className="text-sm text-amber-600">{notice}</Text> : null}
      </View>

      <FlatList
        data={data}
        keyExtractor={(c) => c.id}
        contentContainerClassName="gap-3 px-4 pb-8"
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        ListHeaderComponent={
          <Text className="pb-1 text-sm font-medium text-neutral-500">
            Geçmiş ziyaretler
          </Text>
        }
        ListEmptyComponent={<Empty text="Bu firmada henüz ziyaret yok." />}
        renderItem={({ item }) => (
          <Card>
            <View className="flex-row items-center justify-between">
              <Text className="text-neutral-900 dark:text-neutral-100">
                {formatDateTime(item.checkInAt)}
              </Text>
              <Badge
                label={item.checkOutAt ? "Kapandı" : "Açık"}
                tone={item.checkOutAt ? "neutral" : "green"}
              />
            </View>
            {item.checkOutAt ? (
              <Text className="text-sm text-neutral-500">
                Bitiş: {formatDateTime(item.checkOutAt)}
              </Text>
            ) : null}
            {item.latitude != null && item.longitude != null ? (
              <Text className="text-sm text-neutral-500">
                Konum: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
              </Text>
            ) : (
              <Text className="text-sm text-neutral-400">Konum yok</Text>
            )}
            {item.note ? (
              <Text className="mt-1 text-neutral-700 dark:text-neutral-300">
                {item.note}
              </Text>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}
