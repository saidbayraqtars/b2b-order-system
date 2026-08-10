#!/usr/bin/env bash
# Yedek al: veritabanı + yüklenen görseller + kiracı klasörü.
#
# Üçü birden alınıyor çünkü üçü birlikte anlamlı. Yalnız veritabanı yedeği,
# geri yüklendiğinde ürün görselleri kırık ve fatura başlığı boş bir sistem
# verir; yalnız dosya yedeği ise hiçbir işe yaramaz.
#
#   ./scripts/backup.sh              → backup/<zaman-damgası>/
#   RETAIN_DAYS=30 ./scripts/backup.sh
#
# Betik güncelleme öncesinde otomatik çağrılıyor (scripts/update.sh).

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-backup}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

[ -f "$ENV_FILE" ] || { echo "HATA: $ENV_FILE yok."; exit 1; }
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_ROOT/$STAMP"
mkdir -p "$OUT"

echo "→ Veritabanı ($POSTGRES_DB)"
# -Fc: sıkıştırılmış özel biçim. Düz SQL'den küçük ve pg_restore ile seçmeli
# geri yükleme yapılabiliyor. -T: TTY ayrılmasın, çıktı doğrudan dosyaya aksın.
compose exec -T db pg_dump -U "${POSTGRES_USER:-b2b}" -d "${POSTGRES_DB:-b2b}" -Fc \
  > "$OUT/database.dump"

echo "→ Yüklenen görseller"
# Birim doğrudan okunuyor: web kapsayıcısı kapalıyken de yedek alınabilsin.
docker run --rm \
  -v b2b_uploads:/src:ro \
  -v "$(pwd)/$OUT":/out \
  alpine tar czf /out/uploads.tgz -C /src . 2>/dev/null \
  || echo "  (uploads birimi yok — henüz görsel yüklenmemiş olabilir)"

echo "→ Kiracı klasörü"
TENANT_PATH="${TENANT_SOURCE:-./tenants/demo}"
if [ -d "$TENANT_PATH" ]; then
  tar czf "$OUT/tenant.tgz" -C "$(dirname "$TENANT_PATH")" "$(basename "$TENANT_PATH")"
else
  echo "  UYARI: $TENANT_PATH bulunamadı."
fi

# Yapılandırma da yedekleniyor ama sırlar içerdiği için erişimi kısıtlı.
cp "$ENV_FILE" "$OUT/env"
chmod 600 "$OUT/env"

cat > "$OUT/MANIFEST.txt" <<EOF
tarih:   $(date -Iseconds)
sürüm:   ${APP_VERSION:-bilinmiyor}
db:      ${POSTGRES_DB:-b2b}
kiracı:  $TENANT_PATH
geri al: ./scripts/restore.sh $OUT
EOF

echo "✓ $OUT"

# Eski yedekleri temizle. Süresiz saklamak diskin dolmasıyla biter ve dolu disk
# postgres'i yazamaz hâle getirir — yedek almanın kurumu bozması.
if [ "$RETAIN_DAYS" -gt 0 ]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETAIN_DAYS" \
    -exec rm -rf {} + 2>/dev/null || true
fi
