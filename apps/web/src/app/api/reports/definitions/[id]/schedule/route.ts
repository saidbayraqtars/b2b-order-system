import { getReportSchedule, setReportSchedule } from "@repo/services";
import { reportScheduleSchema } from "@repo/types";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { REPORT_BUILDER_ROLES, reportContext } from "@/lib/report-context";
import { parseBody } from "@/lib/validate";

type Params = { params: { id: string } };

export function GET(_req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    return Response.json({ schedule: await getReportSchedule(params.id) });
  });
}

/** Gönderimi aç/kapat. Yetki kontrolü servis katmanında (rapor sahibi ya da süper admin). */
export function PUT(req: Request, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(REPORT_BUILDER_ROLES, "reports.build");
    const input = await parseBody(req, reportScheduleSchema);
    return Response.json({
      schedule: await setReportSchedule(params.id, input, reportContext(user)),
    });
  });
}
