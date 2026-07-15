/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/auth", "@repo/types"],
  experimental: {
    // Keep Prisma & bcrypt as external (Node) deps in server components/route handlers.
    serverComponentsExternalPackages: ["@prisma/client", "@repo/database", "bcryptjs"],
  },
};

export default nextConfig;
