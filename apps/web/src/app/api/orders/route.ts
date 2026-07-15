import type { NextRequest } from "next/server";
import { Prisma, prisma } from "@repo/database";
import { createOrder } from "@repo/services";
import { createOrderSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { resolveCompanyId } from "@/lib/company-access";

const ALL_BUYERS = [
  "COMPANY_ADMIN",
  "COMPANY_STAFF",
  "SALES_REP",
  "SUPER_ADMIN",
] as const;

// POST /api/orders — create an order for the caller's authorized company.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_BUYERS);

    const json = await req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }
    const input = parsed.data;

    // Authorize the target company for this caller.
    await resolveCompanyId(user, input.companyId);

    const result = await createOrder(input, {
      createdById: user.id,
      createdByRole: user.role,
    });
    return Response.json(result, { status: 201 });
  });
}

// GET /api/orders?companyId= — list orders visible to the caller.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_BUYERS);
    const requested = new URL(req.url).searchParams.get("companyId");

    let where: Prisma.OrderWhereInput;
    switch (user.role) {
      case "COMPANY_ADMIN":
      case "COMPANY_STAFF":
        where = { companyId: await resolveCompanyId(user, requested) };
        break;
      case "SALES_REP":
        where = requested
          ? { companyId: await resolveCompanyId(user, requested) }
          : { company: { salesRepId: user.id } };
        break;
      case "SUPER_ADMIN":
        where = requested ? { companyId: requested } : {};
        break;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        grandTotal: true,
        createdAt: true,
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ orders });
  });
}
