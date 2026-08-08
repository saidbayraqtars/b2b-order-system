import { prisma } from "@repo/database";
import type { FieldEntrySource } from "@repo/types";
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
  /** Derived from the caller's credential at the route layer, never sent by the client. */
  source: FieldEntrySource;
}

export interface CheckInRecord {
  id: string;
  companyId: string;
  companyName: string;
  latitude: number | null;
  longitude: number | null;
  checkInAt: string;
  checkOutAt: string | null;
  /** Set at check-out; null while the visit is open. */
  durationMinutes: number | null;
  note: string | null;
  source: FieldEntrySource;
}

function toRecord(row: {
  id: string;
  companyId: string;
  company: { name: string };
  latitude: number | null;
  longitude: number | null;
  checkInAt: Date;
  checkOutAt: Date | null;
  durationMinutes: number | null;
  note: string | null;
  source: FieldEntrySource;
}): CheckInRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    latitude: row.latitude,
    longitude: row.longitude,
    checkInAt: row.checkInAt.toISOString(),
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes,
    note: row.note,
    source: row.source,
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
  durationMinutes: true,
  note: true,
  source: true,
} as const;

/**
 * Record a new field visit for the given sales rep at an (already authorized)
 * company.
 *
 * A rep may only have one visit open at a time. Two overlapping visits are
 * never a real thing that happened — they are a forgotten check-out — and every
 * duration read off them afterwards is wrong. Refusing here, with the open
 * visit named, turns a silent data problem into a one-click fix.
 */
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

  const open = await prisma.checkIn.findFirst({
    where: { salesRepId, checkOutAt: null },
    select: { id: true, company: { select: { name: true } } },
    orderBy: { checkInAt: "desc" },
  });
  if (open) {
    throw new BusinessError(
      "VISIT_ALREADY_OPEN",
      `Açık ziyaretiniz var (${open.company.name}). Önce onu kapatın.`,
      { openCheckInId: open.id },
    );
  }

  const row = await prisma.checkIn.create({
    data: {
      salesRepId,
      companyId: input.companyId,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      note: input.note ?? null,
      source: input.source,
    },
    select: SELECT,
  });
  return toRecord(row);
}

/** The rep's currently open visit, if any. Drives the web screen's main action. */
export async function getOpenCheckIn(
  salesRepId: string,
): Promise<CheckInRecord | null> {
  const row = await prisma.checkIn.findFirst({
    where: { salesRepId, checkOutAt: null },
    select: SELECT,
    orderBy: { checkInAt: "desc" },
  });
  return row ? toRecord(row) : null;
}

/** Close an open visit (set checkOutAt). Only the rep who opened it may close it. */
export async function checkOut(
  checkInId: string,
  salesRepId: string,
): Promise<CheckInRecord> {
  const existing = await prisma.checkIn.findUnique({
    where: { id: checkInId },
    select: { id: true, salesRepId: true, checkInAt: true, checkOutAt: true },
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

  // Duration is written here rather than derived on read: the reporting engine
  // has no computed columns, so "average visit length per rep" has to be an
  // ordinary column it can group and average. Clamped at zero because a clock
  // that went backwards (an NTP correction mid-visit) must not produce a
  // negative minute count that then poisons an average.
  const closedAt = new Date();
  const minutes = Math.max(
    0,
    Math.floor((closedAt.getTime() - existing.checkInAt.getTime()) / 60_000),
  );

  const row = await prisma.checkIn.update({
    where: { id: checkInId },
    data: { checkOutAt: closedAt, durationMinutes: minutes },
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
