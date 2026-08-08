import type { NextRequest } from "next/server";
import { recordAudit, triggerJob, updateJobSchedule } from "@repo/services";
import { updateJobScheduleSchema } from "@repo/types";
import { InputError, requireUser, withAuthErrors } from "@/lib/guard";
import { requestMeta } from "@/lib/request-meta";

type Params = { params: { name: string } };

/** PATCH /api/admin/jobs/:name — işi aç/kapat ya da periyodunu değiştir. */
export function PATCH(req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "jobs.manage");

    const json = await req.json().catch(() => null);
    const parsed = updateJobScheduleSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    await updateJobSchedule(params.name, parsed.data);

    // Denetim kaydı: kapatılmış bir temizlik işi haftalar sonra "neden
    // çalışmıyor" diye sorulduğunda, kimin kapattığını gösterecek tek kayıt.
    const meta = requestMeta();
    await recordAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "JOB_SCHEDULE_CHANGED",
      summary: `Zamanlanmış iş güncellendi: ${params.name}`,
      entity: "JobSchedule",
      entityId: params.name,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: parsed.data,
    });

    return new Response(null, { status: 204 });
  });
}

/**
 * POST /api/admin/jobs/:name — işi hemen çalıştır.
 *
 * Zamanlayıcının sırasını bozmuyor: `nextRunAt` olduğu gibi kalıyor, yalnızca
 * fazladan bir çalıştırma yapılıyor. İşler yeniden çalıştırılabilir olmak
 * zorunda (bkz. job-registry.ts), o yüzden fazladan tur zararsız.
 */
export function POST(_req: NextRequest, { params }: Params) {
  return withAuthErrors(async () => {
    const user = await requireUser(["SUPER_ADMIN"], "jobs.manage");
    const outcome = await triggerJob(params.name, user.id);
    return Response.json({ outcome });
  });
}
