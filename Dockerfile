# syntax=docker/dockerfile:1
#
# Üretim imajı. İki hedef üretir:
#   --target runner    → web sunucusu (varsayılan)
#   --target migrator  → tek seferlik migration konteyneri
#
# Ayrımın sebebi: migration'ı web sunucusunun açılışında çalıştırmak, iki
# kopya aynı anda başlatıldığında ikisinin birden şemaya girmesi demek. Ayrıca
# çalışan sunucunun imajında `prisma` CLI ve migration dosyalarının bulunması
# gerekmez — orada durmaları yalnızca saldırı yüzeyi.
#
# Taban Debian slim, Alpine değil: Prisma sorgu motoru glibc/openssl3 hedefiyle
# sorunsuz çalışıyor, musl hedefinde ek ayar istiyor. Birkaç on MB için
# kurulum günü sürprizi alınmaz.

ARG NODE_IMAGE=node:20-bookworm-slim

# ── Ortak taban ───────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate
# Prisma motoru OpenSSL'e bakıyor; slim imajda paket kurulu gelmiyor.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Bağımlılıklar ─────────────────────────────────────────────────────────────
# Yalnızca manifest'ler kopyalanıyor: kaynak değiştiğinde bu katman
# tazelenmiyor, kurulum yeniden yapılmıyor.
#
# Her çalışma alanı paketi tek tek yazılmak zorunda — pnpm tüm grafiği görmeden
# `--filter` çözemiyor ve Docker COPY joker ifadeyle dizin yapısını korumuyor.
# Yeni bir paket eklendiğinde buraya da bir satır gerekir; unutulursa kurulum
# "workspace package not found" ile durur, sessizce eksik derlenmez.
FROM base AS deps
# Kurulum ağa dayanıklı olmalı: bin küsur paket indiriliyor ve tek bir sıfırlanan
# bağlantı tüm derlemeyi düşürüyor. Eşzamanlılık düşürülüyor (varsayılan 16 soket
# ev/ofis bağlantısında ve Docker Desktop NAT'ında tıkanıyor), yeniden deneme
# aralığı uzatılıyor.
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_NETWORK_CONCURRENCY=4 \
    NPM_CONFIG_STORE_DIR=/pnpm/store
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY apps/erp-agent/package.json apps/erp-agent/
COPY packages/auth/package.json packages/auth/
COPY packages/database/package.json packages/database/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/services/package.json packages/services/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/types/package.json packages/types/
# `--filter web...` web'i ve bağımlı olduğu çalışma alanı paketlerini kurar;
# Expo bağımlılıkları (yüzlerce MB) imaja hiç girmez.
#
# Önbellek bağlaması (cache mount) indirilmiş paketleri derlemeler arasında
# tutuyor: kopan bir kurulum yeniden denendiğinde bin paket baştan inmiyor,
# kalınan yerden devam ediyor.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter web... --filter @repo/database...

# ── Derleme ───────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
# İkinci kilit. `.dockerignore` bunları zaten elemeli, ama eleyememesi tek bir
# yanlış kalıba bakıyor ve bedeli ağır: Next, uygulama dizinindeki `.env`
# dosyasını standalone çıktısıyla birlikte taşıyıp **çalışma anında yüklüyor**.
# Geliştiricinin yerel AUTH_SECRET'i böylece müşterinin sunucusunda geçerli
# imza anahtarı hâline geliyor. Bağlamda ne kalmışsa burada siliniyor.
RUN find . -name ".env" -o -name ".env.*" ! -name "*.example" | xargs -r rm -f
# Prisma client derlemeden önce üretilmeli; `next build` onu içe aktarıyor.
RUN pnpm --filter @repo/database exec prisma generate
# NODE_ENV=production: Next zaten üretim derlemesi yapıyor, açık yazmak
# bağımlılıkların da üretim dalına girmesini garanti ediyor.
ENV NODE_ENV=production
RUN pnpm --filter web build

# ── Migration konteyneri ──────────────────────────────────────────────────────
# Derleme katmanının üstüne biniyor: prisma CLI ve migration dosyaları burada
# zaten var, ek katman maliyeti yok. Tek seferlik çalışır ve çıkar.
FROM builder AS migrator
WORKDIR /app/packages/database
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── Çalışan sunucu ────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# İmaj etiketiyle aynı değer; /api/health bunu geri veriyor ve güncelleme
# betiği "yeni sürüm gerçekten ayağa kalktı mı" sorusunu buna bakarak yanıtlar.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Next'in standalone çıktısı: yalnızca gerçekten kullanılan dosyalar ve
# izlenmiş node_modules. Tüm monorepo imaja girmiyor.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# Sorgu motoru ikilisi izlemeden kaçabiliyor (dinamik yükleniyor); açıkça
# kopyalanıyor — eksikse hata çalışma anında ve anlaşılmaz oluyor.
COPY --from=builder --chown=node:node /app/node_modules/.prisma/client ./node_modules/.prisma/client

# Yüklenen görsellerin dizini imajın içinde değil, kalıcı bir birimde durmalı;
# burada yalnızca bağlama noktası hazırlanıyor (boş birim sahipliği bu dizinden
# devralınır — aksi hâlde root'a ait olur ve uygulama yazamaz).
RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
EXPOSE 3000

# Kapsayıcı sağlık kontrolü. curl kurulu değil: Node 20'de fetch global,
# imaja fazladan paket koymaya gerek yok.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
