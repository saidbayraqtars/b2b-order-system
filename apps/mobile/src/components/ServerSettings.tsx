import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  BUILT_IN_URL,
  probeServer,
  resetServerUrl,
  serverUrl,
  setServerUrl,
} from "@/lib/server-url";
import { Button, Field } from "./ui";

// Which server this phone talks to, changed on the phone.
//
// It sits on the login screen because that is where it is needed: an address
// that has gone stale locks the app out entirely, and there is no way in to a
// settings page behind a login that cannot complete. It sits on the account
// screen too, for the calmer case of moving the installation.

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; message: string }
  | { kind: "warn"; message: string }
  | { kind: "error"; message: string };

export default function ServerSettings({
  onChanged,
}: {
  /** Called after a successful save — callers drop cached queries. */
  onChanged?: (url: string) => void;
}) {
  const [value, setValue] = useState(serverUrl());
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => setValue(serverUrl()), []);

  async function save() {
    setStatus({ kind: "busy" });
    // Probed before it is stored: a saved address that answers nothing looks
    // exactly like a broken app from the login screen.
    const probe = await probeServer(value);
    if (!probe.ok) {
      setStatus({ kind: "error", message: probe.message });
      return;
    }

    await setServerUrl(probe.url);
    setValue(probe.url);
    setStatus(
      probe.warning
        ? { kind: "warn", message: probe.warning }
        : { kind: "ok", message: `Bağlandı: ${probe.url}` },
    );
    onChanged?.(probe.url);
  }

  async function reset() {
    const url = await resetServerUrl();
    setValue(url);
    setStatus({ kind: "ok", message: `Varsayılana döndü: ${url}` });
    onChanged?.(url);
  }

  const busy = status.kind === "busy";
  const tone =
    status.kind === "ok"
      ? "text-green-700 dark:text-green-400"
      : status.kind === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "text-red-600";

  return (
    <View className="gap-3">
      <Field
        label="Sunucu adresi"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="192.168.1.40:3000"
        onSubmitEditing={save}
      />
      <Text className="text-xs text-neutral-500">
        İnternet adresiniz değiştiğinde burayı güncelleyin — uygulamayı yeniden
        kurmanız gerekmez. Kurulumla gelen adres: {BUILT_IN_URL}
      </Text>

      {status.kind !== "idle" && status.kind !== "busy" ? (
        <Text className={`text-sm ${tone}`}>{status.message}</Text>
      ) : null}

      <View className="flex-row gap-3">
        <Button
          title="Kaydet ve dene"
          onPress={save}
          loading={busy}
          disabled={!value.trim()}
          className="flex-1"
        />
        <Button
          title="Varsayılan"
          variant="secondary"
          onPress={reset}
          disabled={busy}
        />
      </View>
    </View>
  );
}
