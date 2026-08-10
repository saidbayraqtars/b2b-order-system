#!/usr/bin/env bash
# Sürüm güncelle — yedekle, derle, göç et, sağlığa bak, tutmazsa geri al.
#
#   ./scripts/update.sh              → çalışma ağacındaki kodu yayına alır
#   GIT_PULL=1 ./scripts/update.sh   → önce `git pull` yapar
#   SKIP_BACKUP=1 ./scripts/update.sh
#
# Neden yedek zorunlu: **şema göçü geri alınamaz.** Yeni sürüm bir kolonu
# düşürdüyse eski imaja dönmek onu geri getirmez. Bu betiğin "geri alma"sı
# uygulama sürümünü eski imaja döndürür; veri kaybı olduysa çare yedektir.
# Bu yüzden yedek adımı isteğe bağlı değil, atlanması açıkça istenmeli.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

[ -f "$ENV_FILE" ] || { echo "HATA: $ENV_FILE yok."; exit 1; }
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

PORT="${WEB_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# curl her sunucuda yok; busybox wget çoğunda var.
fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 5 "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -T 5 -O - "$1"
  else echo "HATA: curl ya da wget gerekli." >&2; return 1
  fi
}

# Yanıttaki "version" alanı. jq'ya bağımlı olmamak için sed ile; alan basit bir
# dize ve biçimi bizim ucumuzun garantisi.
health_version() {
  fetch "$HEALTH_URL" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

wait_healthy() {
  local want="$1" waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    local got
    got="$(health_version || true)"
    # Sürüm eşleşmesi şart: 200 dönen ama hâlâ eski kopya olan bir sunucu
    # "güncelleme başarılı" sanılırdı.
    if [ -n "$got" ] && [ "$got" = "$want" ]; then return 0; fi
    sleep 3
    waited=$((waited + 3))
    printf '.'
  done
  printf '\n'
  return 1
}

PREVIOUS="$(health_version || true)"
[ -n "$PREVIOUS" ] || PREVIOUS="${APP_VERSION:-local}"

if [ "${GIT_PULL:-0}" = "1" ]; then
  echo "→ git pull"
  git pull --ff-only
fi

# Sürüm etiketi; imaj etiketi, /api/health çıktısı ve geri alma hedefi hep aynı
# değer olsun diye tek yerden üretiliyor.
#
# `git describe`, kısa sha değil: merkezden güncelleme akışı sürümü **etiket
# adıyla** duyuruyor (v1.4.0), ve o etikete geçtikten sonra kurulumun kendini
# aynı adla tanıtması gerekiyor. Kısa sha kalsaydı akıştaki ad ile çalışan ad
# hiçbir zaman eşleşmez, her kontrolde "güncelleme var" denirdi. Etiketli
# olmayan ağaçta `v1.4.0-3-gabc1234`, hiç etiket yoksa sha'ya düşüyor;
# `--dirty` yerel değişikliği görünür kılıyor.
NEW_VERSION="$(git describe --tags --always --dirty 2>/dev/null || date +%Y%m%d-%H%M%S)"

echo "Şu anki sürüm: $PREVIOUS"
echo "Yeni sürüm:    $NEW_VERSION"

if [ "${SKIP_BACKUP:-0}" != "1" ]; then
  echo "→ Yedek"
  ./scripts/backup.sh
else
  echo "→ Yedek ATLANDI (SKIP_BACKUP=1)"
fi

echo "→ İmaj derleniyor"
APP_VERSION="$NEW_VERSION" compose build web migrate

echo "→ Şema göçü"
# Göç başarısızsa burada duruyoruz: web hiç değiştirilmedi, eski sürüm ayakta
# ve şema da eski. Güncellemenin en güvenli durma noktası burası.
if ! APP_VERSION="$NEW_VERSION" compose run --rm migrate; then
  echo "HATA: migration başarısız. Eski sürüm çalışmaya devam ediyor."
  exit 1
fi

echo "→ Web yeni sürüme geçiriliyor"
# Sürüm aynıysa (aynı kod tekrar yayına alınıyor) Compose hiçbir şeyi
# değiştirmez ve kapsayıcı olduğu gibi kalır — betik de "yeni sürüm ayağa
# kalkmadı" diye 120 saniye bekleyip geri alma dansına girerdi. Sürüm adına
# ayırt edici bir sonek eklemek yerine kapsayıcı açıkça yeniden kuruluyor:
# sürüm adı **kodun kimliğidir**, çalıştırma sayısının değil.
RECREATE=""
[ "$NEW_VERSION" = "$PREVIOUS" ] && RECREATE="--force-recreate"
# shellcheck disable=SC2086
APP_VERSION="$NEW_VERSION" compose up -d $RECREATE web

printf '→ Sağlık bekleniyor '
if wait_healthy "$NEW_VERSION"; then
  printf '\n✓ %s yayında\n' "$NEW_VERSION"
  exit 0
fi

echo "HATA: yeni sürüm ${HEALTH_TIMEOUT}s içinde sağlıklı olmadı."
compose logs --tail 60 web || true

echo "→ Geri alınıyor: $PREVIOUS"
if APP_VERSION="$PREVIOUS" compose up -d web && wait_healthy "$PREVIOUS"; then
  printf '\n✓ %s sürümüne dönüldü.\n' "$PREVIOUS"
else
  printf '\nUYARI: eski sürüm de ayağa kalkmadı.\n'
fi

cat <<EOF

Şema bu güncellemede ilerledi ve geri alınmadı. Eski sürüm yeni şemayla
çalışamıyorsa yedekten dönün:

  ./scripts/restore.sh backup/<en-son-dizin>

EOF
exit 1
