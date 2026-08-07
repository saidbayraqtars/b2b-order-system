import { createAddress } from "@repo/services";
import { createAddressSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/admin/companies/:id/addresses — the first address of a company
// becomes its default whether or not the caller asked for it.
export function POST(req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "companies.manage");
    const input = await parseBody(req, createAddressSchema);

    return Response.json(
      { address: await createAddress(params.id, input) },
      { status: 201 },
    );
  });
}
