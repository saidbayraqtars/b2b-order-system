import type { NextRequest } from "next/server";
import { createVariant } from "@repo/services";
import { createVariantSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// POST /api/admin/products/:id/variants — SKU and barcode must be free.
export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createVariantSchema);
    const variant = await createVariant(params.id, input);
    return Response.json({ variant }, { status: 201 });
  });
}
