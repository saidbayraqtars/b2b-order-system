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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      // RootNavigator swaps the stack as soon as `user` lands in the store.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Giriş yapılamadı";
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
          {error ? <Text className="text-red-600">{error}</Text> : null}
          <Button
            title="Giriş yap"
            onPress={onSubmit}
            loading={busy}
            disabled={!email || !password}
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
