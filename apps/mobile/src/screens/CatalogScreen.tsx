import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  useCart,
  useCatalog,
  useCategories,
  useUpsertCartItem,
} from "@/lib/queries";
import { mediaUrl } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { initialQty } from "@/lib/quantity";
import { Badge, Card, Empty, ErrorState, Loading } from "@/components/ui";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import type { CatalogProduct, CatalogVariant, Category } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Company-scoped catalog: prices already resolved server-side for this customer
// (group tier + company discounts). Variants without a price are not orderable.
export default function CatalogScreen({ navigation, route }: ScreenProps<"Catalog">) {
  const { companyId, companyName } = route.params;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Okunmuş ama sonucu henüz değerlendirilmemiş barkod. Katalog isteği
  // dönünceye kadar burada bekliyor; dönünce aşağıdaki etki tek eşleşmeyi
  // sepete atıyor ve alanı boşaltıyor.
  const [pendingScan, setPendingScan] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<ScanNote | null>(null);

  const { data, isPending, error, refetch, isRefetching } = useCatalog(
    companyId,
    categoryId ?? undefined,
    query || undefined,
  );
  const categories = useCategories();
  const cart = useCart(companyId);
  const upsert = useUpsertCartItem();

  // Flat list of the tree: a phone has no room for an expanding sidebar, and a
  // two-level chip row is enough to narrow a few thousand products.
  const categoryChips = useMemo(
    () => flatten(categories.data ?? []),
    [categories.data],
  );

  const itemCount = (cart.data?.lines ?? []).reduce((s, l) => s + l.quantity, 0);
  // Ordered quantity per variant, so a card can say "sepette 24 adet" instead of
  // letting the rep add the same line three times without noticing.
  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of cart.data?.lines ?? []) map.set(l.variantId, l.quantity);
    return map;
  }, [cart.data]);

  // Okunan barkodun sonucu.
  //
  // Sepete **kendiliğinden ekleme yalnızca barkod kolonu birebir tuttuğunda**
  // yapılıyor. Sunucu araması `contains` çalıştığı için bir barkod ürün adına ya
  // da SKU'ya da denk gelebiliyor; öyle bir eşleşmeye dayanarak sipariş satırı
  // açmak, plasiyerin okuttuğunu sandığı şeyle sepete gireni ayırır. Birebir
  // eşleşme yoksa liste süzülmüş halde bırakılıyor, seçim insana kalıyor.
  useEffect(() => {
    if (!pendingScan || query !== pendingScan || isPending || !data) return;

    const hits = data.flatMap((p) =>
      p.variants
        .filter((v) => v.barcode && v.barcode === pendingScan)
        .map((v) => ({ product: p, variant: v })),
    );

    setPendingScan(null);

    if (hits.length === 1) {
      const { product, variant } = hits[0]!;
      if (variant.netUnitPrice == null) {
        setScanNote({ tone: "amber", text: `${product.name}: fiyat tanımsız` });
      } else if (variant.stock < Math.max(variant.moqUnits, 1)) {
        setScanNote({ tone: "amber", text: `${product.name}: stok yok` });
      } else {
        upsert.mutate({
          companyId,
          variantId: variant.id,
          quantity: initialQty(variant),
          increment: true,
        });
        setScanNote({
          tone: "green",
          text: `${product.name} · ${initialQty(variant)} adet sepete eklendi`,
        });
      }
      return;
    }

    if (hits.length > 1) {
      setScanNote({
        tone: "amber",
        text: `Bu barkod ${hits.length} varyanta tanımlı, birini seçin.`,
      });
      return;
    }

    setScanNote(
      data.length > 0
        ? { tone: "amber", text: `Barkod eşleşmedi, ${data.length} benzer sonuç.` }
        : { tone: "red", text: `Barkod bulunamadı: ${pendingScan}` },
    );
  }, [pendingScan, query, isPending, data, companyId, upsert]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: companyName,
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Cart", { companyId, companyName })}
        >
          <Text className="text-indigo-600">
            Sepet{itemCount ? ` (${itemCount})` : ""}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, companyId, companyName, itemCount]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      <View className="gap-3 p-4">
        <View className="flex-row gap-2">
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setScanNote(null);
            }}
            onSubmitEditing={() => setQuery(search.trim())}
            returnKeyType="search"
            placeholder="Ürün, SKU veya barkod ara"
            placeholderTextColor="#9ca3af"
            className="h-11 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Barkod okut"
            onPress={() => setScannerOpen(true)}
            className="h-11 w-11 items-center justify-center rounded-xl border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          >
            <Text className="text-lg">▥</Text>
          </Pressable>
        </View>

        {scanNote ? (
          <Pressable onPress={() => setScanNote(null)}>
            <Text
              className={`text-sm ${
                scanNote.tone === "green"
                  ? "text-green-700 dark:text-green-400"
                  : scanNote.tone === "amber"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-red-600"
              }`}
            >
              {scanNote.text}
            </Text>
          </Pressable>
        ) : null}
        {categoryChips.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-4">
              <CategoryChip
                label="Tümü"
                selected={categoryId === null}
                onPress={() => setCategoryId(null)}
              />
              {categoryChips.map((c) => (
                <CategoryChip
                  key={c.id}
                  label={c.label}
                  selected={categoryId === c.id}
                  onPress={() => setCategoryId(c.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>

      {upsert.isError ? (
        <Text className="px-4 pb-2 text-red-600">
          {upsert.error instanceof Error
            ? upsert.error.message
            : "Sepete eklenemedi"}
        </Text>
      ) : null}

      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        contentContainerClassName="gap-3 px-4 pb-8"
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
        ListEmptyComponent={<Empty text="Ürün bulunamadı." />}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            inCart={inCart}
            busy={upsert.isPending}
            onAdd={(variant) =>
              upsert.mutate({
                companyId,
                variantId: variant.id,
                // "Sepete ekle" adds a case to what is already there rather than
                // overwriting it — tapping twice means two cases, not one.
                quantity: initialQty(variant),
                increment: true,
              })
            }
          />
        )}
      />

      <BarcodeScanner
        visible={scannerOpen}
        title="Ürün barkodunu okutun"
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          setScannerOpen(false);
          // Açık bir kategori süzgeci okunan ürünü listeden dışarıda bırakabilir
          // ve sonuç "barkod bulunamadı" gibi görünür. Okutma niyeti açık: bu
          // ürünü bul.
          setCategoryId(null);
          setSearch(code);
          setQuery(code);
          setScanNote(null);
          setPendingScan(code);
        }}
      />
    </View>
  );
}

