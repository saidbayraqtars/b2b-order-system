import { listJobRuns, listJobs } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";

/**
 * GET /api/admin/jobs — iş listesi ve son çalıştırmalar.
 *
 * İkisi tek yanıtta: ekran ikisini yan yana gösteriyor ve iki ayrı istek,
 * "iş OK görünüyor ama listede hata satırı var" gibi tutarsız bir ara kare
 * üretiyordu.
 */
export function GET() {
  return withAuthErrors(async () => {
    await requireUser(["SUPER_ADMIN"], "jobs.manage");
    const [jobs, runs] = await Promise.all([listJobs(), listJobRuns(50)]);
    return Response.json({ jobs, runs });
  });
}
