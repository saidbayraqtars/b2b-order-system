import { listPaymentIntents, paymentProviderCatalog, paymentSettings } from "@repo/services";
import { paymentIntentFilterSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseQuery } from "@/lib/validate";

// GET /api/admin/payment-intents?status=&companyId=&orderId= — kart tahsilatları,
// plus which provider this installation runs so the screen can say what the
// buttons mean.
//
// Super-admin only: an intent names a customer, an amount and a provider
// reference, which together are enough to reconcile — or dispute — a charge.
export function GET(req: Request) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const filter = parseQuery(req, paymentIntentFilterSchema);
    const settings = await paymentSettings();

    return Response.json({
      intents: await listPaymentIntents(filter),
      providers: paymentProviderCatalog(settings.provider),
      activeProvider: settings.provider,
    });
  });
}
