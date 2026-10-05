"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import {
  ORDER_STATUS_GROUP_LABELS,
  ORDER_STATUS_GROUPS,
  parseOrderStatusGroup,
  type OrderStatus,
  type OrderStatusGroup,
  type PaymentMethod,
} from "@repo/types";
import { apiGet, apiPost } from "@/lib/fetcher";
import { formatTRY } from "@/lib/format";
import {
  Button,
  Checkbox,
  ErrorLine,
  LinkButton,
  TextInput,
} from "@/components/form";
import {
  Badge,
  EmptyState,
  LoadingState,
  TBody,
  THead,
  Table,
  Tabs,
  Td,
  Th,
  type BadgeTone,
} from "@/components/ui";
import { ShowMore, useVisibleSlice } from "@/components/show-more";
import { useAdvancedView } from "@/components/ui-mode";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  grandTotal: string;
  createdAt: string;
  company: { id: string; name: string };
  createdBy: { id: string; name: string };
  _count: { items: number };
}

type TabKey = OrderStatusGroup | "tumu";

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  PENDING_CREDIT: "Kredi onayı bekliyor",
  CONFIRMED: "Onaylandı",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal",
  REJECTED: "Reddedildi",
};

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PENDING_CREDIT: "warning",
  CONFIRMED: "success",
  PROCESSING: "info",
  SHIPPED: "brand",
  DELIVERED: "success",
  CANCELLED: "neutral",
  REJECTED: "danger",
};

const TAB_KEYS: readonly TabKey[] = [
  "tumu",
  ...(Object.keys(ORDER_STATUS_GROUPS) as OrderStatusGroup[]),
];

