import type { NextRequest } from "next/server";
import { exportAuditCsv, recordAudit } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";

// GET /api/admin/audit/export?from=&to= — the trail as CSV.
//
// Streamed rather than assembled: an export happens exactly when the table is
// at its largest, and building a year of it into one string is how an export
// takes the server down.
export function GET(req: NextRequest) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"]);
    const params = new URL(req.url).searchParams;

    const parseDate = (value: string | null): Date | undefined => {
      if (!value) return undefined;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"));

    // Taking the whole trail off the system is itself worth a line in it.
    const meta = requestMeta();
    await recordAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "AUDIT_EXPORTED",
      summary: "Denetim kaydı CSV olarak dışa aktarıldı",
      entity: "AuditLog",
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: {
        exported: true,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    });

    const encoder = new TextEncoder();
    const rows = exportAuditCsv({ from, to });
    let wroteBom = false;
    const stream = new ReadableStream({
      async pull(controller) {
        if (!wroteBom) {
          // Excel reads a CSV as the system codepage unless a BOM says UTF-8,
          // which is the difference between "Görsel" and "GÃ¶rsel".
          controller.enqueue(encoder.encode("﻿"));
          wroteBom = true;
          return;
        }
        const next = await rows.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(stream, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="denetim-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  });
}
