import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useAuthStore } from "@/store/auth";
import { ThemeButton } from "@/lib/theme";
import { Button, Field } from "@/components/ui";

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  // Set when the server ended an active session (deactivated, demoted, password
  // reset). Without it the app would just bounce to login with no explanation.
  const endedReason = useAuthStore((s) => s.sessionEndedReason);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      // RootNavigator swaps the stack as soon as `user` lands in the store.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı");
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
          <Text className="text-3xl font-bold text-fg">
            B2B Mobil
          </Text>
          <Text className="text-fg-muted">Plasiyer & Müşteri uygulaması</Text>
          {/* Tasarım anahtarı giriş ekranında da duruyor: sunum çoğu zaman
              buradan başlıyor ve kimliği göstermek için önce giriş yapmak
              gerekmemeli. */}
          <ThemeButton className="self-start pt-2" />
        </View>

        {endedReason ? (
          <View className="rounded-lg bg-warning-soft p-3">
            <Text className="text-warning">{endedReason}</Text>
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
          {error ? <Text className="text-danger">{error}</Text> : null}
          <Button
            title="Giriş yap"
            onPress={onSubmit}
            loading={busy}
            disabled={!email || !password}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
