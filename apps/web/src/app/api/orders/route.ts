import type { NextRequest } from "next/server";
import { Prisma, prisma } from "@repo/database";
import {
  authorizeOpenIntent,
  clearCart,
  createOrder,
  notifyOrderPlaced,
} from "@repo/services";
import {
  createOrderSchema,
  ORDER_STATUS_GROUPS,
  OrderStatusEnum,
  parseOrderStatusGroup,
  type OrderStatusGroup,
} from "@repo/types";
import {
  InputError,
  requestChannel,
  requireUser,
  withAuthErrors,
} from "@/lib/guard";
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
    const user = await requireUser(ALL_BUYERS, "orders.create");

    const json = await req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }
    const input = parsed.data;

    // Authorize the target company for this caller.
    await resolveCompanyId(user, input.companyId);

    // Kanal burada belirleniyor, gövdede değil: bir tarayıcı kendini telefon
    // ilan edemez. Ziyaret kaydındaki kuralın aynısı.
    const channel = await requestChannel();

    const result = await createOrder(input, {
      createdById: user.id,
      createdByRole: user.role,
      source: channel === "mobile" ? "MOBILE" : "WEB",
    });
    // The basket has become an order; leaving it full invites the same order
    // twice from the second tab. Cleared here rather than in the browser so it
    // holds for the mobile app too.
    await clearCart(input.companyId, user.id);

    // A card order opened a charge inside the transaction; the provider is
    // called only now that it has committed. A bank on the other end of a
    // network hop must not be holding this order's row locks — and a provider
    // that is down must not roll the order back, which is why its failure is
    // recorded on the intent rather than thrown at the buyer.
    let redirectUrl: string | null = null;
    if (result.paymentIntentId) {
      const origin = new URL(req.url).origin;
      try {
        const authorized = await authorizeOpenIntent(
          result.paymentIntentId,
          `${origin}/orders/${result.orderId}`,
        );
        redirectUrl = authorized.redirectUrl;
      } catch {
        // Left PENDING/FAILED on the intent, visible in /admin/kasa. The order
        // stands: the goods were ordered, the money is simply not in yet.
      }
    }

    // After the transaction: the order exists whether or not the mail goes out.
    await notifyOrderPlaced(result.orderId);
    return Response.json({ ...result, paymentRedirectUrl: redirectUrl }, { status: 201 });
  });
}

// GET /api/orders?companyId=&durum=&q= — list orders visible to the caller,
// with per-tab counts for the status groups.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(ALL_BUYERS, "orders.view");
    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("companyId");
    const statusParam = OrderStatusEnum.safeParse(searchParams.get("status"));
    const statusFilter = statusParam.success ? { status: statusParam.data } : {};

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
      // Kurye yalnızca kendisine atanmış sevkiyatı olan siparişleri görür —
      // firma seçemez, portföyü yoktur.
      case "COURIER":
        where = { shipments: { some: { courierId: user.id } } };
        break;
    }
    // Arama: sipariş numarası ya da firma adı. Kapsamla AND'leniyor, birleşmiyor
    // — plasiyerin `company: { salesRepId }` kapsamı firma adı süzgeciyle aynı
    // anahtarda ve `...` ile yan yana konunca biri ötekini siliyordu.
    const q = searchParams.get("q")?.trim().slice(0, 80);
    const scope: Prisma.OrderWhereInput = q
      ? {
          AND: [
            where,
            {
              OR: [
                { orderNumber: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : where;

    // `durum` sekme grubu (bekleyen, açık…); `status` tek durum — mobil onu
    // gönderiyor. Sekme sayıları grup süzgecinden önceki kapsamdan: "Onay
    // bekleyen 4" yazısı, başka sekmedeyken de doğru kalmalı.
    const group = parseOrderStatusGroup(searchParams.get("durum"));
    const listWhere: Prisma.OrderWhereInput = group
      ? { AND: [scope, { status: { in: [...ORDER_STATUS_GROUPS[group]] } }] }
      : { AND: [scope, statusFilter] };

    const [orders, byStatus] = await Promise.all([
      prisma.order.findMany({
        where: listWhere,
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
      }),
      prisma.order.groupBy({ by: ["status"], where: scope, _count: true }),
    ]);

    const counts: Record<OrderStatusGroup | "tumu", number> = {
      tumu: 0,
      bekleyen: 0,
      acik: 0,
      teslim: 0,
      iptal: 0,
    };
    for (const row of byStatus) {
      counts.tumu += row._count;
      for (const [key, statuses] of Object.entries(ORDER_STATUS_GROUPS)) {
        if ((statuses as readonly string[]).includes(row.status)) {
          counts[key as OrderStatusGroup] += row._count;
        }
      }
    }
    return Response.json({ orders, counts });
  });
}
