import { listCustomerGroups } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/admin/customer-groups — price-tier targets for the price editor.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const groups = await listCustomerGroups();
    return Response.json({ groups });
  });
}
