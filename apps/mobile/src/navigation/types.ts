import type { NativeStackScreenProps } from "@react-navigation/native-stack";

// One stack, three entry points, decided by what the account is:
//  - field (plasiyer / süper admin) enters at Customers and picks a company,
//  - a courier enters at Deliveries and never sees a company at all,
//  - a company user skips the picker and lands on Company with no params (their
//    own company is resolved from /api/companies, which returns exactly one row).
//
// Screens the caller has no permission for are left out of the stack entirely
// rather than rendered and refused: a button that always answers 403 teaches
// nothing, and a nav entry to nowhere is worse than a shorter menu.

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
  VisitPlan: undefined;
  Targets: undefined;
  Deliveries: undefined;
  Account: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
