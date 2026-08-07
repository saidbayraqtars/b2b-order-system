import { PrismaClient, Role } from "@prisma/client";
import { defaultPermissionsFor } from "@repo/types";
import bcrypt from "bcryptjs";
import { seedDocumentSeries, seedLabelTemplates } from "./reference-data";

/**
 * Gerçek bir kurulumun ilk açılışı.
 *
 * `seed.ts` **üretimde çalıştırılamaz**: içinde `admin@b2b.local` ve
 * `Password123!` var, ikisi de depoda yazılı. Müşterinin sunucusunda böyle bir
 * hesabın var olması, adresi bilen herkesin sisteme süper admin olarak
 * girebilmesi demek. Bu yüzden üretim için ayrı bir giriş noktası var ve
 * buradan tek bir gösterim satırı bile geçmiyor.
 *
 * Yaptığı üç şey:
 *   1. Operatörün verdiği e-posta/şifreyle bir süper admin açar.
 *   2. Belge serilerini kurar (yoksa irsaliye/fatura numaralanamaz).
 *   3. Hazır etiket ve fiş tasarımlarını yazar.
 *
 * Kullanım:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @repo/database db:bootstrap
 *
 * Tekrar çalıştırılabilir: hesap varsa **şifresi değiştirilmez**. Aksi hâlde
 * güncelleme betiğinin yanlışlıkla çalıştırılması, müşterinin kendi
 * değiştirdiği şifreyi ortam değişkenindeki eskisine geri döndürürdü.
 */

const prisma = new PrismaClient();

const MIN_PASSWORD = 10;

function required(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (v === "") {
    console.error(
      `HATA: ${name} tanımlı değil.\n` +
        `Kullanım: ADMIN_EMAIL=patron@firma.com ADMIN_PASSWORD='...' pnpm --filter @repo/database db:bootstrap`,
    );
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");

  // Şifre kuralı burada da uygulanıyor: bu hesap, sistemdeki her yetkiyi
  // dağıtabilen tek hesap. Kurulum günü seçilen "1234", kurulumun ömrü boyunca
  // kalır.
  if (password.length < MIN_PASSWORD) {
    console.error(`HATA: ADMIN_PASSWORD en az ${MIN_PASSWORD} karakter olmalı.`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing) {
    console.log(`• ${email} zaten var — şifreye dokunulmadı.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: process.env.ADMIN_NAME?.trim() || "Yönetici",
        passwordHash: await bcrypt.hash(password, 10),
        role: Role.SUPER_ADMIN,
        permissions: defaultPermissionsFor("SUPER_ADMIN"),
      },
    });
    console.log(`✓ Süper admin açıldı: ${email}`);
  }

  await seedDocumentSeries(prisma);
  await seedLabelTemplates(prisma);
  console.log("✓ Belge serileri ve etiket tasarımları hazır.");

  // Kurulumu devralan kişinin bilmesi gereken tek şey: demo hesaplar yok.
  const total = await prisma.user.count();
  console.log(`Kurulumdaki kullanıcı sayısı: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
