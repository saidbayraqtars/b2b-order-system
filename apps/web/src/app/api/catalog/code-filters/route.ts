import { listCatalogCodeFilters } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/catalog/code-filters — katalogda süzgeç olarak gösterilen özel
// kodlar ve seçilebilecek değerleri.
//
// Kataloğu görebilen herkes okuyabilir: liste yalnız **ürün** alanlarını ve
// "süzgeçte göster" işaretli olanları içeriyor. Firma özel kodları burada
// hiçbir zaman yok — alıcı başka firmaların segmentini görmemeli.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(
      ["COMPANY_ADMIN", "COMPANY_STAFF", "SALES_REP", "SUPER_ADMIN"],
      "products.view",
    );
    return Response.json({ filters: await listCatalogCodeFilters() });
  });
}
