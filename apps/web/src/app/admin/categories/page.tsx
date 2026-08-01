import { requirePage } from "@/lib/guard";
import { AdminNav } from "../_components/admin-nav";
import { CategoriesManager } from "./_components/categories-manager";

export default async function AdminCategoriesPage() {
  const user = await requirePage(["SUPER_ADMIN"]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <AdminNav email={user.email} current="/admin/categories" />
      <CategoriesManager />
    </main>
  );
}
