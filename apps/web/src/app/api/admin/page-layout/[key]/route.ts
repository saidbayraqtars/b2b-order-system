import {
  getPageLayout,
  isPageKey,
  listBlockCatalog,
  resetPageLayout,
  savePageLayout,
} from "@repo/services";
import { pageLayoutSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { parseBody } from "@/lib/validate";

// GET    /api/admin/page-layout/:key — düzen + eklenebilir blok kataloğu
// PUT    /api/admin/page-layout/:key — düzeni kaydet
// DELETE /api/admin/page-layout/:key — varsayılana dön
//
// Katalog GET'in içinde dönüyor, ayrı uçta değil: yönetim ekranı ikisini birden
// istiyor ve iki gidiş-dönüş, düzenin katalogla uyumsuz bir anlık görüntüsünü
// çizme ihtimali doğuruyor.

function keyOf(params: { key: string }) {
  const key = params.key.toUpperCase();
  if (!isPageKey(key)) return null;
  return key;
}

export function GET(_req: Request, { params }: { params: { key: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "design.manage");
    const key = keyOf(params);
    if (!key) return Response.json({ error: "Bilinmeyen sayfa" }, { status: 404 });
    return Response.json({
      layout: await getPageLayout(key),
      catalog: listBlockCatalog(key),
    });
  });
}

export function PUT(req: Request, { params }: { params: { key: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "design.manage");
    const key = keyOf(params);
    if (!key) return Response.json({ error: "Bilinmeyen sayfa" }, { status: 404 });
    const input = await parseBody(req, pageLayoutSchema);
    return Response.json({ layout: await savePageLayout(key, input, user.id) });
  });
}

export function DELETE(_req: Request, { params }: { params: { key: string } }) {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "design.manage");
    const key = keyOf(params);
    if (!key) return Response.json({ error: "Bilinmeyen sayfa" }, { status: 404 });
    return Response.json({ layout: await resetPageLayout(key) });
  });
}
