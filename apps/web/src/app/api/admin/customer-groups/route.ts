import { createCustomerGroup, listCustomerGroups } from "@repo/services";
import { createCustomerGroupSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/customer-groups — price-tier targets for the price editor.
// POST /api/admin/customer-groups
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const groups = await listCustomerGroups();
    return Response.json({ groups });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createCustomerGroupSchema);

    return Response.json(await createCustomerGroup(input), { status: 201 });
  });
}
