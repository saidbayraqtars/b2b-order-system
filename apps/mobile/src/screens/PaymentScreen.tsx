import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  COLLECTION_METHOD_LABELS,
  CollectionMethodEnum,
  type CollectionMethod,
} from "@repo/types";
import {
  useCashAccounts,
  useCompanies,
  usePayments,
  useRecordPayment,
} from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Row } from "@/components/ui";
import type { ScreenProps } from "@/navigation/types";

// Tahsilat şekli, siparişin ödeme yönteminden ayrı bir soru: buradaki cevap
// paranın nasıl geldiğidir (nakit / havale / çek), siparişin nasıl kapanacağı
// değil. Eskiden bu ekran "Açık hesap / Kredi kartı" sorardı; sahada toplanan
// paranın karşılığı o listede yoktu.
const METHODS: CollectionMethod[] = [...CollectionMethodEnum.options];

/** Çek ve senet künye ister; diğerleri istemez. */
const PAPER: CollectionMethod[] = ["CHEQUE", "PROMISSORY_NOTE"];

/**
 * Bir form = bir tekrar anahtarı.
 *
 * Sahada şebeke kopunca istemci aynı tahsilatı yeniden gönderiyordu ve bakiye
 * iki kez düşüyordu. Anahtar ekran açıldığında bir kez üretiliyor; aynı
 * anahtarla gelen ikinci istek sunucuda yeni kayıt açmıyor, ilkinin sonucunu
 * döndürüyor. Yeni tahsilat için ekran yeniden açılır ve anahtar yenilenir.
 */
