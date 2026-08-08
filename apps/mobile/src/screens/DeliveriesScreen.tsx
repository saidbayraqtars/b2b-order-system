import { useLayoutEffect, useState } from "react";
import { FlatList, Image, Pressable, Switch, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { hasPermission } from "@repo/types";
import {
  useAssignCourier,
  useConfirmDelivery,
  useDeliveries,
  useUploadProof,
} from "@/lib/queries";
import { mediaUrl } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { callNumber, destinationOf, directionsUrl, openExternal } from "@/lib/maps";
import { useAuthStore } from "@/store/auth";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Field,
  Loading,
} from "@/components/ui";
import type { Courier, DeliveryRow } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Kurye masası.
//
// Tek ekran, tek liste: kuryenin telefonunda menü gezmesi gereken bir iş yok.
// Aynı bileşen iki kişiye hizmet ediyor — kurye kendi işini görüp teslim eder,
// dağıtımı yapan (orders.fulfil) hepsini görür ve kurye atar. Sunucu listeyi
// zaten kişiye göre daraltıyor; ekran yalnızca hangi düğmelerin çıktığını bilir.
export default function DeliveriesScreen({
  navigation,
}: ScreenProps<"Deliveries">) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [showDelivered, setShowDelivered] = useState(false);
  const list = useDeliveries(showDelivered);
  const assign = useAssignCourier();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void logout()} accessibilityRole="button">
          <Text className="text-primary">Çıkış</Text>
        </Pressable>
      ),
    });
  }, [navigation, logout]);

  if (list.isPending) return <Loading />;
  if (list.error) {
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  }

  const { deliveries, couriers } = list.data;
  // Asked of the session, not inferred from the answer: the endpoint sends an
  // empty courier list both to a courier (who may not dispatch) and to a
  // dispatcher who has not hired one yet, and those two deserve different
  // screens — the second needs to be told the list is empty.
  const canDispatch = hasPermission(user?.permissions, "orders.fulfil");

  return (
    <View className="flex-1 bg-surface2">
      <View className="flex-row items-center justify-between p-4">
        <Text className="text-fg">
          Teslim edilenleri de göster
        </Text>
        <Switch value={showDelivered} onValueChange={setShowDelivered} />
      </View>

      <FlatList
        data={deliveries}
        keyExtractor={(d) => d.shipmentId}
        contentContainerClassName="gap-3 px-4 pb-8"
        onRefresh={() => void list.refetch()}
        refreshing={list.isRefetching}
        ListEmptyComponent={<Empty text="Bekleyen teslimat yok." />}
        renderItem={({ item }) => (
          <DeliveryCard
            delivery={item}
            couriers={canDispatch ? couriers : []}
            onAssign={(courierId) =>
              assign.mutate({ shipmentId: item.shipmentId, courierId })
            }
          />
        )}
      />
    </View>
  );
}

