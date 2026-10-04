import { z } from "zod";
import { getAdvancedView, setAdvancedView } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET/PUT /api/account/gorunum — kendi basit/gelişmiş görünüm tercihim.
//
// Kimlik oturumdan; gövdede hedef kullanıcı yok (hesap self-servisinin kuralı).
const schema = z.object({ advanced: z.boolean() });

export function GET() {
  return withAuthErrors(async () => {
    const user = await requireUser();
    return Response.json({ advanced: await getAdvancedView(user.id) });
  });
}

export function PUT(req: Request) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    const { advanced } = await parseBody(req, schema);
    return Response.json({ advanced: await setAdvancedView(user.id, advanced) });
  });
}