interface ScanNote {
  tone: "green" | "amber" | "red";
  text: string;
}

/** Depth-first walk of the category tree, indenting children by one level. */
function flatten(
  nodes: Category[],
  depth = 0,
): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => [
    { id: n.id, label: depth > 0 ? `· ${n.name}` : n.name },
    ...flatten(n.children, depth + 1),
  ]);
}

function CategoryChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-9 justify-center rounded-full border px-3 ${
        selected
          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950"
          : "border-neutral-300 dark:border-neutral-700"
      }`}
    >
      <Text
        className={`text-sm ${
          selected
            ? "font-semibold text-indigo-700 dark:text-indigo-300"
            : "text-neutral-700 dark:text-neutral-300"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProductCard({
  product,
  inCart,
  busy,
  onAdd,
}: {
  product: CatalogProduct;
  inCart: Map<string, number>;
  busy: boolean;
  onAdd: (variant: CatalogVariant) => void;
}) {
  const image = product.images[0];

  return (
    <Card>
      <View className="flex-row gap-3">
        {image ? (
          <Image
            source={{ uri: mediaUrl(image) }}
            className="h-14 w-14 rounded-lg bg-neutral-100 dark:bg-neutral-800"
            resizeMode="contain"
          />
        ) : null}
        <View className="flex-1">
          <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {product.name}
          </Text>
          {product.brand ? (
            <Text className="text-sm text-neutral-500">{product.brand}</Text>
          ) : null}
        </View>
      </View>

      <View className="mt-2 gap-2">
        {product.variants.map((v) => {
          const priced = v.netUnitPrice != null;
          const outOfStock = v.stock < Math.max(v.moqUnits, 1);
          const disabled = !priced || outOfStock || busy;
          const attrs = [v.color, v.size].filter(Boolean).join(" / ");
          const already = inCart.get(v.id) ?? 0;

          return (
            <View
              key={v.id}
              className="flex-row items-center justify-between gap-3 border-t border-neutral-100 pt-2 dark:border-neutral-800"
            >
              <View className="flex-1">
                <Text className="text-neutral-900 dark:text-neutral-100">
                  {attrs || v.sku}
                </Text>
                <Text className="text-xs text-neutral-500">
                  {v.sku} · koli {v.unitsPerCase} · min {v.moqUnits} · stok {v.stock}
                </Text>
                {priced ? (
                  <View className="mt-0.5 flex-row items-center gap-2">
                    <Text className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {formatMoney(v.netUnitPrice!)}
                    </Text>
                    {Number(v.discountPerUnit) > 0 ? (
                      <Text className="text-xs text-neutral-400 line-through">
                        {formatMoney(v.unitPrice!)}
                      </Text>
                    ) : null}
                    {/* Yabancı para listeden geliyorsa hangi sayıdan çevrildiği
                        yazılıyor — müşteri dolarla anlaştıysa onu arıyor. */}
                    {v.listCurrency && v.listCurrency !== "TRY" && v.listUnitPrice ? (
                      <Text className="text-xs text-neutral-400">
                        ≈ {formatMoney(v.listUnitPrice, v.listCurrency)}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Badge label="Fiyat tanımsız" tone="amber" />
                )}
                {already > 0 ? (
                  <Text className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400">
                    Sepette {already} adet
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onAdd(v)}
                className={`h-10 items-center justify-center rounded-xl px-4 ${
                  disabled ? "bg-neutral-200 dark:bg-neutral-800" : "bg-indigo-600"
                }`}
              >
                <Text
                  className={
                    disabled ? "text-neutral-500" : "font-semibold text-white"
                  }
                >
                  {outOfStock ? "Stok yok" : "Ekle"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
