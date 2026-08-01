import { requireUser, withAuthErrors } from "@/lib/guard";

// GET /api/mobile/me — validate the bearer token, return the current principal.
export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser();
    return Response.json({ user });
  });
}
