import type { NextRequest } from "next/server";
import { createLabelTemplate, listLabelTemplates } from "@repo/services";
import { LabelTemplateKindEnum, labelTemplateSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";

/**
 * GET /api/label-templates?kind=
 *
 * Basacak herkes okur (`documents.view`): fiş çıkaran plasiyerin şablon listesi
 * olmadan hangi tasarımla basacağını seçmesi mümkün değil. Değiştirmek ayrı
 * bir izin.
 */
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "documents.view");
    const { searchParams } = new URL(req.url);
    const parsed = LabelTemplateKindEnum.safeParse(searchParams.get("kind"));
    const templates = await listLabelTemplates(
      parsed.success ? parsed.data : undefined,
    );
    return Response.json({ templates });
  });
}

/** POST /api/label-templates — yeni tasarım. */
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(undefined, "labels.manage");

    const json = await req.json().catch(() => null);
    const parsed = labelTemplateSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const template = await createLabelTemplate(parsed.data);
    return Response.json({ template }, { status: 201 });
  });
}
