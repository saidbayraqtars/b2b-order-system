import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/auth", "@repo/types", "@repo/theme"],
  // Üretim imajı için: Next yalnızca gerçekten kullanılan dosyaları izleyip
  // .next/standalone altına kendi kendine yeten bir sunucu çıkarıyor. Aksi
  // hâlde imaja tüm monorepo'nun node_modules'ünü koymak gerekirdi.
  output: "standalone",
  // İzleme kökü monorepo kökü olmalı: paketler apps/web dışında duruyor ve
  // varsayılan kök (apps/web) onları dışarıda bırakır.
  outputFileTracingRoot: path.join(here, "../../"),
  experimental: {
    // Keep Prisma & bcrypt as external (Node) deps in server components/route handlers.
    serverComponentsExternalPackages: ["@prisma/client", "@repo/database", "bcryptjs"],
    // src/instrumentation.ts — açılışta ortam denetimi.
    instrumentationHook: true,
  },
};

export default nextConfig;
