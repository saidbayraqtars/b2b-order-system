import { createVolumeTier, listVolumeTiers } from "@repo/services";
import { createVolumeTierSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/volume-tiers — the turnover ladder.
// POST /api/admin/volume-tiers
//
// The ladder is the same offer to every customer, so editing it reprices the
// whole book at once — super-admin only. A private rate for one cari is a
// CompanyDiscount, not a rung here.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const tiers = await listVolumeTiers();
    return Response.json({ tiers });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createVolumeTierSchema);

    return Response.json(await createVolumeTier(input), { status: 201 });
  });
}
