import { redirect } from "next/navigation";
import { prisma } from "@repo/database";
import type { SessionUser } from "@repo/types";
import { resolveCompanyId } from "./company-access";
import { AuthError, InputError } from "./guard";

/**
 * Portal ekranlarının "hangi firma adına" sorusunu tek yerden cevaplar.
 *
 * İki farklı kullanıcı var:
 *  - Alıcı (COMPANY_ADMIN / COMPANY_STAFF): firma kendi hesabından gelir,
 *    URL'deki companyId yok sayılamaz ama değiştiremez de — resolveCompanyId
 *    farklı bir değer gelirse 403 atar.
 *  - Vekil (SALES_REP / SUPER_ADMIN): firma URL'den seçilir. Seçilmemişse
 *    `companyId: null` döner ve ekran katalog yerine firma seçtirir.
 *
 * Yetki kararı burada verilmiyor — `resolveCompanyId`'ye devrediliyor, yani
 * API uçlarıyla tamamen aynı kural. Ekranın kendi kopyası olsaydı ikisi
 * zamanla ayrışırdı.
 */
export interface PortalContext {
  /** Seçili firma; vekil kullanıcı henüz seçmediyse null. */
  companyId: string | null;
  companyName: string | null;
  /** Limit − bakiye. Yalnızca vekil kullanıcıya gösterilir. */
  availableCredit: string | null;
  /** Kullanıcı başkası adına mı çalışıyor? */
  isProxy: boolean;
}

/**
 * `resolveCompanyId`'nin sayfa karşılığı.
 *
 * Servis katmanı yetkisiz erişimde `AuthError` fırlatır; bu API uçlarında
 * `withAuthErrors` tarafından JSON 403'e çevrilir. Sayfaların böyle bir
 * sarmalayıcısı yok — yakalamazsak hata yukarı çıkar ve kullanıcı 403 yerine
 * **500 çökme sayfası** görür. (Erişim yine engellenir, ama yanlış mesajla.)
 * Bu yüzden burada yakalanıp /403'e yönlendiriliyor: portföyünden çıkmış bir
 * firmanın eski bağlantısına tıklayan plasiyerin göreceği doğru ekran o.
 */
async function authorizeCompany(
  user: SessionUser,
  requested: string | null,
): Promise<string> {
  try {
    return await resolveCompanyId(user, requested);
  } catch (e) {
    if (e instanceof AuthError || e instanceof InputError) {
      redirect("/403");
    }
    throw e;
  }
}

export async function resolvePortalContext(
  user: SessionUser,
  requestedCompanyId: string | undefined,
): Promise<PortalContext> {
  const isProxy = user.role === "SALES_REP" || user.role === "SUPER_ADMIN";

  if (!isProxy) {
    // Alıcı: kendi firması. Yine de yetkilendirmeden geçir — URL'e başka bir
    // firma yazılmışsa reddedilir.
    const companyId = await authorizeCompany(user, requestedCompanyId ?? null);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    return {
      companyId,
      companyName: company?.name ?? null,
      availableCredit: null,
      isProxy: false,
    };
  }

  if (!requestedCompanyId) {
    return { companyId: null, companyName: null, availableCredit: null, isProxy: true };
  }

  // Yetkilendirme: plasiyer için portföy kontrolü burada yapılır.
  const companyId = await authorizeCompany(user, requestedCompanyId);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, creditLimit: true, currentBalance: true },
  });

  return {
    companyId,
    companyName: company?.name ?? null,
    availableCredit: company
      ? company.creditLimit.minus(company.currentBalance).toFixed(2)
      : null,
    isProxy: true,
  };
}
