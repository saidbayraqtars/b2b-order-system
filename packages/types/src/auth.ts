import { z } from "zod";
import { RoleEnum } from "./enums";
import { PermissionEnum } from "./permission";

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  /**
   * Yalnızca boş olmamalı — uzunluk/karmaşıklık kuralı **burada değil**.
   *
   * Şifre gücü, şifre *belirlenirken* denetlenir (`passwordSchema`). Giriş
   * formunda aynı kuralı tekrarlamak yalnızca bir şeye yarar: veritabanında
   * zaten duran geçerli bir şifreyle girişi engellemeye. Saldırıyı durduran
   * şey bu değil — giriş hız sınırı ve hesap kilidi (bkz. security.ts).
   *
   * Bu ayrım pratikte de gerekli: kurallar sıkılaştığında eski şifreler
   * aniden "giriş yapılamaz" hâle gelmemeli.
   */
  password: z.string().min(1, "Şifre gerekli").max(128),
  /**
   * İki adımlı doğrulama kodu — authenticator'ın altı hanesi ya da yedek kod.
   *
   * Şemada opsiyonel, çünkü hesapların çoğunda ikinci adım yok. Gerekip
   * gerekmediğine `attemptLogin` **şifreyi doğruladıktan sonra** karar verir;
   * form önce kodsuz gönderir, `TOTP_REQUIRED` yanıtını alınca alanı açar.
   *
   * Uzunluk sınırı biçimi zorlamaz: yedek kod tireli 11 karakter, TOTP 6 hane,
   * kullanıcı boşluk da bırakabilir. Biçim denetimi doğrulayan tarafta.
   */
  totp: z.string().trim().max(32).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: RoleEnum,
  companyId: z.string().cuid().optional(),
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;

// Shape of the authenticated principal carried in the session/JWT.
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: RoleEnum,
  companyId: z.string().nullable(),
  /**
   * İzin kümesi. Varsayılanı boş dizi, çünkü *token'dan gelen* değere hiçbir
   * yerde güvenilmiyor: her istekte `loadPrincipal` satırı yeniden okuyup bu
   * alanı ezer (bkz. security.ts). Buradaki alan yalnızca tipin tam olması ve
   * izinler daha yeni olan bir kurulumda basılmış eski bir token'ın parse
   * edilebilmesi için var.
   */
  permissions: z.array(PermissionEnum).default([]),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
