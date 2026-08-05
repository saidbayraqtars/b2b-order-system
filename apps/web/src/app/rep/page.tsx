import { requirePage } from "@/lib/guard";
import { RepNav } from "@/components/rep-nav";
import { RepDashboard } from "./_components/rep-dashboard";

export default async function RepDashboardPage() {
  // requirePage, not requireUser: a wrong-role visitor belongs on their own
  // landing route, not on a thrown 403 in the middle of an HTML response.
  const user = await requirePage(["SALES_REP", "SUPER_ADMIN"]);

  return (
    <div>
      <RepNav userName={user.name} current="/rep" />
      <div className="mx-auto max-w-5xl px-4 pb-6">
        <RepDashboard />
      </div>
    </div>
  );
}