function newIdempotencyKey(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Field collection (tahsilat). Posts a CREDIT ledger entry; the API returns the
// recomputed balance so the rep sees the effect without a refetch race.
export default function PaymentScreen({ navigation, route }: ScreenProps<"Payment">) {
  const { companyId } = route.params;
  const { data } = useCompanies();
  const company = data?.find((c) => c.id === companyId);
  const recordPayment = useRecordPayment();
  const accounts = useCashAccounts();
  const history = usePayments(companyId);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CollectionMethod>("CASH");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [drawerName, setDrawerName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // Turkish keypads emit a comma; the API wants a JSON number.
  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const isPaper = PAPER.includes(method);

  // GG.AA.YYYY girilir, sunucu ISO bekler. Eksik/bozuk tarih gönderilmiyor:
  // vadesi belirsiz kâğıt ekranda "eksik" işaretiyle duruyor, uydurma bir
  // tarihle kapanmıyor.
  const due = useMemo(() => parseTrDate(dueDate), [dueDate]);
  const dueInvalid = dueDate.trim().length > 0 && due === null;

  function onSubmit() {
    setError(null);
    recordPayment.mutate(
      {
        companyId,
        amount: parsed,
        collectionMethod: method,
        description: description.trim() || undefined,
        cashAccountId: accountId,
        idempotencyKey,
        ...(isPaper
          ? {
              cheque: {
                kind: method === "CHEQUE" ? "CHEQUE" : "PROMISSORY_NOTE",
                ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
                ...(serialNumber.trim()
                  ? { serialNumber: serialNumber.trim() }
                  : {}),
                ...(drawerName.trim() ? { drawerName: drawerName.trim() } : {}),
                ...(due ? { dueDate: due } : {}),
              },
            }
          : {}),
      },
      {
        onSuccess: () => {
          // The key must not outlive the collection it identifies, or the next
          // one on this screen would be answered with the previous receipt.
          setIdempotencyKey(newIdempotencyKey());
          navigation.goBack();
        },
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Tahsilat kaydedilemedi"),
      },
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      {company ? (
        <Card>
          <Text className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
            {company.name}
          </Text>
          <Row
            label="Güncel bakiye"
            value={formatMoney(company.currentBalance, company.currency)}
            strong
          />
        </Card>
      ) : null}

      <Card className="gap-4">
        <Field
          label="Tahsilat tutarı"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
        />

        <Picker
          label="Tahsilat şekli"
          options={METHODS.map((m) => ({
            key: m,
            label: COLLECTION_METHOD_LABELS[m],
          }))}
          selected={method}
          onSelect={(k) => setMethod(k as CollectionMethod)}
        />

        {/* Hangi kasa/banka hesabına girdiği. Boş bırakılabilir — sahadaki
            plasiyerin tek çekmecesi var, seçim zorunlu olsaydı tahsilat
            reddedilirdi. Boş = varsayılan kasa. */}
        <Picker
          label="Kasa / banka hesabı"
          options={[
            { key: "", label: "Varsayılan" },
            ...(accounts.data ?? []).map((a) => ({
              key: a.id,
              label: a.isDefault ? `${a.name} ★` : a.name,
            })),
          ]}
          selected={accountId ?? ""}
          onSelect={(k) => setAccountId(k || null)}
        />

        {isPaper ? (
          <View className="gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
            <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {method === "CHEQUE" ? "Çek künyesi" : "Senet künyesi"} (opsiyonel)
            </Text>
            <Text className="text-xs text-neutral-500">
              Sahada tutar yeter; banka, seri ve keşideci ofiste tamamlanabilir.
              Kâğıt portföye vadesiyle girer, para tahsil edilene kadar kasaya
              girmez.
            </Text>
            <Field label="Banka" value={bankName} onChangeText={setBankName} />
            <Field
              label="Seri no"
              value={serialNumber}
              onChangeText={setSerialNumber}
            />
            <Field
              label="Keşideci"
              value={drawerName}
              onChangeText={setDrawerName}
            />
            <Field
              label="Vade (GG.AA.YYYY)"
              value={dueDate}
              onChangeText={setDueDate}
              keyboardType="numbers-and-punctuation"
              placeholder="31.12.2026"
              error={dueInvalid ? "Tarihi GG.AA.YYYY yazın" : undefined}
            />
          </View>
        ) : null}

        <Field
          label="Açıklama (opsiyonel)"
          value={description}
          onChangeText={setDescription}
          placeholder="Örn. Nakit tahsilat"
        />

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <Button
          title="Tahsilatı kaydet"
          onPress={onSubmit}
          disabled={!valid || dueInvalid}
          loading={recordPayment.isPending}
        />
      </Card>

      {/* Bu cariye giren tahsilatlar — ofisin kaydettiği de dahil. Plasiyer
          ödenmiş bir borcu ikinci kez istememeli. */}
      <View className="gap-3">
        <Text className="text-sm font-medium text-neutral-500">
          Son tahsilatlar
        </Text>
        {(history.data ?? []).length === 0 ? (
          <Empty text="Bu firmada kayıtlı tahsilat yok." />
        ) : (
          history.data!.slice(0, 20).map((p) => (
            <Card key={p.id}>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-neutral-900 dark:text-neutral-100">
                    {formatMoney(p.amount)}
                    {p.collectionMethod
                      ? ` · ${COLLECTION_METHOD_LABELS[p.collectionMethod]}`
                      : ""}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {formatDateTime(p.createdAt)}
                    {p.recordedByName ? ` · ${p.recordedByName}` : ""}
                  </Text>
                  {p.description ? (
                    <Text className="text-xs text-neutral-500">
                      {p.description}
                    </Text>
                  ) : null}
                </View>
                {p.reversedById ? <Badge label="İptal" tone="red" /> : null}
              </View>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/** "31.12.2026" → ISO gün. Geçersizse null — çağıran gönderimi engeller. */
function parseTrDate(input: string): string | null {
  const m = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  // Rolled-over dates (32.01) come back as a different day than typed.
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd)
  ) {
    return null;
  }
  return date.toISOString();
}

function Picker({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const on = o.key === selected;
          return (
            <Pressable
              key={o.key || "__default"}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(o.key)}
              className={`items-center rounded-xl border px-3 py-2.5 ${
                on
                  ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              <Text
                className={
                  on
                    ? "font-semibold text-indigo-700 dark:text-indigo-300"
                    : "text-neutral-700 dark:text-neutral-300"
                }
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
