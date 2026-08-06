import { deleteVolumeTier, updateVolumeTier } from "@repo/services";
import { updateVolumeTierSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, updateVolumeTierSchema);

    return Response.json(await updateVolumeTier(params.id, input));
  });
}

// A rung customers are pinned to cannot be deleted — the service refuses with
// VOLUME_TIER_IN_USE and asks for it to be deactivated, so those customers keep
// the rate they were promised instead of silently losing it.
export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    await deleteVolumeTier(params.id);
    return new Response(null, { status: 204 });
  });
}
