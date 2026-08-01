import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { CreateOrderInput, PaymentMethod } from "@repo/types";
import { apiFetch, qs } from "./api";
import { authToken } from "@/store/auth";
import type {
  CatalogProduct,
  CheckInRecord,
  Company,
  CompanyAging,
  CreateOrderResult,
  OrderDetail,
  OrderSummary,
  RecordPaymentResult,
  Statement,
} from "./types";

// All reads/writes go through the same bearer-token wrapper. Query keys are
// company-scoped wherever the API response depends on the selected customer.

function get<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { token: authToken() });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body, token: authToken() });
}

export const keys = {
  companies: ["companies"] as const,
  catalog: (companyId: string, search?: string) =>
    ["catalog", companyId, search ?? ""] as const,
  orders: (companyId?: string) => ["orders", companyId ?? "all"] as const,
  checkIns: (companyId?: string) => ["checkins", companyId ?? "all"] as const,
  statement: (companyId: string) => ["statement", companyId] as const,
  aging: (companyId: string) => ["aging", companyId] as const,
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
  search?: string,
): UseQueryResult<CatalogProduct[]> {
  return useQuery({
    queryKey: keys.catalog(companyId, search),
    queryFn: async () =>
      (
        await get<{ products: CatalogProduct[] }>(
          `/api/catalog${qs({ companyId, search })}`,
        )
      ).products,
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
    },
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
  paymentMethod: PaymentMethod;
  description?: string;
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
    },
  });
}
