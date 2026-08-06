import { ingestCustomers } from "@repo/services";
import { erpCustomerBatchSchema } from "@repo/types";
import { withAuthErrors } from "@/lib/guard";
import { requireAgent } from "@/lib/erp-guard";
import { parseBody } from "@/lib/validate";

// POST /api/erp/customers — cari kartları, ajandan.
//
// Updates customers we already have; a code that matches nothing is recorded as
// an issue and skipped. It never creates: the ERP holds tens of thousands of
// cari, and which of them are B2B customers is somebody's decision.
export function POST(req: Request) {
  return withAuthErrors(async () => {
    const agent = await requireAgent(req);
    const { rows } = await parseBody(req, erpCustomerBatchSchema);
    return Response.json(await ingestCustomers(rows, agent.id));
  });
}
