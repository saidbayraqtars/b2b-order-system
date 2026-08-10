#!/usr/bin/env bash
# Sürüm yayımla — merkezdeki akış dosyasını üretir.
#
#   ./scripts/release.sh v1.4.0
#   ./scripts/release.sh v1.4.0 --channel beta
#   ./scripts/release.sh v1.4.0 --mandatory --notes "Giriş açığı kapatıldı"
#
# Bu betik **satıcının makinesinde** çalışır, müşteri sunucusunda değil. Yaptığı
# tek şey `dist/feed/<kanal>.json` dosyasını yazmak; o dosyayı yayına almak
# (S3'e kopyalamak, statik siteye koymak) ayrı ve kasıtlı bir adım — bir betiğin
# sonunda kazara elli kuruluma sürüm duyurulmasın diye.
#
# Etiketin depoda ve `origin`de olması şart: kurulumlardaki ajan kodu kendi
# origin'inden çekiyor, akış yalnızca adı söylüyor. Push edilmemiş bir etiketi
# duyurmak, her kurulumda "etiket depoda yok" hatası demek.

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo "Kullanım: $0 <etiket> [--channel stable] [--mandatory] [--notes '...'] [--notes-url URL]"; exit 2; }
shift

CHANNEL="stable"
MANDATORY="false"
NOTES=""
NOTES_URL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --channel) CHANNEL="${2:?}"; shift 2 ;;
    --mandatory) MANDATORY="true"; shift ;;
    --notes) NOTES="${2:?}"; shift 2 ;;
    --notes-url) NOTES_URL="${2:?}"; shift 2 ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 2 ;;
  esac
done

# Ajanın kabul ettiği kümenin aynısı. Burada da kontrol ediliyor ki geçersiz bir
# ad elli kurulumda birden reddedilmek yerine yayımlanmadan yakalansın.
printf '%s' "$VERSION" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' \
  || { echo "HATA: etiket adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir."; exit 1; }
printf '%s' "$CHANNEL" | grep -Eq '^[a-z0-9-]{1,50}$' \
  || { echo "HATA: kanal adı geçersiz."; exit 1; }

git rev-parse -q --verify "refs/tags/${VERSION}^{commit}" >/dev/null 2>&1 \
  || { echo "HATA: '$VERSION' etiketi bu depoda yok."; exit 1; }

if ! git ls-remote --exit-code --tags origin "refs/tags/${VERSION}" >/dev/null 2>&1; then
  echo "HATA: '$VERSION' origin'e gönderilmemiş.  git push origin $VERSION"
  exit 1
fi

# Not alanı akışta düz bir JSON dizesi ve müşteri sunucusunda sed ile
# ayrıştırılıyor (orada jq olduğunu varsayamayız). Tırnak ve satır sonu o
# ayrıştırmayı sessizce bozar — uzun metnin yeri `--notes-url`.
[ -n "$NOTES" ] || NOTES="$(git tag -l --format='%(contents:subject)' "$VERSION")"
case "$NOTES" in
  *'"'*|*'\'*) echo "HATA: not alanı tırnak ya da ters bölü içeremez. Uzun metin için --notes-url."; exit 1 ;;
esac
if [ "$(printf '%s' "$NOTES" | wc -l)" -gt 0 ]; then
  echo "HATA: not alanı tek satır olmalı. Uzun metin için --notes-url."; exit 1
fi
[ "${#NOTES}" -le 300 ] || { echo "HATA: not alanı 300 karakteri aşamaz."; exit 1; }

RELEASED="$(git tag -l --format='%(creatordate:iso-strict)' "$VERSION")"
[ -n "$RELEASED" ] || RELEASED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

OUT_DIR="dist/feed"
mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/${CHANNEL}.json"

cat > "$OUT" <<EOF
{
  "schema": 1,
  "version": "${VERSION}",
  "releasedAt": "${RELEASED}",
  "mandatory": ${MANDATORY},
  "notes": "${NOTES}",
  "notesUrl": "${NOTES_URL}"
}
EOF

cat <<EOF

✓ $OUT yazıldı

$(cat "$OUT")

Yayına almak için bu dosyayı akış adresine kopyalayın; kurulumlardaki
UPDATE_FEED_URL bu dizini gösteriyor olmalı:

  <UPDATE_FEED_URL>/${CHANNEL}.json

Zorunlu sürüm: ${MANDATORY}. Zorunlu işaretlenen sürüm, politikası 'notify' olan
kurulumlarda da ekranda kırmızı çıkar — güvenlik yaması ile özellik sürümü aynı
renkte görünmesin diye.
EOF
