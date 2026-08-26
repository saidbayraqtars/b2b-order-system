import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useAuthStore } from "@/store/auth";
import { ApiError } from "@/lib/api";
import { Button, Field } from "@/components/ui";
import ServerSettings from "@/components/ServerSettings";
import { serverUrl } from "@/lib/server-url";

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  // Set when the server ended an active session (deactivated, demoted, password
  // reset). Without it the app would just bounce to login with no explanation.
  const endedReason = useAuthStore((s) => s.sessionEndedReason);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  /**
   * Kod alanı baştan görünmez — webdeki giriş formuyla aynı karar: hesapların
   * çoğunda ikinci adım yok, herkese boş bir kod kutusu göstermek "bende de mi
   * olmalıydı" sorusu doğurur. Sunucu `TOTP_REQUIRED` dediğinde açılır ve o an
   * şifrenin doğru olduğu da bilinir.
   */
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password, totp.trim() || undefined);
      // RootNavigator swaps the stack as soon as `user` lands in the store.
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOTP_REQUIRED") {
        setNeedsTotp(true);
        setError(null);
        return;
      }
      if (err instanceof ApiError && err.code === "TOTP_INVALID") {
        setNeedsTotp(true);
        setTotp("");
        setError("Doğrulama kodu hatalı veya süresi geçmiş");
        return;
      }
      const message = err instanceof Error ? err.message : "Giriş yapılamadı";
      // Şifre değişmiş olabilir: kod alanı açıksa kapatılıp baştan başlanıyor,
      // yoksa kullanıcı doğru koda yanlış şifreyle vurmayı sürdürür.
      setNeedsTotp(false);
      setTotp("");
      setError(message);
      // A failed fetch never reached a server, so the address is the first
      // thing to suspect — the panel opens itself rather than leaving someone
      // retyping a password against an unreachable host.
      if (err instanceof TypeError) setShowServer(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <ScrollView contentContainerClassName="flex-grow justify-center gap-6 p-6">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            B2B Mobil
          </Text>
          <Text className="text-neutral-500">Plasiyer & Müşteri uygulaması</Text>
        </View>

        {endedReason ? (
          <View className="rounded-lg bg-amber-100 p-3 dark:bg-amber-950">
            <Text className="text-amber-800 dark:text-amber-300">{endedReason}</Text>
          </View>
        ) : null}

        <View className="gap-4">
          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="ornek@firma.com"
          />
          <Field
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
            onSubmitEditing={onSubmit}
          />
          {needsTotp ? (
            <Field
              label="Doğrulama kodu"
              value={totp}
              onChangeText={setTotp}
              autoCapitalize="characters"
              autoFocus
              keyboardType="default"
              placeholder="123456 ya da yedek kod"
              onSubmitEditing={onSubmit}
            />
          ) : null}
          {needsTotp && !error ? (
            <Text className="text-neutral-500">
              Authenticator uygulamasındaki altı haneli kodu girin. Telefonunuz
              yoksa yedek kodlarınızdan birini kullanabilirsiniz.
            </Text>
          ) : null}
          {error ? <Text className="text-red-600">{error}</Text> : null}
          <Button
            title="Giriş yap"
            onPress={onSubmit}
            loading={busy}
            disabled={!email || !password || (needsTotp && !totp.trim())}
          />
        </View>

        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowServer((v) => !v)}
          >
            <Text className="text-center text-sm text-neutral-500">
              {showServer ? "Sunucu ayarını gizle" : `Sunucu: ${serverUrl()}`}
            </Text>
          </Pressable>
          {showServer ? <ServerSettings /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
