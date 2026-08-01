import { prisma } from "@repo/database";
import { BusinessError } from "./errors";

// Field-sales visit tracking. A sales rep "checks in" at a customer's location
// (optionally with GPS coords), then "checks out" when the visit ends.
// Company-level authorization (rep owns the company) is enforced at the route
// layer via resolveCompanyId — the service trusts the given companyId.

export interface CreateCheckInInput {
  companyId: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}

export interface CheckInRecord {
  id: string;
  companyId: string;
  companyName: string;
  latitude: number | null;
  longitude: number | null;
  checkInAt: string;
  checkOutAt: string | null;
  note: string | null;
}

function toRecord(row: {
  id: string;
  companyId: string;
  company: { name: string };
  latitude: number | null;
  longitude: number | null;
  checkInAt: Date;
  checkOutAt: Date | null;
  note: string | null;
}): CheckInRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    latitude: row.latitude,
    longitude: row.longitude,
    checkInAt: row.checkInAt.toISOString(),
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    note: row.note,
  };
}

const SELECT = {
  id: true,
  companyId: true,
  company: { select: { name: true } },
  latitude: true,
  longitude: true,
  checkInAt: true,
  checkOutAt: true,
  note: true,
} as const;

/** Record a new field visit for the given sales rep at an (already authorized) company. */
export async function createCheckIn(
  input: CreateCheckInInput,
  salesRepId: string,
): Promise<CheckInRecord> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) {
    throw new BusinessError("COMPANY_NOT_FOUND", "Firma bulunamadı");
  }

  const row = await prisma.checkIn.create({
    data: {
      salesRepId,
      companyId: input.companyId,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      note: input.note ?? null,
    },
    select: SELECT,
  });
  return toRecord(row);
}

/** Close an open visit (set checkOutAt). Only the rep who opened it may close it. */
export async function checkOut(
  checkInId: string,
  salesRepId: string,
): Promise<CheckInRecord> {
  const existing = await prisma.checkIn.findUnique({
    where: { id: checkInId },
    select: { id: true, salesRepId: true, checkOutAt: true },
  });
  if (!existing) {
    throw new BusinessError("CHECKIN_NOT_FOUND", "Ziyaret kaydı bulunamadı");
  }
  if (existing.salesRepId !== salesRepId) {
    throw new BusinessError("FORBIDDEN", "Bu ziyareti kapatma yetkiniz yok");
  }
  if (existing.checkOutAt) {
    throw new BusinessError("INVALID_STATE", "Ziyaret zaten kapatılmış");
  }

  const row = await prisma.checkIn.update({
    where: { id: checkInId },
    data: { checkOutAt: new Date() },
    select: SELECT,
  });
  return toRecord(row);
}

/** List a rep's recent visits, optionally scoped to one company. */
export async function listCheckIns(
  salesRepId: string,
  companyId?: string,
): Promise<CheckInRecord[]> {
  const rows = await prisma.checkIn.findMany({
    where: { salesRepId, ...(companyId ? { companyId } : {}) },
    select: SELECT,
    orderBy: { checkInAt: "desc" },
    take: 50,
  });
  return rows.map(toRecord);
}
