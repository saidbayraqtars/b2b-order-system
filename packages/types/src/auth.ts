import { z } from "zod";
import { RoleEnum } from "./enums";

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
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
