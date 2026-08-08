import { useLayoutEffect, useMemo, useState } from "react";
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
import type { CatalogProduct, CatalogVariant, Category } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Company-scoped catalog: prices already resolved server-side for this customer
// (group tier + company discounts). Variants without a price are not orderable.
export default function CatalogScreen({ navigation, route }: ScreenProps<"Catalog">) {
  const { companyId, companyName } = route.params;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: companyName,
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Cart", { companyId, companyName })}
        >
          <Text className="text-primary">
            Sepet{itemCount ? ` (${itemCount})` : ""}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, companyId, companyName, itemCount]);

  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View className="flex-1 bg-surface2">
      <View className="gap-3 p-4">
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setQuery(search.trim())}
          returnKeyType="search"
          placeholder="Ürün, SKU veya barkod ara"
          className="h-11 rounded-xl border border-border-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted"
        />
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
        <Text className="px-4 pb-2 text-danger">
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
    </View>
  );
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
          ? "border-primary bg-primary-soft"
          : "border-border-strong"
      }`}
    >
      <Text
        className={`text-sm ${
          selected
            ? "font-semibold text-on-primary-soft"
            : "text-fg"
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
            className="h-14 w-14 rounded-lg bg-surface3"
            resizeMode="contain"
          />
        ) : null}
        <View className="flex-1">
          <Text className="text-base font-semibold text-fg">
            {product.name}
          </Text>
          {product.brand ? (
            <Text className="text-sm text-fg-muted">{product.brand}</Text>
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
              className="flex-row items-center justify-between gap-3 border-t border-border pt-2"
            >
              <View className="flex-1">
                <Text className="text-fg">
                  {attrs || v.sku}
                </Text>
                <Text className="text-xs text-fg-muted">
                  {v.sku} · koli {v.unitsPerCase} · min {v.moqUnits} · stok {v.stock}
                </Text>
                {priced ? (
                  <View className="mt-0.5 flex-row items-center gap-2">
                    <Text className="font-semibold text-fg">
                      {formatMoney(v.netUnitPrice!)}
                    </Text>
                    {Number(v.discountPerUnit) > 0 ? (
                      <Text className="text-xs text-fg-muted line-through">
                        {formatMoney(v.unitPrice!)}
                      </Text>
                    ) : null}
                    {/* Yabancı para listeden geliyorsa hangi sayıdan çevrildiği
                        yazılıyor — müşteri dolarla anlaştıysa onu arıyor. */}
                    {v.listCurrency && v.listCurrency !== "TRY" && v.listUnitPrice ? (
                      <Text className="text-xs text-fg-muted">
                        ≈ {formatMoney(v.listUnitPrice, v.listCurrency)}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Badge label="Fiyat tanımsız" tone="amber" />
                )}
                {already > 0 ? (
                  <Text className="mt-0.5 text-xs text-primary">
                    Sepette {already} adet
                  </Text>
                ) : null}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => onAdd(v)}
                className={`h-10 items-center justify-center rounded-xl px-4 ${
                  disabled ? "bg-surface3" : "bg-primary"
                }`}
              >
                <Text
                  className={
                    disabled ? "text-fg-muted" : "font-semibold text-on-primary"
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
