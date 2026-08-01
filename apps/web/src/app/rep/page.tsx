import { requirePage } from "@/lib/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { RepDashboard } from "./_components/rep-dashboard";

export default async function RepDashboardPage() {
  // requirePage, not requireUser: a wrong-role visitor belongs on their own
  // landing route, not on a thrown 403 in the middle of an HTML response.
  const user = await requirePage(["SALES_REP", "SUPER_ADMIN"]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Plasiyer Paneli</h1>
          <p className="text-sm text-neutral-500">{user.name}</p>
        </div>
        <SignOutButton />
      </header>

      <RepDashboard />
    </main>
  );
}
