#!/usr/bin/env bash
# İlk kurulum. Bir kez çalışır; sonraki sürümler için scripts/update.sh.
#
#   cp .env.production.example .env.production   # doldur
#   ./scripts/install.sh
#
# Yaptığı sıra bilerek böyle: önce yapılandırma doğrulanır (yanlışsa hiçbir şey
# ayağa kalkmaz), sonra şema, sonra yönetici hesabı, en son web. Web'in en sonda
# olmasının sebebi, hesabı olmayan ve şeması yarım bir sistemin dışarıya açık
# durmaması.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "HATA: $ENV_FILE yok."
  echo "  cp .env.production.example $ENV_FILE   # sonra doldurun"
  exit 1
fi
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

fail() { echo "HATA: $1"; exit 1; }

echo "→ Yapılandırma denetimi"
[ -n "${POSTGRES_PASSWORD:-}" ] || fail "POSTGRES_PASSWORD boş."
[ -n "${DATABASE_URL:-}" ]      || fail "DATABASE_URL boş."
[ -n "${AUTH_SECRET:-}" ]       || fail "AUTH_SECRET boş. Üretin: openssl rand -base64 33"
[ "${#AUTH_SECRET}" -ge 32 ]    || fail "AUTH_SECRET 32 karakterden kısa."
[ -n "${APP_URL:-}" ]           || fail "APP_URL boş."
case "$APP_URL" in
  http://localhost*|http://127.0.0.1*) fail "APP_URL yerel adrese bakıyor; e-posta bağlantıları müşteride açılmaz." ;;
esac

# Kiracı klasörü kurulumun kimliği. Eksikse fatura ve irsaliye basılamaz, o
# yüzden kurulum burada durur — sonra fark edilmesi çok daha pahalı.
TENANT_PATH="${TENANT_SOURCE:-./tenants/demo}"
[ -f "$TENANT_PATH/tenant.json" ] || fail "$TENANT_PATH/tenant.json yok (bkz. tenants/README.md)."
case "$TENANT_PATH" in
  *tenants/demo) echo "  UYARI: demo kiracı klasörü kullanılıyor — belgelerde örnek firma adı basılır." ;;
esac

APP_VERSION="${APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)}"
export APP_VERSION
echo "  sürüm: $APP_VERSION"

echo "→ İmajlar derleniyor (ilk derleme birkaç dakika sürer)"
compose build

echo "→ Veritabanı"
compose up -d db
printf '  hazırlanıyor '
for _ in $(seq 1 30); do
  if compose exec -T db pg_isready -U "${POSTGRES_USER:-b2b}" -d "${POSTGRES_DB:-b2b}" >/dev/null 2>&1; then
    printf ' hazır\n'; break
  fi
  printf '.'; sleep 2
done

echo "→ Şema"
compose run --rm migrate

echo "→ Yönetici hesabı"
if [ -z "${ADMIN_EMAIL:-}" ]; then read -r -p "  E-posta: " ADMIN_EMAIL; fi
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  # -s: şifre terminale yazılmasın; kabuk geçmişine de girmesin diye
  # değişkenle veriliyor, komut satırında değil.
  read -r -s -p "  Şifre (en az 10 karakter): " ADMIN_PASSWORD; echo
fi
compose run --rm \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e ADMIN_NAME="${ADMIN_NAME:-Yönetici}" \
  migrate pnpm exec tsx prisma/bootstrap.ts

echo "→ Web"
compose up -d web

PORT="${WEB_PORT:-3000}"
printf '  sağlık bekleniyor '
for _ in $(seq 1 40); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    printf ' tamam\n'
    echo
    echo "✓ Kurulum bitti."
    echo "  Yerel:   http://127.0.0.1:${PORT}"
    echo "  Dış:     ${APP_URL}  (ters vekil ${PORT} portuna bağlanmalı)"
    echo "  Giriş:   $ADMIN_EMAIL"
    exit 0
  fi
  printf '.'; sleep 3
done

printf '\n'
echo "HATA: web sağlıklı olmadı. Günlük:"
compose logs --tail 60 web
exit 1
