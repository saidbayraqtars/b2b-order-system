import { prisma } from "@repo/database";

/**
 * Give a suite its own document serials — as the *defaults*, because that is
 * what `pickSeries` actually reads. Creating a non-default series and expecting
 * documents to draw from it is the trap: they draw from the seed's serial
 * instead, so the numbers depend on how many times the suite has ever run.
 *
 * The previous defaults are put back by `restore()`, which every caller must
 * run in afterAll.
 */
export interface SeriesFixture {
  waybillSeriesId: string;
  invoiceSeriesId: string;
  restore(): Promise<void>;
}

export async function useOwnDefaultSeries(tag: string): Promise<SeriesFixture> {
  const previous = await prisma.documentSeries.findMany({
    where: { isDefault: true },
    select: { id: true },
  });
  await prisma.documentSeries.updateMany({
    where: { isDefault: true },
    data: { isDefault: false },
  });

  const waybill = await prisma.documentSeries.create({
    data: {
      type: "WAYBILL",
      prefix: `W${tag}`.slice(0, 12),
      padding: 4,
      isDefault: true,
    },
  });
  const invoice = await prisma.documentSeries.create({
    data: {
      type: "INVOICE",
      prefix: `I${tag}`.slice(0, 12),
      padding: 4,
      isDefault: true,
    },
  });

  return {
    waybillSeriesId: waybill.id,
    invoiceSeriesId: invoice.id,
    async restore() {
      await prisma.documentSeries.deleteMany({
        where: { id: { in: [waybill.id, invoice.id] } },
      });
      await prisma.documentSeries.updateMany({
        where: { id: { in: previous.map((p) => p.id) } },
        data: { isDefault: true },
      });
    },
  };
}
