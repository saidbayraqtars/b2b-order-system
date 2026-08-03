import { listOwnActivity } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/account/activity — the caller's own audit entries.
// Fixed to the session's own user id; there is no query parameter that could
// widen it to somebody else's history.
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser();
    return Response.json({ entries: await listOwnActivity(user.id, 20) });
  });
}
