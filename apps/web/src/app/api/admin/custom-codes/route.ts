import { listCustomCodeFields } from "@repo/services";
import { requireAnyPermission, withAuthErrors } from "@/lib/guard";

// GET /api/admin/custom-codes — ürün ve firma özel kod tanımları (10'ar yuva).
//
// Okumak için üç izinden biri yetiyor: ürün formu (`products.view`), firma
// formu (`companies.view`) ve tanım ekranı (`organization.manage`) aynı listeyi
// okuyor. Tanımı **değiştirmek** yalnızca `organization.manage` ister
// (`[entity]/[slot]`).
export function GET() {
  return withAuthErrors(async () => {
    await requireAnyPermission(
      ["products.view", "companies.view", "organization.manage"],
      ["SUPER_ADMIN"],
    );
    const [product, company] = await Promise.all([
      listCustomCodeFields("PRODUCT"),
      listCustomCodeFields("COMPANY"),
    ]);
    return Response.json({ fields: { PRODUCT: product, COMPANY: company } });
  });
}
