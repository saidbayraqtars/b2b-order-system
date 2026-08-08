import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

// Shared primitives. NativeWind classNames only — no StyleSheet — so screens
// read the same way as the web portal's Tailwind markup.

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-xl border border-border bg-surface p-4 ${className}`}
    >
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  className = "",
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const base =
    variant === "primary"
      ? "bg-primary active:bg-primary/90"
      : variant === "danger"
        ? "bg-danger active:bg-danger/90"
        // İkincil düğmenin basılı hâli renkle değil saydamlıkla veriliyor:
        // yüzey tonları pakete göre değişiyor ve "bir ton koyusu" her pakette
        // görünür bir fark üretmiyor.
        : "bg-surface3 active:opacity-80";
  const text =
    variant === "secondary"
      ? "text-fg"
      : "text-on-primary";
  const off = disabled || loading ? "opacity-50" : "";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-xl px-4 ${base} ${off} ${className}`}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
      <Text className={`text-base font-semibold ${text}`}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  className = "",
  ...props
}: TextInputProps & { label: string; error?: string; className?: string }) {
  return (
    <View className={`gap-1.5 ${className}`}>
      <Text className="text-sm font-medium text-fg">
        {label}
      </Text>
      {/* İpucu metni de paketten: sabit gri, koyu bir pakette zeminle
          karışıyordu. */}
      <TextInput
        className="h-12 rounded-xl border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted"
        {...props}
      />
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    neutral: "bg-surface3 text-fg",
    green: "bg-success-soft text-success",
    amber: "bg-warning-soft text-warning",
    red: "bg-danger-soft text-danger",
    blue: "bg-info-soft text-info",
  } as const;
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${tones[tone]}`}>
      <Text className="text-xs font-medium">{label}</Text>
    </View>
  );
}

/** Full-screen spinner for first loads. */
export function Loading() {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" />
    </View>
  );
}

/** Inline error with an optional retry, used by every data screen. */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu";
  return (
    <View className="gap-3 p-4">
      <Card className="border-danger/40">
        <Text className="text-danger">{message}</Text>
      </Card>
      {onRetry ? (
        <Button title="Tekrar dene" variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View className="items-center justify-center p-8">
      <Text className="text-center text-fg-muted">{text}</Text>
    </View>
  );
}

export function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-fg-muted">{label}</Text>
      <Text
        className={
          strong
            ? "text-base font-bold text-fg"
            : "text-fg"
        }
      >
        {value}
      </Text>
    </View>
  );
}
