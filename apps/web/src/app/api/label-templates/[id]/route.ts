import type { NextRequest } from "next/server";
import {
  deleteLabelTemplate,
  getLabelTemplate,
  updateLabelTemplate,
} from "@repo/services";
import { updateLabelTemplateSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

export function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "documents.view");
    return Response.json({ template: await getLabelTemplate(params.id) });
  });
}

export function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "labels.manage");

    const json = await req.json().catch(() => null);
    const parsed = updateLabelTemplateSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const template = await updateLabelTemplate(params.id, parsed.data);
    return Response.json({ template });
  });
}

export function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "labels.manage");
    await deleteLabelTemplate(params.id);
    return new Response(null, { status: 204 });
  });
}
