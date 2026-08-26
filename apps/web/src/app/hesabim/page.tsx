import { getAccount, listOwnActivity, twoFactorStatus } from "@repo/services";
import { ROLE_LABELS } from "@repo/types";
import { defaultRouteForRole } from "@repo/auth/rbac";
import { requirePage } from "@/lib/guard";
import { PageHeader } from "@/components/ui";
import { AccountClient } from "./_components/account-client";

export const dynamic = "force-dynamic";

// Every authenticated role reaches this page — it is the one screen a user has
// that is about their own account rather than about the business.
const ALL_ROLES = ["SUPER_ADMIN", "COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP"] as const;

export default async function AccountPage() {
  // İkinci adım kapısından muaf tek ekran: zorunlu kapsamdaki kullanıcı
  // 2FA'sını buradan kuracak. Kapı burada da çalışsaydı yönlendirme kendi
  // üstüne kapanır ve hesap kilitlenirdi (bkz. guard.ts GuardOptions).
  const user = await requirePage(ALL_ROLES, undefined, { twoFactorGate: false });
  const [account, activity, twoFactor] = await Promise.all([
    getAccount(user.id),
    listOwnActivity(user.id, 20),
    twoFactorStatus(user.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Hesabım"
        subtitle={`${ROLE_LABELS[account.role]}${account.company ? ` · ${account.company.name}` : ""}`}
        back={{ href: defaultRouteForRole(user.role), label: "Panele dön" }}
      />

      <AccountClient
        initialAccount={account}
        initialActivity={activity}
        initialTwoFactor={twoFactor}
      />
    </main>
  );
}
