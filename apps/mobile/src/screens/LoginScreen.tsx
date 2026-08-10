import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useAuthStore } from "@/store/auth";
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
          {error ? <Text className="text-red-600">{error}</Text> : null}
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
