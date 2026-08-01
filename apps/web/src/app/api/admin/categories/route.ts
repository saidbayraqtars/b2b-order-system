import type { NextRequest } from "next/server";
import { createCategory, listCategoriesAdmin } from "@repo/services";
import { createCategorySchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET /api/admin/categories — flat list with product/child counts.
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const categories = await listCategoriesAdmin();
    return Response.json({ categories });
  });
}

// POST /api/admin/categories — slug is derived from the name when omitted.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createCategorySchema);
    const category = await createCategory(input);
    return Response.json({ category }, { status: 201 });
  });
}