function DeliveryCard({
  delivery: d,
  couriers,
  onAssign,
}: {
  delivery: DeliveryRow;
  couriers: Courier[];
  onAssign: (courierId: string | null) => void;
}) {
  const dest = destinationOf(d);

  return (
    <Card className="gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-semibold text-fg">
            {d.companyName}
          </Text>
          <Text className="text-xs text-fg-muted">
            İrsaliye {d.documentNumber} · Sipariş {d.orderNumber} · {d.itemCount}{" "}
            kalem · {formatMoney(d.grandTotal)}
          </Text>
          <Text className="text-xs text-fg-muted">
            {[d.addressLine, d.district, d.city].filter(Boolean).join(" · ") ||
              "Adres yok"}
          </Text>
        </View>
        {d.deliveredAt ? (
          <Badge label={`Teslim ${formatDateTime(d.deliveredAt)}`} tone="green" />
        ) : d.courierName ? (
          <Badge label={d.courierName} tone="blue" />
        ) : (
          <Badge label="Atanmadı" tone="amber" />
        )}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          disabled={!dest}
          onPress={() => openExternal(directionsUrl(dest))}
          className="h-9 justify-center rounded-lg border border-border-strong px-3"
        >
          <Text className="text-sm text-fg">
            Yol tarifi
          </Text>
        </Pressable>
        {d.companyPhone ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => callNumber(d.companyPhone!)}
            className="h-9 justify-center rounded-lg border border-border-strong px-3"
          >
            <Text className="text-sm text-fg">
              {d.companyPhone}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {couriers.length > 0 && !d.deliveredAt ? (
        <View className="flex-row flex-wrap gap-2">
          {couriers.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: d.courierId === c.id }}
              onPress={() => onAssign(d.courierId === c.id ? null : c.id)}
              className={`h-9 justify-center rounded-lg border px-3 ${
                d.courierId === c.id
                  ? "border-primary bg-primary-soft"
                  : "border-border-strong"
              }`}
            >
              <Text
                className={`text-sm ${
                  d.courierId === c.id
                    ? "font-semibold text-on-primary-soft"
                    : "text-fg"
                }`}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {d.deliveredAt ? (
        <View className="gap-1">
          <Text className="text-xs text-fg-muted">
            Teslim alan: {d.receivedByName ?? "—"}
            {d.deliveryNote ? ` · ${d.deliveryNote}` : ""}
          </Text>
          {d.proofPhotoUrl ? (
            <Image
              source={{ uri: mediaUrl(d.proofPhotoUrl) }}
              className="h-32 w-full rounded-lg bg-surface3"
              resizeMode="contain"
            />
          ) : null}
        </View>
      ) : (
        <ConfirmForm shipmentId={d.shipmentId} />
      )}
    </Card>
  );
}

/**
 * Teslim formu.
 *
 * İmzalı belgenin fotoğrafı zorunlu değil ama isteniyor: bazı teslimatlarda
 * kâğıt hiç imzalanmıyor (kurumsal depo girişi) ve zorunlu bir alan bu durumda
 * kuryeyi sahte kayıt girmeye iter. "Kim teslim aldı" ise zorunlu — imzasız da
 * olsa bir isim yazılmalı.
 */
function ConfirmForm({ shipmentId }: { shipmentId: string }) {
  const confirm = useConfirmDelivery();
  const upload = useUploadProof();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      // Not fatal: the photo is optional, so a refused camera must not block
      // the delivery from being recorded.
      setError("Kamera izni verilmedi — fotoğrafsız kaydedebilirsiniz.");
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      // The photo is evidence a signature exists, not a product shot; a smaller
      // file is a faster upload on a doorstep connection.
      quality: 0.6,
      allowsEditing: false,
    });
    const asset = shot.assets?.[0];
    if (shot.canceled || !asset) return;

    upload.mutate(
      {
        uri: asset.uri,
        name: asset.fileName ?? "teslimat.jpg",
        type: asset.mimeType ?? "image/jpeg",
      },
      {
        onSuccess: (res) => setPhoto(res.url),
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Yükleme başarısız"),
      },
    );
  }

  if (!open) {
    return (
      <Button title="Teslim edildi" onPress={() => setOpen(true)} />
    );
  }

  return (
    <View className="gap-3 rounded-xl border border-border p-3">
      <Field
        label="Teslim alan (zorunlu)"
        value={name}
        onChangeText={setName}
        placeholder="Ad soyad"
      />
      <Field label="Not" value={note} onChangeText={setNote} placeholder="—" />

      <Button
        title={photo ? "Fotoğrafı değiştir" : "İmzalı belgeyi çek"}
        variant="secondary"
        loading={upload.isPending}
        onPress={() => void takePhoto()}
      />
      {photo ? (
        <Image
          source={{ uri: mediaUrl(photo) }}
          className="h-32 w-full rounded-lg bg-surface3"
          resizeMode="contain"
        />
      ) : null}

      {error ? <Text className="text-sm text-warning">{error}</Text> : null}

      <Button
        title="Kaydet"
        disabled={name.trim().length < 2}
        loading={confirm.isPending}
        onPress={() =>
          confirm.mutate(
            {
              shipmentId,
              receivedByName: name.trim(),
              proofPhotoUrl: photo,
              note: note.trim() || undefined,
            },
            {
              onSuccess: () => setOpen(false),
              onError: (e) =>
                setError(e instanceof Error ? e.message : "Kaydedilemedi"),
            },
          )
        }
      />
      <Button title="Vazgeç" variant="secondary" onPress={() => setOpen(false)} />
    </View>
  );
}
