import { deleteAnnouncement, updateAnnouncement } from "@repo/services";
import { updateAnnouncementSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function PATCH(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "announcements.manage");
    const input = await parseBody(req, updateAnnouncementSchema);

    return Response.json(await updateAnnouncement(params.id, input));
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "announcements.manage");
    await deleteAnnouncement(params.id);
    return new Response(null, { status: 204 });
  });
}
