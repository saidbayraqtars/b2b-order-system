import type { ReturnActor, ReturnScope } from "@repo/services";
import { hasPermission, type SessionUser } from "@repo/types";
import { AuthError } from "./guard";

/**
 * Bir iade talebinde arayanın ne görebileceği.
 *
 * `reportScopeFor` ile aynı anlaşma: kapsam istekten değil **hesaptan**
 * geliyor. Bayi kendi firmasını, temsilci kendi portföyünü görüyor; süper admin
 * için kısıt yok. İstekten gelen `companyId` yalnızca daraltabiliyor (servis
 * ikisini birden `where`e koyuyor), genişletemiyor.
 */
export function returnScopeFor(user: SessionUser): ReturnScope {
  switch (user.role) {
    case "SUPER_ADMIN":
      return {};
    case "SALES_REP":
      return { salesRepId: user.id };
    case "COMPANY_ADMIN":
    case "COMPANY_STAFF": {
      if (!user.companyId) throw new AuthError(403, "Hesabınıza firma atanmamış");
      return { companyId: user.companyId };
    }
    // Kuryenin firma kavramı yok ve iade onun işi değil: taşıdığı sevkiyatı
    // görür, o kadar.
    case "COURIER":
      throw new AuthError(403, "Bu ekran kurye hesabına kapalı");
  }
}

/**
 * Arayanın iadeyi **karara bağlayıp bağlayamayacağı**.
 *
 * İzin burada okunup servise veriliyor, serviste sorulmuyor: servis
 * `@repo/types`'ın izin kayıt defterini biliyor ama oturumu bilmiyor, ve
 * oturumu oraya taşımak her servis çağrısına bir kimlik parametresi eklerdi.
 * Kararın kendisi yine serviste — `canManage: false` olan taraf yalnızca kendi
 * talebini iptal edebiliyor.
 */
export function returnActorFor(user: SessionUser): ReturnActor {
  return {
    userId: user.id,
    canManage: hasPermission(user.permissions, "returns.manage"),
  };
}
