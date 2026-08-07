import type { PrismaClient } from "@prisma/client";
import { DEFAULT_LABEL_TEMPLATES } from "@repo/types";

/**
 * Kurulumun çalışabilmesi için gereken **başvuru verisi**.
 *
 * Gösterim verisinden ayrı bir dosyada duruyor çünkü izleyicileri farklı:
 * `seed.ts` geliştirme veritabanını doldurur (demo firma, demo kullanıcı, demo
 * ürün), `bootstrap.ts` ise gerçek bir müşteri kurulumunu açar ve oraya tek bir
 * demo satırı bile giremez. Ortak olan yalnızca burası — belge numaralayıcı ve
 * hazır etiket tasarımları, ikisi de olmadan sistem iş göremez.
 *
 * Hepsi tekrar çalıştırılabilir: var olana dokunulmaz. Güncelleme sonrası
 * yeniden çağrılmak, kurulumdan sonra yapılmış düzenlemeyi geri almamalı.
 */

/**
 * Serisi olmayan bir kurulumda irsaliye ya da fatura numaralandırılamaz, yani
 * sevkiyat yapılamaz. Her türden bir varsayılan.
 */
export async function seedDocumentSeries(prisma: PrismaClient): Promise<void> {
  for (const s of [
    { type: "WAYBILL" as const, prefix: "IRS" },
    { type: "INVOICE" as const, prefix: "FTR" },
  ]) {
    const existing = await prisma.documentSeries.findFirst({
      where: { type: s.type, prefix: s.prefix },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.documentSeries.create({
      data: { type: s.type, prefix: s.prefix, padding: 6, isDefault: true },
    });
  }
}

/**
 * Hazır etiket ve fiş tasarımları.
 *
 * Basım motoru bunlar olmadan da çalışıyor (kod içindeki hazır tasarıma
 * düşüyor), ama veritabanına yazmak tasarımcının düzenleyebileceği bir
 * başlangıç noktası veriyor — kullanıcı sıfırdan satır dizmek zorunda kalmıyor.
 * Aynı türde bir şablon zaten varsa dokunulmaz.
 */
export async function seedLabelTemplates(prisma: PrismaClient): Promise<void> {
  for (const t of DEFAULT_LABEL_TEMPLATES) {
    const existing = await prisma.labelTemplate.findFirst({
      where: { kind: t.kind },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.labelTemplate.create({
      data: {
        kind: t.kind,
        name: t.name,
        widthMm: t.widthMm,
        heightMm: t.heightMm ?? null,
        blocks: t.blocks,
        isDefault: true,
      },
    });
  }
}
