import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  CollectionMethod,
  CreateOrderInput,
  OrderStatus,
  PaymentMethod,
  VisitRequestStatus,
} from "@repo/types";
import { apiFetch, apiUpload, qs } from "./api";
import { authToken } from "@/store/auth";
import type {
  AccountProfile,
  Announcement,
  CartView,
  ChequeDetails,
  CatalogProduct,
  Category,
  CashAccount,
  CheckInRecord,
  Company,
  CompanyAging,
  Courier,
  CreateOrderResult,
  DeliveryRow,
  OrderDetail,
  OrderQuote,
  OrderSummary,
  PaymentOptions,
  PaymentRow,
  RecordPaymentResult,
  Statement,
  TargetProgress,
  VisitRequestRow,
} from "./types";

// All reads/writes go through the same bearer-token wrapper. Query keys are
// company-scoped wherever the API response depends on the selected customer.

function get<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { token: authToken() });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body, token: authToken() });
}

function patch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body, token: authToken() });
}

function del<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE", token: authToken() });
}

export const keys = {
  companies: ["companies"] as const,
  catalog: (companyId: string, categoryId?: string, search?: string) =>
    ["catalog", companyId, categoryId ?? "", search ?? ""] as const,
  categories: ["categories"] as const,
  orders: (companyId?: string) => ["orders", companyId ?? "all"] as const,
  checkIns: (companyId?: string) => ["checkins", companyId ?? "all"] as const,
  statement: (companyId: string) => ["statement", companyId] as const,
  aging: (companyId: string) => ["aging", companyId] as const,
  paymentOptions: (companyId: string) => ["payment-options", companyId] as const,
  cart: (companyId: string) => ["cart", companyId] as const,
  announcements: (companyId: string) => ["announcements", companyId] as const,
  visitRequests: (day?: string) => ["visit-requests", day ?? "all"] as const,
  targets: ["target-progress"] as const,
  deliveries: (includeDelivered: boolean) =>
    ["deliveries", includeDelivered] as const,
  cashAccounts: ["cash-accounts"] as const,
  payments: (companyId?: string) => ["payments", companyId ?? "mine"] as const,
  account: ["account"] as const,
};

/** Customers the caller may act on (rep portfolio, or own company). */
export function useCompanies(): UseQueryResult<Company[]> {
  return useQuery({
    queryKey: keys.companies,
    queryFn: async () =>
      (await get<{ companies: Company[] }>("/api/companies")).companies,
  });
}

export function useCatalog(
  companyId: string,
  categoryId?: string,
  search?: string,
): UseQueryResult<CatalogProduct[]> {
  return useQuery({
    queryKey: keys.catalog(companyId, categoryId, search),
    queryFn: async () =>
      (
        await get<{ products: CatalogProduct[] }>(
          `/api/catalog${qs({ companyId, categoryId, search })}`,
        )
      ).products,
    enabled: !!companyId,
  });
}

/** The category tree, for narrowing the catalog. Same for every customer. */
export function useCategories(): UseQueryResult<Category[]> {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () =>
      (await get<{ categories: Category[] }>("/api/categories")).categories,
    // A tree that changes a few times a year does not need a 30 s staleness.
    staleTime: 10 * 60_000,
  });
}

/** What this customer should see on the hub screen right now. */
export function useAnnouncements(
  companyId: string,
): UseQueryResult<Announcement[]> {
  return useQuery({
    queryKey: keys.announcements(companyId),
    queryFn: async () =>
      (
        await get<{ announcements: Announcement[] }>(
          `/api/announcements${qs({ companyId })}`,
        )
      ).announcements,
    enabled: !!companyId,
  });
}

export function useOrders(companyId?: string): UseQueryResult<OrderSummary[]> {
  return useQuery({
    queryKey: keys.orders(companyId),
    queryFn: async () =>
      (await get<{ orders: OrderSummary[] }>(`/api/orders${qs({ companyId })}`))
        .orders,
  });
}

export function useOrder(orderId: string): UseQueryResult<OrderDetail> {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: async () =>
      (await get<{ order: OrderDetail }>(`/api/orders/${orderId}`)).order,
  });
}

