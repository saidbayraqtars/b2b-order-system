import { requirePage } from "@/lib/guard";
import { RepNav } from "@/components/rep-nav";
import { TargetScorecard } from "@/components/target-scorecard";
import { RepDashboard } from "./_components/rep-dashboard";

export default async function RepDashboardPage() {
  // requirePage, not requireUser: a wrong-role visitor belongs on their own
  // landing route, not on a thrown 403 in the middle of an HTML response.
  const user = await requirePage(["SALES_REP", "SUPER_ADMIN"]);

  return (
    <RepNav userName={user.name} permissions={user.permissions} current="/rep">
      {/* 6xl, 5xl değil: dört sayı kutusu 1024 piksele bölününce her biri 245
          piksel kalıyor ve yedi haneli bir ciro 32 puntoyla oraya sığmayıp
          ikinci satıra sarıyordu (ekran görüntüsünde görüldü). Portföy tablosu
          da zaten altı sütun. */}
      <div className="mx-auto max-w-6xl">
        {/* Hedef karnesi en üstte: günün ilk sorusu "nerede duruyorum". */}
        <TargetScorecard salesRepId={user.id} />
        <RepDashboard />
      </div>
    </RepNav>
  );
}
