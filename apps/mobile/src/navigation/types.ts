import type { NativeStackScreenProps } from "@react-navigation/native-stack";

// One stack for both personas. Sales reps enter at Customers and pick a company;
// company users skip that step and land on Company with no params (their own
// company is resolved from /api/companies, which returns exactly one row).

export type RootStackParamList = {
  Login: undefined;
  Customers: undefined;
  Company: { companyId?: string; companyName?: string } | undefined;
  Catalog: { companyId: string; companyName: string };
  Cart: { companyId: string; companyName: string };
  Orders: { companyId?: string; companyName?: string } | undefined;
  OrderDetail: { orderId: string; orderNumber: string };
  Statement: { companyId: string; companyName: string };
  CheckIn: { companyId: string; companyName: string };
  Payment: { companyId: string; companyName: string };
};

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