/** Full cari ekstre for a company (no date filter — the app shows all of it). */
export function useStatement(companyId: string): UseQueryResult<Statement> {
  return useQuery({
    queryKey: keys.statement(companyId),
    queryFn: () => get<Statement>(`/api/companies/${companyId}/statement`),
    enabled: !!companyId,
  });
}

export function useCompanyAging(companyId: string): UseQueryResult<CompanyAging> {
  return useQuery({
    queryKey: keys.aging(companyId),
    queryFn: () => get<CompanyAging>(`/api/companies/${companyId}/aging`),
    enabled: !!companyId,
  });
}

export function useCheckIns(companyId?: string): UseQueryResult<CheckInRecord[]> {
  return useQuery({
    queryKey: keys.checkIns(companyId),
    queryFn: async () =>
      (
        await get<{ checkIns: CheckInRecord[] }>(
          `/api/checkins${qs({ companyId })}`,
        )
      ).checkIns,
  });
}

/**
 * The settlement menu this customer is actually offered.
 *
 * The device must not guess it: a customer restricted to nakit/havale would be
 * shown açık hesap and get a 422 at checkout. The list is per-company, so a rep
 * switching customers gets a different menu without changing anything else.
 */
export function usePaymentOptions(
  companyId: string,
): UseQueryResult<PaymentOptions> {
  return useQuery({
    queryKey: keys.paymentOptions(companyId),
    queryFn: () => get<PaymentOptions>(`/api/payment-options${qs({ companyId })}`),
    enabled: !!companyId,
  });
}

// ── Sepet ──
//
// The cart lives on the server, one row per (company, caller). It used to be a
// zustand store on the device, which meant a rep who built a basket on the
// phone and then opened the portal on a laptop found it empty, and a phone that
// ran out of battery lost the order. Nothing about the shape changed for the
// screens — quantity in, priced lines out — but the source of truth moved.

export function useCart(companyId: string): UseQueryResult<CartView> {
  return useQuery({
    queryKey: keys.cart(companyId),
    queryFn: () => get<CartView>(`/api/cart${qs({ companyId })}`),
    enabled: !!companyId,
    // The cart is what the user is editing right now; a cached copy that is
    // half a minute out of date shows the quantity they just changed back.
    staleTime: 0,
  });
}

export interface CartItemVars {
  companyId: string;
  variantId: string;
  quantity: number;
  /** true → add to what is already there ("sepete ekle"); false → set it. */
  increment?: boolean;
}

/**
 * Add / set / remove one line.
 *
 * One endpoint for all three because quantity 0 *is* removal — a separate
 * delete call would give the two operations different failure modes for the
 * same user action.
 */
export function useUpsertCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CartItemVars) => post<CartView>("/api/cart/items", vars),
    // The server answers with the whole cart, so write it straight into the
    // cache: a refetch would leave the row the user just tapped flickering
    // between the old and the new quantity.
    onSuccess: (cart, vars) => qc.setQueryData(keys.cart(vars.companyId), cart),
  });
}

export function useClearCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) =>
      del<{ ok: true }>(`/api/cart${qs({ companyId })}`),
    onSuccess: (_res, companyId) =>
      qc.invalidateQueries({ queryKey: keys.cart(companyId) }),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) =>
      post<CreateOrderResult>("/api/orders", input),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      // Order debt moves the cari balance shown on the customer list.
      qc.invalidateQueries({ queryKey: keys.companies });
      qc.invalidateQueries({ queryKey: ["catalog", input.companyId] });
      qc.invalidateQueries({ queryKey: keys.statement(input.companyId) });
      qc.invalidateQueries({ queryKey: keys.aging(input.companyId) });
      // Ordering empties the cart server-side; the cached copy has to follow or
      // the basket badge keeps counting goods that are now an order.
      qc.invalidateQueries({ queryKey: keys.cart(input.companyId) });
    },
  });
}

// ── Sipariş aksiyonları ──
//
// Read-only was the old answer here, and it cost the buyer a laptop for one
// tap: an order waiting on their own approval could only be released from the
// portal. Which actions exist is not decided on the device — `availableTransitions`
// on the order already answers it for this caller, and the API re-checks.

