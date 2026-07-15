import { requireUser } from "@/lib/guard";

export default async function PortalDashboard() {
  const user = await requireUser(["COMPANY_ADMIN", "COMPANY_STAFF", "SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-bold">B2B Portal</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        {user.name} — {user.role}
      </p>
    </main>
  );
}
