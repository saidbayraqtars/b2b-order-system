import { cancelInvoice, getInvoice } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { assertInvoiceVisible } from "@/lib/order-access";

type Params = { params: { id: string } };

// GET    /api/invoices/:id — one invoice, for the printable view.
// DELETE /api/invoices/:id — cancel it (status CANCELLED; the number stays spent).
export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser();
    await assertInvoiceVisible(user, params.id);

    return Response.json({ invoice: await getInvoice(params.id) });
  });
}

export function DELETE(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    await cancelInvoice(params.id, { userId: user.id, role: user.role });
    return new Response(null, { status: 204 });
  });
}
