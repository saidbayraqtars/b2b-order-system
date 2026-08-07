import { listVariantOptions } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/variants — flat variant list for pickers (campaign gifts).
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "products.view");
    return Response.json({ variants: await listVariantOptions() });
  });
}
