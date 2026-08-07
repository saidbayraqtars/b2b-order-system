import { requirePage } from "@/lib/guard";
import { CategoriesManager } from "./_components/categories-manager";

export default async function AdminCategoriesPage() {
  await requirePage(["SUPER_ADMIN"], "products.view");
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <CategoriesManager />
    </main>
  );
}
