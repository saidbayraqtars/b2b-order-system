import { requireUser } from "@/lib/guard";

export default async function RepDashboard() {
  const user = await requireUser(["SALES_REP", "SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-bold">Plasiyer Paneli</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{user.name}</p>
    </main>
  );
}
