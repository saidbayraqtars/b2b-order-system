#!/usr/bin/env bash
# Yedekten geri yükle.
#
#   ./scripts/restore.sh backup/20260807-141500
#
# Bu betik **veriyi siler**: veritabanındaki mevcut tablolar düşürülüp yedekteki
# hâlleriyle değiştirilir. Bu yüzden onay istiyor ve `--force` verilmedikçe
# soruyor. Otomatik çalıştırılacak bir şey değil.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="${1:-}"
FORCE="${2:-}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

[ -n "$SRC" ] || { echo "Kullanım: $0 <yedek-dizini> [--force]"; exit 1; }
[ -d "$SRC" ] || { echo "HATA: $SRC yok."; exit 1; }
[ -f "$SRC/database.dump" ] || { echo "HATA: $SRC/database.dump yok."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "HATA: $ENV_FILE yok."; exit 1; }
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

echo "Geri yüklenecek: $SRC"
[ -f "$SRC/MANIFEST.txt" ] && cat "$SRC/MANIFEST.txt"
echo
echo "UYARI: ${POSTGRES_DB:-b2b} veritabanının şu anki içeriği SİLİNECEK."
if [ "$FORCE" != "--force" ]; then
  read -r -p "Devam edilsin mi? (evet yazın) " answer
  [ "$answer" = "evet" ] || { echo "İptal edildi."; exit 1; }
fi

# Web durduruluyor: açık bağlantılar tabloları kilitler ve --clean yarıda kalır.
# Veritabanı ayakta kalmalı, geri yükleme ona bağlanacak.
echo "→ Web durduruluyor"
compose stop web migrate >/dev/null 2>&1 || true

echo "→ Veritabanı geri yükleniyor"
# --clean --if-exists: nesneleri düşürüp yeniden kurar; yoksa hata vermez.
# --no-owner: yedek başka bir kullanıcı adıyla alınmışsa sahiplik takılmasın.
# Çıkış kodu yok sayılmıyor ama pg_restore mevcut olmayan nesneleri düşürürken
# uyarı basabiliyor; hata varsa son satırda görünür.
compose exec -T db pg_restore -U "${POSTGRES_USER:-b2b}" -d "${POSTGRES_DB:-b2b}" \
  --clean --if-exists --no-owner < "$SRC/database.dump"

if [ -f "$SRC/uploads.tgz" ]; then
  echo "→ Görseller geri yükleniyor"
  docker run --rm \
    -v b2b_uploads:/dst \
    -v "$(pwd)/$SRC":/in:ro \
    alpine sh -c "rm -rf /dst/* && tar xzf /in/uploads.tgz -C /dst"
fi

if [ -f "$SRC/tenant.tgz" ]; then
  echo "→ Kiracı klasörü: $SRC/tenant.tgz"
  echo "  Otomatik açılmıyor — hedef yolu (TENANT_SOURCE) kurulumdan kuruluma"
  echo "  değişiyor ve yanlış yere açmak fatura başlığını bozar. Elle:"
  echo "    tar xzf $SRC/tenant.tgz -C $(dirname "${TENANT_SOURCE:-./tenants/demo}")"
fi

echo "→ Web başlatılıyor"
compose up -d web

echo "✓ Geri yükleme bitti. Sağlık: curl -s localhost:${WEB_PORT:-3000}/api/health"
