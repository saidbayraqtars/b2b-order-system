import { createInvoice, listInvoices, notifyInvoiceIssued } from "@repo/services";
import { createInvoiceSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { assertOrderVisible } from "@/lib/order-access";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

// GET  /api/orders/:id/invoices
// POST /api/orders/:id/invoices — bill selected despatches, or everything left.
export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    await assertOrderVisible(user, params.id);

    return Response.json({ invoices: await listInvoices(params.id) });
  });
}

export function POST(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createInvoiceSchema);

    const invoice = await createInvoice(params.id, input, {
      userId: user.id,
      role: user.role,
    });
    await notifyInvoiceIssued(invoice.invoiceId);
    return Response.json(invoice, { status: 201 });
  });
}
