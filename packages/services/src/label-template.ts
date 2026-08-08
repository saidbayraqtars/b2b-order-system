import { Prisma, prisma } from "@repo/database";
import {
  DEFAULT_LABEL_TEMPLATES,
  labelBlockSchema,
  type LabelBlock,
  type LabelTemplateInput,
  type LabelTemplateKind,
  type UpdateLabelTemplateInput,
} from "@repo/types";
import { BusinessError } from "./errors";

// Etiket ve fiş şablonlarının kayıt defteri.
//
// Şablonlar veritabanında duruyor, kodda değil: kargo etiketinin köşesindeki
// telefon numarası değiştiğinde kimse yeni sürüm beklememeli. Tasarımın şekli
// (satır listesi) @repo/types tarafında doğrulanıyor; burada yalnızca "hangi
// tür için hangi şablon geçerli" ve "varsayılan tek" kuralları var.

export interface LabelTemplateRow {
  id: string;
  kind: LabelTemplateKind;
  name: string;
  widthMm: number;
  heightMm: number | null;
  blocks: LabelBlock[];
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
}

const SELECT = {
  id: true,
  kind: true,
  name: true,
  widthMm: true,
  heightMm: true,
  blocks: true,
  isDefault: true,
  isActive: true,
  updatedAt: true,
} satisfies Prisma.LabelTemplateSelect;

type Row = Prisma.LabelTemplateGetPayload<{ select: typeof SELECT }>;

/**
 * Kayıtlı tasarımı okurken **yeniden doğrula**.
 *
 * Satırlar `Json` kolonunda duruyor, yani veritabanı şekli garanti etmiyor:
 * eski bir sürümde yazılmış ya da elle düzeltilmiş bir satır bugünkü şemaya
 * uymayabilir. Bozuk satır atılır, şablonun kalanı basılır — tek bir kötü satır
 * yüzünden fiş hiç çıkmaması en kötü sonuç.
 */
function parseBlocks(raw: Prisma.JsonValue): LabelBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: LabelBlock[] = [];
  for (const item of raw) {
    const parsed = labelBlockSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function toRow(r: Row): LabelTemplateRow {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    widthMm: r.widthMm,
    heightMm: r.heightMm,
    blocks: parseBlocks(r.blocks),
    isDefault: r.isDefault,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listLabelTemplates(
  kind?: LabelTemplateKind,
): Promise<LabelTemplateRow[]> {
  const rows = await prisma.labelTemplate.findMany({
    where: kind ? { kind } : {},
    orderBy: [{ kind: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    select: SELECT,
  });
  return rows.map(toRow);
}

export async function getLabelTemplate(id: string): Promise<LabelTemplateRow> {
  const row = await prisma.labelTemplate.findUnique({
    where: { id },
    select: SELECT,
  });
  if (!row) throw new BusinessError("LABEL_TEMPLATE_NOT_FOUND", "Şablon bulunamadı");
  return toRow(row);
}

/**
 * Türün basılacak şablonu.
 *
 * Sıra: istenen şablon → türün varsayılanı → türün ilk aktif şablonu → kutudan
 * çıkan hazır tasarım. Son adım bilerek var: hiç şablon tanımlanmamış bir
 * kurulumda fişin basılamaması kabul edilebilir değil, ve "önce şablon
 * tanımlayın" diyen bir hata mesajı kapıda bekleyen kuryeye yardımcı olmaz.
 */
export async function resolveLabelTemplate(
  kind: LabelTemplateKind,
  requestedId?: string | null,
): Promise<LabelTemplateRow> {
  if (requestedId) {
    const asked = await prisma.labelTemplate.findUnique({
      where: { id: requestedId },
      select: SELECT,
    });
    if (asked && asked.kind === kind && asked.isActive) return toRow(asked);
  }
  const fallback = await prisma.labelTemplate.findFirst({
    where: { kind, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: SELECT,
  });
  if (fallback) return toRow(fallback);

  const builtIn = DEFAULT_LABEL_TEMPLATES.find((t) => t.kind === kind);
  if (!builtIn) {
    throw new BusinessError("LABEL_TEMPLATE_NOT_FOUND", "Bu tür için tasarım yok");
  }
  return {
    id: `builtin:${kind}`,
    kind,
    name: builtIn.name,
    widthMm: builtIn.widthMm,
    heightMm: builtIn.heightMm ?? null,
    blocks: [...builtIn.blocks],
    isDefault: true,
    isActive: true,
    updatedAt: new Date(0).toISOString(),
  };
}

// Hazır tasarımların veritabanına yazılması burada değil,
// packages/database/prisma/reference-data.ts içinde: kurulum verisi kurulumu
// açan yerden yazılır ve hem bootstrap hem seed aynı yeri çağırır. İki kopya
// olsaydı biri güncellenir, diğeri eskirdi.

export async function createLabelTemplate(
  input: LabelTemplateInput,
): Promise<LabelTemplateRow> {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await clearDefault(tx, input.kind);
    const row = await tx.labelTemplate.create({
      data: {
        kind: input.kind,
        name: input.name,
        widthMm: input.widthMm,
        heightMm: input.heightMm ?? null,
        blocks: input.blocks as unknown as Prisma.InputJsonValue,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
      },
      select: SELECT,
    });
    return toRow(row);
  });
}

export async function updateLabelTemplate(
  id: string,
  patch: UpdateLabelTemplateInput,
): Promise<LabelTemplateRow> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.labelTemplate.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!existing) throw new BusinessError("LABEL_TEMPLATE_NOT_FOUND", "Şablon bulunamadı");

    if (patch.isDefault) await clearDefault(tx, existing.kind, id);

    const row = await tx.labelTemplate.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.widthMm !== undefined ? { widthMm: patch.widthMm } : {}),
        ...(patch.heightMm !== undefined ? { heightMm: patch.heightMm } : {}),
        ...(patch.blocks !== undefined
          ? { blocks: patch.blocks as unknown as Prisma.InputJsonValue }
          : {}),
        ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
      select: SELECT,
    });
    return toRow(row);
  });
}

export async function deleteLabelTemplate(id: string): Promise<void> {
  const existing = await prisma.labelTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new BusinessError("LABEL_TEMPLATE_NOT_FOUND", "Şablon bulunamadı");
  await prisma.labelTemplate.delete({ where: { id } });
}

/** Bir tür içinde tek varsayılan. İki varsayılan olsaydı hangisinin basılacağı sıralamaya kalırdı. */
async function clearDefault(
  tx: Prisma.TransactionClient,
  kind: LabelTemplateKind,
  exceptId?: string,
): Promise<void> {
  await tx.labelTemplate.updateMany({
    where: { kind, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isDefault: false },
  });
}