export function useOrderAction(orderId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["order", orderId] });
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: keys.companies });
  };

  const approve = useMutation({
    mutationFn: () => post<{ status: OrderStatus }>(`/api/orders/${orderId}/approve`),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: () => post<{ status: OrderStatus }>(`/api/orders/${orderId}/reject`),
    onSuccess: invalidate,
  });
  const changeStatus = useMutation({
    mutationFn: (vars: { status: OrderStatus; note?: string }) =>
      post<{ status: OrderStatus }>(`/api/orders/${orderId}/status`, vars),
    onSuccess: invalidate,
  });

  return { approve, reject, changeStatus };
}

export interface QuoteVars {
  companyId: string;
  paymentMethod: PaymentMethod;
  /** Vade picked from the customer's own menu; the server re-checks it. */
  paymentTermId?: string;
  couponCode?: string;
  items: Array<{ variantId: string; quantity: number }>;
}

/**
 * Price the basket on the server before submitting it.
 *
 * Campaigns are decided server-side, so a device cannot total a cart honestly
 * any more — it can only guess at the goods and miss every discount. This asks
 * for the real figure, and the same call is what validates the coupon: an
 * unusable code comes back as a typed error, not as a surprise at checkout.
 */
export function useOrderQuote(vars: QuoteVars, enabled: boolean) {
  return useQuery<OrderQuote>({
    queryKey: [
      "order-quote",
      vars.companyId,
      vars.paymentMethod,
      vars.paymentTermId ?? "",
      vars.couponCode ?? "",
      vars.items,
    ],
    queryFn: () =>
      post<OrderQuote>("/api/orders/quote", {
        companyId: vars.companyId,
        paymentMethod: vars.paymentMethod,
        ...(vars.paymentTermId ? { paymentTermId: vars.paymentTermId } : {}),
        ...(vars.couponCode ? { couponCode: vars.couponCode } : {}),
        items: vars.items,
      }),
    enabled: enabled && vars.items.length > 0,
    retry: false,
  });
}

export interface CheckInVars {
  companyId: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}

export function useCreateCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CheckInVars) =>
      post<{ checkIn: CheckInRecord }>("/api/checkins", vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkins"] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (checkInId: string) =>
      post<{ checkIn: CheckInRecord }>(`/api/checkins/${checkInId}/checkout`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkins"] }),
  });
}

export interface PaymentVars {
  companyId: string;
  amount: number;
  /** Nakit, havale, çek… — siparişin ödeme yöntemiyle aynı şey değil. */
  collectionMethod: CollectionMethod;
  description?: string;
  /** Hangi kasa/banka hesabına girdi. Boş bırakılırsa varsayılan kasa. */
  cashAccountId?: string | null;
  /** Çek/senet künyesi — yalnızca o iki yöntemde okunur, hepsi opsiyonel. */
  cheque?: ChequeDetails;
  /**
   * Tekrar anahtarı. Sahada şebeke kopunca istemci aynı tahsilatı ikinci kez
   * gönderiyordu; sunucu aynı anahtarla ikinci bir kayıt yazmıyor ve ilkinin
   * sonucunu döndürüyor. Ekran her form için bir kez üretir.
   */
  idempotencyKey?: string;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: PaymentVars) =>
      post<RecordPaymentResult>("/api/payments", vars),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: keys.companies });
      qc.invalidateQueries({ queryKey: keys.statement(vars.companyId) });
      qc.invalidateQueries({ queryKey: keys.aging(vars.companyId) });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

/** Kasa/banka seçicisi. Bakiye döndürmez — plasiyerin işi değil. */
export function useCashAccounts(): UseQueryResult<CashAccount[]> {
  return useQuery({
    queryKey: keys.cashAccounts,
    queryFn: async () =>
      (await get<{ accounts: CashAccount[] }>("/api/cash-accounts")).accounts,
    staleTime: 10 * 60_000,
  });
}

/**
 * Tahsilat listesi.
 *
 * Firma verilirse o cariye giren her tahsilat — ofisin kaydettiği de dahil,
 * yoksa plasiyer ödenmiş bir borcu ikinci kez ister. Firma verilmezse
 * "bugün ben ne topladım".
 */
