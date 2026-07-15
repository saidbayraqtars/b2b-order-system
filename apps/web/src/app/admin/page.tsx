import { requireUser } from "@/lib/guard";

// Server-gated too (defense in depth beyond middleware).
export default async function AdminDashboard() {
  const user = await requireUser(["SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-bold">Admin Panel</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">{user.email}</p>
    </main>
  );
}
