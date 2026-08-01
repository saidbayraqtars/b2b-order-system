import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@repo/database";
import { loginSchema, type SessionUser } from "@repo/types";
import { AuthError, InputError, withAuthErrors } from "@/lib/guard";
import { signMobileToken } from "@/lib/mobile-token";

// POST /api/mobile/login — email/password → bearer token for the native app.
export function POST(req: NextRequest) {
  return withAuthErrors(async () => {
    const json = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      throw new InputError(parsed.error.issues[0]?.message ?? "Geçersiz istek");
    }

    const { email, password } = parsed.data;
    const found = await prisma.user.findUnique({ where: { email } });
    if (!found || !found.isActive) {
      throw new AuthError(401, "E-posta veya şifre hatalı");
    }

    const ok = await bcrypt.compare(password, found.passwordHash);
    if (!ok) throw new AuthError(401, "E-posta veya şifre hatalı");

    const user: SessionUser = {
      id: found.id,
      email: found.email,
      name: found.name,
      role: found.role,
      companyId: found.companyId,
    };
    const token = await signMobileToken(user);
    return Response.json({ token, user });
  });
}
