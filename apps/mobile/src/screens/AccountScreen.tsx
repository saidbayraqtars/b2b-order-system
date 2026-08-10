import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "@repo/types";
import { useAccount, useChangePassword, useUpdateProfile } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { Button, Card, ErrorState, Field, Loading, Row } from "@/components/ui";
import ServerSettings from "@/components/ServerSettings";
import { appVersion, runningVersion, useOtaUpdate } from "@/lib/ota";
import type { ScreenProps } from "@/navigation/types";

const OTA_MESSAGES: Record<string, string> = {
  checking: "Denetleniyor…",
  downloading: "Güncelleme indiriliyor…",
  ready: "Güncelleme hazır — yeniden başlatınca uygulanır.",
  current: "Uygulama güncel.",
};

// Hesabım: ad/telefon ve şifre.
//
// Şifre değişikliği profil kaydından ayrı bir uç, ayrı bir düğme: bir şifrenin
// profil kaydetmenin yan etkisi olarak değişmesi hiçbir kullanıcının beklediği
// şey değil. Başarılı olduğunda sunucu **bütün oturumları** iptal ediyor —
// bu cihazınki dahil — o yüzden ekran kullanıcıyı giriş ekranına geri
// gönderiyor; aksi hâlde bir sonraki istek sebebi söylenmeden 401 dönerdi.
export default function AccountScreen(_props: ScreenProps<"Account">) {
  const account = useAccount();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const ota = useOtaUpdate();
  const otaMessage =
    "message" in ota.state ? ota.state.message : OTA_MESSAGES[ota.state.kind];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Seed the form once the profile lands; typing then owns the fields.
  useEffect(() => {
    if (!account.data) return;
    setName((v) => (v === "" ? account.data.name : v));
    setPhone((v) => (v === "" ? (account.data.phone ?? "") : v));
  }, [account.data]);

  if (account.isPending) return <Loading />;
  if (account.error) {
    return (
      <ErrorState error={account.error} onRetry={() => void account.refetch()} />
    );
  }

  const a = account.data;

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <Text className="mb-2 text-lg font-bold text-neutral-900 dark:text-neutral-100">
          {a.name}
        </Text>
        <Row label="E-posta" value={a.email} />
        <Row label="Rol" value={ROLE_LABELS[a.role]} />
        {a.company ? <Row label="Firma" value={a.company.name} /> : null}
        <Row
          label="Son giriş"
          value={a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "—"}
        />
        <Row
          label="Şifre değişimi"
          value={a.passwordChangedAt ? formatDateTime(a.passwordChangedAt) : "—"}
        />
      </Card>

      <Card className="gap-4">
        <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
          Bilgilerim
        </Text>
        <Field label="Ad soyad" value={name} onChangeText={setName} />
        <Field
          label="Telefon"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        {profileMsg ? (
          <Text className="text-emerald-600">{profileMsg}</Text>
        ) : null}
        {profileError ? <Text className="text-red-600">{profileError}</Text> : null}
        <Button
          title="Kaydet"
          disabled={name.trim().length === 0}
          loading={updateProfile.isPending}
          onPress={() => {
            setProfileMsg(null);
            setProfileError(null);
            updateProfile.mutate(
              { name: name.trim(), phone: phone.trim() || undefined },
              {
                onSuccess: () => setProfileMsg("Kaydedildi."),
                onError: (e) =>
                  setProfileError(
                    e instanceof Error ? e.message : "Kaydedilemedi",
                  ),
              },
            );
          }}
        />
      </Card>

      <Card className="gap-4">
        <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
          Şifre değiştir
        </Text>
        <Field
          label="Mevcut şifre"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
        />
        <Field
          label="Yeni şifre"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />
        {passwordError ? <Text className="text-red-600">{passwordError}</Text> : null}
        <Text className="text-xs text-neutral-500">
          Şifre değişince tüm oturumlar kapanır ve bu cihazda yeniden giriş
          yapmanız gerekir.
        </Text>
        <Button
          title="Şifreyi değiştir"
          disabled={!currentPassword || newPassword.length < 8}
          loading={changePassword.isPending}
          onPress={() => {
            setPasswordError(null);
            changePassword.mutate(
              { currentPassword, newPassword },
              {
                onSuccess: () =>
                  Alert.alert(
                    "Şifre değiştirildi",
                    "Güvenlik için yeniden giriş yapmanız gerekiyor.",
                    [{ text: "Tamam", onPress: () => void logout() }],
                  ),
                onError: (e) =>
                  setPasswordError(
                    e instanceof Error ? e.message : "Şifre değiştirilemedi",
                  ),
              },
            );
          }}
        />
      </Card>

      <Card className="gap-4">
        <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
          Sunucu
        </Text>
        {/* Değişince önbellekteki her şey başka bir kurulumun verisi olur. */}
        <ServerSettings onChanged={() => queryClient.clear()} />
      </Card>

      <Card className="gap-3">
        <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
          Uygulama güncellemesi
        </Text>
        <Row label="Sürüm" value={appVersion()} />
        <Row label="Paket" value={runningVersion()} />
        {otaMessage ? (
          <Text
            className={
              ota.state.kind === "error"
                ? "text-sm text-red-600"
                : "text-sm text-neutral-500"
            }
          >
            {otaMessage}
          </Text>
        ) : null}
        {ota.state.kind === "ready" ? (
          <Button
            title="Yeniden başlat ve güncelle"
            onPress={() => void ota.restart()}
          />
        ) : (
          <Button
            title="Güncellemeleri denetle"
            variant="secondary"
            loading={ota.state.kind === "checking" || ota.state.kind === "downloading"}
            onPress={() => void ota.check()}
          />
        )}
      </Card>

      <View className="pt-2">
        <Button title="Çıkış yap" variant="secondary" onPress={() => void logout()} />
      </View>
    </ScrollView>
  );
}
