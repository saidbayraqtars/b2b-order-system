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
      className={`rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
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
      ? "bg-indigo-600 active:bg-indigo-700"
      : variant === "danger"
        ? "bg-red-600 active:bg-red-700"
        : "bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800";
  const text =
    variant === "secondary"
      ? "text-neutral-900 dark:text-neutral-100"
      : "text-white";
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
      <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </Text>
      <TextInput
        placeholderTextColor="#9ca3af"
        className="h-12 rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        {...props}
      />
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
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
    neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
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
      <Card className="border-red-200 dark:border-red-900">
        <Text className="text-red-700 dark:text-red-400">{message}</Text>
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
      <Text className="text-center text-neutral-500">{text}</Text>
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
      <Text className="text-neutral-500 dark:text-neutral-400">{label}</Text>
      <Text
        className={
          strong
            ? "text-base font-bold text-neutral-900 dark:text-neutral-100"
            : "text-neutral-900 dark:text-neutral-100"
        }
      >
        {value}
      </Text>
    </View>
  );
}
