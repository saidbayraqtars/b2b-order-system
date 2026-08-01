import { useLayoutEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useCatalog } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { cartTotals, useCart, type CartLineSeed } from "@/store/cart";
import { Badge, Card, Empty, ErrorState, Loading } from "@/components/ui";
import type { CatalogProduct, CatalogVariant } from "@/lib/types";
import type { ScreenProps } from "@/navigation/types";

// Company-scoped catalog: prices already resolved server-side for this customer
// (group tier + company discounts). Variants without a price are not orderable.
export default function CatalogScreen({ navigation, route }: ScreenProps<"Catalog">) {
  const { companyId, companyName } = route.params;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, isPending, error, refetch, isRefetching } = useCatalog(
    companyId,
    query || undefined,
  );

  const add = useCart((s) => s.add);
  const lines = useCart((s) => s.lines);
  const itemCount = cartTotals(lines).itemCount;

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
      <View className="p-4">
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setQuery(search.trim())}
          returnKeyType="search"
          placeholder="Ürün ara"
          placeholderTextColor="#9ca3af"
          className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </View>

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
            onAdd={(variant) =>
              add(seedFrom(item, variant))
            }
          />
        )}
      />
    </View>
  );
}

/** Map a catalog row to a cart line. Only called for priced variants. */
function seedFrom(product: CatalogProduct, v: CatalogVariant): CartLineSeed {
  return {
    variantId: v.id,
    sku: v.sku,
    productName: product.name,
    color: v.color,
    size: v.size,
    unitsPerCase: v.unitsPerCase,
    moqUnits: v.moqUnits,
    stock: v.stock,
    netUnitPrice: Number(v.netUnitPrice),
    vatRate: product.vatRate,
  };
}

function ProductCard({
  product,
  onAdd,
}: {
  product: CatalogProduct;
  onAdd: (variant: CatalogVariant) => void;
}) {
  return (
    <Card>
      <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        {product.name}
      </Text>
      {product.brand ? (
        <Text className="mb-2 text-sm text-neutral-500">{product.brand}</Text>
      ) : null}

      <View className="gap-2">
        {product.variants.map((v) => {
          const priced = v.netUnitPrice != null;
          const outOfStock = v.stock < Math.max(v.moqUnits, 1);
          const disabled = !priced || outOfStock;
          const attrs = [v.color, v.size].filter(Boolean).join(" / ");

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
                  </View>
                ) : (
                  <Badge label="Fiyat tanımsız" tone="amber" />
                )}
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
