import { saveCustomCodeField } from "@repo/services";
import {
  CustomCodeEntityEnum,
  customCodeSlotSchema,
  saveCustomCodeFieldSchema,
} from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// PUT /api/admin/custom-codes/PRODUCT/3 — bir yuvanın adı, seçenekleri, durumu.
//
// Silme ucu yok: yuva pasife alınır. Tanımı silmek, değerleri olan bir
// kolonu adsız bırakırdı; pasif yuva ise yeniden açıldığında verisiyle döner.
export function PUT(
  req: Request,
  { params }: { params: { entity: string; slot: string } },
) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "organization.manage");

    const entity = CustomCodeEntityEnum.safeParse(params.entity);
    const slot = customCodeSlotSchema.safeParse(params.slot);
    if (!entity.success || !slot.success) {
      throw new InputError("Geçersiz özel kod alanı");
    }

    const input = await parseBody(req, saveCustomCodeFieldSchema);
    return Response.json(await saveCustomCodeField(entity.data, slot.data, input));
  });
}
