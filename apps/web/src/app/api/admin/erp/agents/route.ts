import { createErpAgent, listErpAgents } from "@repo/services";
import { createErpAgentSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET  /api/admin/erp/agents — ajanlar ve son görülme bilgileri.
// POST /api/admin/erp/agents — yeni ajan + token.
//
// The token comes back exactly once, in the POST response. It is stored hashed,
// so there is no endpoint that can show it again — losing it means rotating it.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    return Response.json({ agents: await listErpAgents() });
  });
}

export function POST(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createErpAgentSchema);
    return Response.json(await createErpAgent(input.name, input.erp), { status: 201 });
  });
}