export function usePayments(companyId?: string): UseQueryResult<PaymentRow[]> {
  return useQuery({
    queryKey: keys.payments(companyId),
    queryFn: async () =>
      (await get<{ payments: PaymentRow[] }>(`/api/payments${qs({ companyId })}`))
        .payments,
  });
}

// ── Ziyaret çağrıları (bayi çağırır, plasiyerin gününe düşer) ──

export function useVisitRequests(day?: string): UseQueryResult<VisitRequestRow[]> {
  return useQuery({
    queryKey: keys.visitRequests(day),
    queryFn: async () =>
      (
        await get<{ requests: VisitRequestRow[] }>(
          `/api/visit-requests${qs({ day })}`,
        )
      ).requests,
  });
}

export function useUpdateVisitRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: VisitRequestStatus }) =>
      patch<{ request: VisitRequestRow }>(`/api/visit-requests/${vars.id}`, {
        status: vars.status,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit-requests"] }),
  });
}

/**
 * Günün sırasını yaz.
 *
 * Listenin tamamı gidiyor, "şunu bir yukarı al" isteği değil: iki satırın yeri
 * iki ayrı yazma olsaydı araya giren bir değişiklikte sıra bozulurdu. Sıra
 * sunucuda duruyor, cihazda değil — plasiyer sabah masaüstünde plan yapıp gün
 * içinde telefona bakıyor.
 */
export function useReorderVisits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<null>("/api/visit-requests/reorder", {
        method: "POST",
        body: { ids },
        token: authToken(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit-requests"] }),
  });
}

/** Kendi hedef karnem. Kendi hedefini görmek için izin gerekmiyor. */
export function useTargetProgress(
  salesRepId: string | undefined,
): UseQueryResult<TargetProgress[]> {
  return useQuery({
    queryKey: keys.targets,
    queryFn: async () =>
      (
        await get<{ progress: TargetProgress[] }>(
          `/api/sales-targets${qs({ salesRepId, progress: "1" })}`,
        )
      ).progress,
    enabled: !!salesRepId,
  });
}

// ── Dağıtım (kurye) ──

export function useDeliveries(
  includeDelivered: boolean,
): UseQueryResult<{ deliveries: DeliveryRow[]; couriers: Courier[] }> {
  return useQuery({
    queryKey: keys.deliveries(includeDelivered),
    queryFn: () =>
      get<{ deliveries: DeliveryRow[]; couriers: Courier[] }>(
        `/api/deliveries${includeDelivered ? "?delivered=1" : ""}`,
      ),
  });
}

export function useAssignCourier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { shipmentId: string; courierId: string | null }) =>
      patch<{ delivery: DeliveryRow }>(`/api/deliveries/${vars.shipmentId}`, {
        courierId: vars.courierId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export interface ConfirmDeliveryVars {
  shipmentId: string;
  receivedByName: string;
  proofPhotoUrl?: string | null;
  note?: string;
}

export function useConfirmDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, ...body }: ConfirmDeliveryVars) =>
      post<{ delivery: DeliveryRow }>(`/api/deliveries/${shipmentId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

/** İmzalı belgenin fotoğrafı. Kendi ucu var: kuryeye katalog yetkisi verilmez. */
export function useUploadProof() {
  return useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) =>
      apiUpload<{ url: string; mime: string; bytes: number }>(
        "/api/deliveries/uploads",
        file,
        authToken(),
      ),
  });
}

// ── Hesabım ──

export function useAccount(): UseQueryResult<AccountProfile> {
  return useQuery({
    queryKey: keys.account,
    queryFn: async () =>
      (await get<{ account: AccountProfile }>("/api/account")).account,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; phone?: string }) =>
      patch<{ account: AccountProfile }>("/api/account", vars),
    onSuccess: (res) => qc.setQueryData(keys.account, res.account),
  });
}

/**
 * Change your own password.
 *
 * Succeeding revokes every session including this device's token, which is why
 * the caller must send the user back to the login screen — the next request
 * would 401 anyway, but with no explanation of what happened.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      post<{ ok: true; sessionRevoked: boolean }>("/api/account/password", vars),
  });
}
