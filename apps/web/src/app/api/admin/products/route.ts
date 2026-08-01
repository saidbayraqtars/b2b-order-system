import type { NextRequest } from "next/server";
import { createProduct, listProductsAdmin } from "@repo/services";
import { createProductSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET /api/admin/products?search=&categoryId=&onlyActive=1
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const { searchParams } = new URL(req.url);
    const products = await listProductsAdmin({
      search: searchParams.get("search") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      onlyActive: searchParams.get("onlyActive") === "1",
    });
    return Response.json({ products });
  });
}

// POST /api/admin/products
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"]);
    const input = await parseBody(req, createProductSchema);
    const product = await createProduct(input);
    return Response.json({ product }, { status: 201 });
  });
}
