import { prisma } from "@repo/database";
import type { SessionUser } from "@repo/types";
import { AuthError, InputError } from "./guard";

/**
 * Resolve and authorize the company a request targets, based on the caller's role:
 *  - COMPANY_ADMIN / COMPANY_STAFF: always their own company (requested must match if given)
 *  - SALES_REP: the requested company, only if it's in their portfolio
 *  - SUPER_ADMIN: any requested company
 *
 * Throws AuthError(403) on access violation, InputError(400) on missing input.
 */
export async function resolveCompanyId(
  user: SessionUser,
  requested: string | null,
): Promise<string> {
  switch (user.role) {
    case "COMPANY_ADMIN":
    case "COMPANY_STAFF": {
      if (!user.companyId) throw new AuthError(403, "Hesabınıza firma atanmamış");
      if (requested && requested !== user.companyId) {
        throw new AuthError(403, "Bu firmaya erişiminiz yok");
      }
      return user.companyId;
    }
    case "SALES_REP": {
      if (!requested) throw new InputError("companyId gerekli");
      const company = await prisma.company.findUnique({
        where: { id: requested },
        select: { salesRepId: true },
      });
      if (!company) throw new AuthError(403, "Firma bulunamadı");
      if (company.salesRepId !== user.id) {
        throw new AuthError(403, "Bu firma portföyünüzde değil");
      }
      return requested;
    }
    case "SUPER_ADMIN": {
      if (!requested) throw new InputError("companyId gerekli");
      return requested;
    }
  }
}
