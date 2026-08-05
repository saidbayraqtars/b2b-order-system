import { createAnnouncement, listAllAnnouncements } from "@repo/services";
import { createAnnouncementSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/announcements — all announcements, expired ones included.
// POST /api/admin/announcements
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    return Response.json({ announcements: await listAllAnnouncements() });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createAnnouncementSchema);

    return Response.json(await createAnnouncement(input), { status: 201 });
  });
}
