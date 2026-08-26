import { resetTwoFactorFor } from "@repo/services";
import { requireUser, withAuthErrors } from "@/lib/guard";
import { userAdminContext, USER_ADMIN_ROLES } from "@/lib/user-admin-context";

// DELETE /api/admin/users/:id/two-factor — kullanıcının ikinci adımını sıfırla.
//
// Telefonunu ve yedek kodlarını birden kaybeden kullanıcının tek çıkışı.
// Hesabı 2FA'sız bırakmaz: kayıt silinir, kullanıcı zorunlu kapsamdaysa bir
// sonraki girişinde yeniden kurulum ekranına düşer.
//
// Kapsam (hangi kullanıcıya dokunulabilir) servis tarafında, `userAdminContext`
// üzerinden — firma yöneticisi yalnızca kendi firmasının hesaplarına erişir.
export function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return withAuthErrors(async () => {
    const user = await requireUser(USER_ADMIN_ROLES, "users.manage");
    await resetTwoFactorFor(params.id, userAdminContext(user));
    return new Response(null, { status: 204 });
  });
}
