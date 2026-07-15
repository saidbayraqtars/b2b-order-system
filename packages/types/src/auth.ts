import { z } from "zod";
import { RoleEnum } from "./enums";

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
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