const TAB_LABELS: Record<TabKey, string> = {
  tumu: "Tümü",
  ...ORDER_STATUS_GROUP_LABELS,
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function OrdersBoard({
  canApproveCredit,
  canAct = true,
  companyId,
  canPrint = false,
  framed = true,
  filters = true,
  group,
  showCompany = !companyId,
  emptyLabel = "Sipariş yok.",
}: {
  /** SUPER_ADMIN may confirm PENDING_CREDIT orders; company admins may not. */
  canApproveCredit: boolean;
  /** False for read-only surfaces (company staff), which hide the buttons. */
  canAct?: boolean;
  /**
   * Scope the list to one company. Needed when a rep or super admin is working
   * on a customer's behalf — without it they would get their whole portfolio.
   * The server authorizes it either way.
   */
  companyId?: string;
  /** Fiş/etiket basımı sütunu çıksın mı (`documents.view`). */
  canPrint?: boolean;
  /**
   * Kendi çerçevesini çizsin mi. Panoda tablo bir `Panel`in içine giriyor ve
   * iki kenar çizgisi üst üste biniyordu — orada çerçeveyi dıştaki panel tutar.
   */
  framed?: boolean;
  /**
   * Durum sekmeleri ve arama kutusu. İkisi de adreste (`?durum=`, `?ara=`):
   * sekmede geri tuşu bir önceki sekmeye dönüyor ve ekran görüntüsü betiği
   * bir sekmeyi düğmeye basmadan çekebiliyor. Panodaki kısa liste süzgeçsiz.
   */
  filters?: boolean;
  /** Süzgeçsiz listede sabit grup — panoda "onay bekleyen". */
  group?: OrderStatusGroup;
  /**
   * Firma sütunu. Tek firmanın listesinde her satıra aynı adı yazmak bir
   * sütunu boşa harcıyordu.
   */
  showCompany?: boolean;
  emptyLabel?: string;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const urlParams = useSearchParams();
  const advanced = useAdvancedView();

  const tab: TabKey = filters
    ? (parseOrderStatusGroup(urlParams.get("durum")) ?? "tumu")
    : (group ?? "tumu");
  const search = filters ? (urlParams.get("ara") ?? "") : "";

  // Sekme geçmişe yazılıyor (`push`): geri tuşu bir önceki sekmeye dönsün.
  // Arama yazılmıyor (`replace`): her durak bir geçmiş satırı olurdu.
  // İlk sürüm ikisini de `replace` ile yazıyordu ve geri tuşu kullanıcıyı
  // listeden tamamen çıkarıyordu — Playwright testi yakaladı.
  const setUrlParam = (
    key: string,
    value: string | null,
    mode: "push" | "replace",
  ) => {
    const next = new URLSearchParams(urlParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };

  // Kutu her tuşta adresi değiştirmiyor: her harf bir istek olurdu. Yazı
  // yerelde duruyor, yazmak durunca adrese gidiyor.
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    if (!filters || draft.trim() === search) return;
    const timer = setTimeout(
      () => setUrlParam("ara", draft.trim() || null, "replace"),
      400,
    );
    return () => clearTimeout(timer);
    // setUrlParam her çizimde yeni; tetik yazı ve adres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, search, filters]);

  // Toplu basım seçimi. Ekranda tutuluyor, sunucuya yalnızca basım anında
  // kimlik listesi olarak gidiyor — "seçili siparişler" diye kalıcı bir kavram
  // yaratmanın karşılığı yok.
  //
  // Toplu basım gelişmiş görünümde: günde bir kez kullanılan bir araç her
  // satıra bir kutu, listenin üstüne bir şerit ekliyordu. Satırdaki tek fiş
  // simgesi basit görünümde de duruyor.
  const [selected, setSelected] = useState<string[]>([]);
  const bulkPrint = canPrint && advanced;

  const ordersQuery = useQuery({
    queryKey: ["orders", companyId ?? null, tab, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (tab !== "tumu") params.set("durum", tab);
      if (search) params.set("q", search);
      const qs = params.toString();
      return apiGet<{
        orders: OrderListItem[];
        counts: Record<TabKey, number>;
      }>(qs ? `/api/orders?${qs}` : "/api/orders");
    },
    // Sekme değişirken tablo "Yükleniyor"a düşüp zıplamasın.
    placeholderData: (prev) => prev,
  });

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "approve" | "reject" }) =>
      apiPost(`/api/orders/${id}/${kind}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  // Sunucu yüzde kesiyor ve yüz satır beş bin piksel: pano ekranı altındaki
  // her şeyi fotoğrafın dışına itiyordu. Kesme çizimde — "hepsini seç" hâlâ
  // gelen siparişlerin tamamını seçiyor, çünkü seçim listeyi değil veriyi
  // kapsıyor.
  const page = useVisibleSlice(ordersQuery.data?.orders ?? [], 25);

  if (ordersQuery.isLoading) {
    return <LoadingState />;
  }
  if (ordersQuery.isError) return <ErrorLine error={ordersQuery.error} />;

  const orders = ordersQuery.data?.orders ?? [];
  const counts = ordersQuery.data?.counts;

  const empty = search
    ? `"${search}" ile eşleşen sipariş yok.`
    : filters && tab !== "tumu"
      ? `${TAB_LABELS[tab]} sipariş yok.`
      : emptyLabel;

  return (
    <div
      className={
        framed ? "overflow-hidden rounded-lg border border-line bg-panel" : ""
      }
    >
      {filters && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-3">
          <Tabs
            value={tab}
            onChange={(next) => {
              setSelected([]);
              setUrlParam("durum", next === "tumu" ? null : next, "push");
            }}
            items={TAB_KEYS.map((key) => ({
              key,
              label: TAB_LABELS[key],
              count: counts?.[key],
            }))}
          />
          <TextInput
            size="sm"
            type="search"
            aria-label="Sipariş ara"
            placeholder={showCompany ? "Sipariş no, firma" : "Sipariş no"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mb-2 w-52"
          />
        </div>
      )}
      <ErrorLine error={action.error} />
      {bulkPrint && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="text-xs text-ink-faint">
            {selected.length} sipariş seçili
          </span>
          <LinkButton
            href={`/documents/labels?kind=ORDER_RECEIPT&orders=${selected.join(",")}`}
            target="_blank"
            rel="noreferrer"
          >
            <Printer className="h-3.5 w-3.5" />
            Sipariş fişi (80 mm)
          </LinkButton>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-ink-faint transition-colors hover:text-ink"
          >
            Seçimi temizle
          </button>
        </div>
      )}
      {orders.length === 0 ? (
        <EmptyState label={empty} />
      ) : (
        <Table>
          <THead>
            <tr>
              {bulkPrint && (
                <Th className="w-8">
                  <Checkbox
                    aria-label="Tümünü seç (toplu fiş)"
                    checked={
                      selected.length > 0 && selected.length === orders.length
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? orders.map((o) => o.id) : [],
                      )
                    }
                  />
                </Th>
              )}
              <Th>Sipariş</Th>
              <Th>Tarih</Th>
              {showCompany && <Th>Firma</Th>}
              <Th align="right">Tutar</Th>
              <Th>Durum</Th>
              <Th align="right">
                <span className="sr-only">İşlem</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {page.visible.map((o) => {
              const pending =
                canAct &&
                (o.status === "PENDING_APPROVAL" ||
                  o.status === "PENDING_CREDIT");
              const canApprove =
                o.status === "PENDING_APPROVAL" ||
                (o.status === "PENDING_CREDIT" && canApproveCredit);
              return (
                <tr key={o.id}>
                  {bulkPrint && (
                    <Td>
                      <Checkbox
                        aria-label={`${o.orderNumber} seç`}
                        checked={selected.includes(o.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, o.id]
                              : prev.filter((id) => id !== o.id),
                          )
                        }
                      />
                    </Td>
                  )}
                  {/* Oluşturan ve kalem sayısı ayrı sütun değil, numaranın
                      altında: satırı ayırt etmiyorlar, açıklıyorlar. */}
                  <Td>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <div className="text-xs text-ink-faint">
                      {o._count.items} kalem · {o.createdBy.name}
                    </div>
                  </Td>
                  <Td muted numeric>
                    {formatDay(o.createdAt)}
                  </Td>
                  {showCompany && <Td>{o.company.name}</Td>}
                  <Td align="right" numeric>
                    {formatTRY(o.grandTotal)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[o.status]}>
                      {STATUS_LABEL[o.status]}
                    </Badge>
                  </Td>
                  <Td align="right">
                    {/* Tek sıra: düğmeler ve fiş simgesi alt alta binince
                        bekleyen satır ötekilerin iki katı boya çıkıyordu. */}
                    <div className="flex items-center justify-end gap-1.5">
                      {pending && canApprove && (
                        <Button
                          variant="success"
                          size="sm"
                          loading={action.isPending}
                          onClick={() =>
                            action.mutate({ id: o.id, kind: "approve" })
                          }
                        >
                          Onayla
                        </Button>
                      )}
                      {/* Ret sessiz kırmızı: dolu kırmızı düğme, satırın asıl
                          eylemi olan "Onayla"dan daha çok bakılıyordu. */}
                      {pending && (
                        <Button
                          variant="dangerQuiet"
                          size="sm"
                          loading={action.isPending}
                          onClick={() =>
                            action.mutate({ id: o.id, kind: "reject" })
                          }
                        >
                          Reddet
                        </Button>
                      )}
                      {canPrint && (
                        <a
                          href={`/documents/labels?kind=ORDER_RECEIPT&orders=${o.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Sipariş fişi"
                          aria-label={`${o.orderNumber} fişi`}
                          className="inline-flex p-1 text-ink-faint transition-colors hover:text-ink"
                        >
                          <Printer className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}
      {/* Sayaç çerçevenin içinde ama tablonun dışında: satır değil, liste
          hakkında bir cümle. Çerçevesiz hâlde de iç boşluklu — panodaki
          panel gövdesi boşluksuz ve sayaç kenara yapışıyordu. */}
      <div className="px-4 pb-3">
        <ShowMore
          visible={page.visible.length}
          total={page.total}
          hidden={page.hidden}
          onMore={page.showMore}
          noun="sipariş"
        />
      </div>
    </div>
  );
}
