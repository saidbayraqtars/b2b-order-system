#!/usr/bin/env bash
# Güncelleme ajanı — merkezdeki sürüm akışına bakar, politikaya göre uygular.
#
#   ./scripts/agent.sh            → bak, durumu yaz, politika izin veriyorsa güncelle
#   ./scripts/agent.sh --check    → yalnızca bak ve durumu yaz, asla güncelleme
#   ./scripts/agent.sh --now      → pencere ve politika dinlemeden şimdi güncelle
#
# Zamanlayıcıdan (systemd timer / cron) günde birkaç kez çalışacak şekilde
# kurulur; `deploy/b2b-update.timer` içinde hazır tanım var.
#
# ── Merkez neden bir sunucu değil ─────────────────────────────────────────────
#
# Her müşteri kendi kurulumunda çalışıyor. Merkezi bir kontrol sunucusu, her
# müşterinin sunucusuna komut geçirebilen tek bir hedef demek olurdu: orayı ele
# geçiren, elli kurulumun hepsinde kod çalıştırır. Bunun yerine akış **statik
# bir JSON dosyası** (S3, GitHub Pages, kendi alan adınız — fark etmez) ve
# yön tek taraflı: sunucular okur, merkez hiçbir sunucuya bağlanmaz.
#
# Akış **yalnızca bir git etiketinin adını** söyler. Kod her zaman kurulumun
# kendi `origin`'inden gelir. Böylece akışı ele geçirmek kod çalıştırmaya
# yetmez; saldırganın ayrıca depoya yazabiliyor olması gerekir. İki kilit daha:
# etiket adı katı bir karakter kümesinden geçmeden `git`e verilmez ve
# UPDATE_REQUIRE_SIGNED_TAG=1 ile etiketin imzası doğrulanır.
#
# ── Akış biçimi ──────────────────────────────────────────────────────────────
#
# ${UPDATE_FEED_URL}/${UPDATE_CHANNEL}.json — kanal başına ayrı ve **düz** dosya:
#
#   { "schema": 1, "version": "v1.4.0", "releasedAt": "2026-08-11T00:00:00Z",
#     "mandatory": false, "notes": "Tek satır özet", "notesUrl": "https://..." }
#
# İç içe geçmiş JSON yok, çünkü burada jq yok: müşteri sunucusunda ne olduğunu
# seçemiyoruz, bu betiğin bağımlılığı sh + git + docker ile sınırlı. Düz dosyayı
# sed ile ayrıştırmak dürüst bir iş; iç içe yapıyı sed ile ayrıştırmak değil.
# `notes` bu yüzden tırnak ve satır sonu içeremez — `scripts/release.sh` bunu
# yayımlarken reddediyor, uzun metin `notesUrl`de duruyor.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
[ -f "$ENV_FILE" ] || { echo "HATA: $ENV_FILE yok."; exit 1; }
# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

FEED_URL="${UPDATE_FEED_URL:-}"
CHANNEL="${UPDATE_CHANNEL:-stable}"
POLICY="${UPDATE_POLICY:-notify}"
WINDOW="${UPDATE_WINDOW:-02:00-05:00}"
STATE_FILE="${UPDATE_STATE_FILE:-./var/update-state.json}"
LOG_FILE="${UPDATE_LOG_FILE:-./var/update-agent.log}"
PORT="${WEB_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

MODE="run"
case "${1:-}" in
  --check) MODE="check" ;;
  --now)   MODE="now" ;;
  "")      ;;
  *) echo "Bilinmeyen argüman: $1" >&2; exit 2 ;;
esac

[ -n "$FEED_URL" ] || { echo "HATA: UPDATE_FEED_URL tanımlı değil."; exit 1; }

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOG_FILE")"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ── Tek kopya ────────────────────────────────────────────────────────────────
# İki ajan aynı anda `git checkout` + `compose up` yaparsa kurulum yarı yolda
# kalır. flock her yerde yok; `mkdir` atomikliği her yerde var.
LOCK_DIR="${TMPDIR:-/tmp}/b2b-update-agent.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Başka bir ajan çalışıyor ($LOCK_DIR) — çıkılıyor."
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 20 "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -T 20 -O - "$1"
  else echo "HATA: curl ya da wget gerekli." >&2; return 1
  fi
}

# Düz JSON'dan tek bir alan. Değer tırnak içermediği için `[^"]*` tam doğru.
json_str() { printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1; }
json_bool() { printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p" | head -n 1; }

health_field() { fetch "$HEALTH_URL" 2>/dev/null | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -n 1; }
health_status() { fetch "$HEALTH_URL" 2>/dev/null | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -n 1; }

# ── Durum dosyası ────────────────────────────────────────────────────────────
# Web kapsayıcısı bu dosyayı salt okunur görüyor. **Geçici dosyaya yazıp
# taşınıyor**: doğrudan yazılsaydı web yarısı yazılmış bir JSON okuyabilirdi.
# Bu yüzden bağlama noktası dosya değil dizin olmalı — bind ile bağlanan bir
# *dosya* eski inode'a takılı kalır ve taşımadan sonra hiç değişmez.
write_state() {
  local checked="$1" current="$2" avail_version="$3" avail_released="$4" \
        avail_notes="$5" avail_mandatory="$6" err="$7"
  local tmp="${STATE_FILE}.tmp.$$"

  {
    printf '{\n'
    printf '  "schema": 1,\n'
    printf '  "checkedAt": "%s",\n' "$checked"
    printf '  "channel": "%s",\n' "$CHANNEL"
    printf '  "policy": "%s",\n' "$POLICY"
    printf '  "currentVersion": "%s",\n' "${current:-unknown}"
    if [ -n "$avail_version" ]; then
      printf '  "available": { "version": "%s", "releasedAt": %s, "notes": "%s", "mandatory": %s },\n' \
        "$avail_version" \
        "$( [ -n "$avail_released" ] && printf '"%s"' "$avail_released" || printf 'null' )" \
        "$avail_notes" \
        "${avail_mandatory:-false}"
    else
      printf '  "available": null,\n'
    fi
    printf '  "lastRun": %s,\n' "$(cat "${STATE_FILE}.run" 2>/dev/null || printf 'null')"
    printf '  "error": %s\n' "$( [ -n "$err" ] && printf '"%s"' "$err" || printf 'null' )"
    printf '}\n'
  } > "$tmp"

  mv -f "$tmp" "$STATE_FILE"
}

# Son çalıştırma kaydı ayrı bir dosyada tutuluyor ve durum yazılırken içine
# gömülüyor: her kontrol, en son güncellemenin sonucunu silmeden geçmeli.
write_run() {
  local started="$1" finished="$2" from="$3" to="$4" result="$5" message="$6"
  printf '{ "startedAt": "%s", "finishedAt": %s, "fromVersion": "%s", "toVersion": "%s", "result": "%s", "message": "%s" }' \
    "$started" \
    "$( [ -n "$finished" ] && printf '"%s"' "$finished" || printf 'null' )" \
    "$from" "$to" "$result" "$message" > "${STATE_FILE}.run"
}

# JSON dizesine girecek her serbest metin buradan geçer. Betiğin ürettiği
# dosyanın geçerli JSON kalması buna bağlı.
sanitize() { printf '%s' "$1" | tr -d '"\\\n\r\t' | cut -c1-300; }

CURRENT="$(health_field version || true)"
CHECKED="$(now_iso)"

log "Kanal=$CHANNEL politika=$POLICY çalışan=${CURRENT:-bilinmiyor}"

FEED="$(fetch "${FEED_URL%/}/${CHANNEL}.json" 2>/dev/null || true)"
if [ -z "$FEED" ]; then
  log "Akış okunamadı: ${FEED_URL%/}/${CHANNEL}.json"
  write_state "$CHECKED" "$CURRENT" "" "" "" "" "Sürüm akışı okunamadı"
  exit 0
fi

NEW_VERSION="$(json_str "$FEED" version)"
RELEASED="$(json_str "$FEED" releasedAt)"
NOTES="$(sanitize "$(json_str "$FEED" notes)")"
MANDATORY="$(json_bool "$FEED" mandatory)"; MANDATORY="${MANDATORY:-false}"

# Etiket adı doğrudan `git`e gidiyor: burada geçen her karakter kabuğa da
# giriyor demektir. Beyaz liste, kara liste değil.
case "$NEW_VERSION" in
  "" ) log "Akışta version alanı yok."
       write_state "$CHECKED" "$CURRENT" "" "" "" "" "Akış biçimi tanınmadı"; exit 0 ;;
esac
if ! printf '%s' "$NEW_VERSION" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'; then
  log "Sürüm adı kabul edilmedi: $NEW_VERSION"
  write_state "$CHECKED" "$CURRENT" "" "" "" "" "Sürüm adı geçersiz"
  exit 0
fi

write_state "$CHECKED" "$CURRENT" "$NEW_VERSION" "$RELEASED" "$NOTES" "$MANDATORY" ""
log "Yayımlanan sürüm: $NEW_VERSION (zorunlu=$MANDATORY)"

[ "$MODE" = "check" ] && exit 0
[ "$NEW_VERSION" = "${CURRENT:-}" ] && { log "Zaten güncel."; exit 0; }

if [ "$MODE" != "now" ]; then
  if [ "$POLICY" != "auto" ]; then
    log "Politika '$POLICY' — güncelleme uygulanmıyor, yalnızca bildiriliyor."
    exit 0
  fi

  # Bakım penceresi. Gece yarısını aşan aralık (22:00-04:00) da destekleniyor.
  START="${WINDOW%-*}"; END="${WINDOW#*-}"
  NOWHM="$(date +%H:%M)"
  in_window=0
  if [ "$START" = "$END" ]; then in_window=1
  elif [ "$START" \< "$END" ]; then
    [ "$NOWHM" \> "$START" ] && [ "$NOWHM" \< "$END" ] && in_window=1
  else
    { [ "$NOWHM" \> "$START" ] || [ "$NOWHM" \< "$END" ]; } && in_window=1
  fi
  if [ "$in_window" -ne 1 ]; then
    log "Bakım penceresi dışında ($WINDOW) — bekleniyor."
    exit 0
  fi

  # Sağlıksız kuruluma güncelleme basılmaz. Yarım kalmış bir göçün ya da
  # okunamayan kiracı klasörünün üstüne yeni sürüm koymak, teşhisi imkânsız
  # hâle getirir; operatör önce neden bozuk olduğunu görmeli.
  if [ "$(health_status || true)" != "ok" ]; then
    log "Kurulum sağlıklı değil — otomatik güncelleme durduruldu."
    exit 0
  fi
fi

# Çalışma ağacı temiz olmalı: müşteri sunucusunda elle düzenlenmiş bir dosya
# varsa `git checkout` onu ezerdi. Kaybolan şeyin ne olduğunu kimse bilemez.
if [ -n "$(git status --porcelain)" ]; then
  log "HATA: çalışma ağacı temiz değil — elle düzenlenmiş dosyalar var."
  git status --porcelain | head -20 | tee -a "$LOG_FILE"
  exit 1
fi

STARTED="$(now_iso)"
write_run "$STARTED" "" "${CURRENT:-unknown}" "$NEW_VERSION" "running" "Güncelleme başladı"
write_state "$CHECKED" "$CURRENT" "$NEW_VERSION" "$RELEASED" "$NOTES" "$MANDATORY" ""

fail() {
  log "$1"
  write_run "$STARTED" "$(now_iso)" "${CURRENT:-unknown}" "$NEW_VERSION" "failed" "$(sanitize "$1")"
  write_state "$(now_iso)" "$(health_field version || true)" "$NEW_VERSION" "$RELEASED" "$NOTES" "$MANDATORY" ""
  exit 1
}

log "→ git fetch"
git fetch --tags --prune origin >>"$LOG_FILE" 2>&1 || fail "git fetch başarısız"

git rev-parse -q --verify "refs/tags/${NEW_VERSION}^{commit}" >/dev/null 2>&1 \
  || fail "Etiket depoda yok: $NEW_VERSION"

if [ "${UPDATE_REQUIRE_SIGNED_TAG:-0}" = "1" ]; then
  git verify-tag "$NEW_VERSION" >>"$LOG_FILE" 2>&1 \
    || fail "Etiket imzası doğrulanamadı: $NEW_VERSION"
fi

log "→ checkout $NEW_VERSION"
git checkout --detach "refs/tags/${NEW_VERSION}" >>"$LOG_FILE" 2>&1 \
  || fail "checkout başarısız: $NEW_VERSION"

log "→ update.sh"
if ./scripts/update.sh >>"$LOG_FILE" 2>&1; then
  FINAL="$(health_field version || true)"
  if [ "$FINAL" = "$NEW_VERSION" ]; then
    log "✓ $NEW_VERSION yayında"
    write_run "$STARTED" "$(now_iso)" "${CURRENT:-unknown}" "$NEW_VERSION" "success" "Güncellendi"
    write_state "$(now_iso)" "$FINAL" "$NEW_VERSION" "$RELEASED" "$NOTES" "$MANDATORY" ""
    exit 0
  fi
  # Betik başarı dedi ama çalışan sürüm beklenen değil: sessizce "başarılı"
  # yazmak, güncellenmediğini kimsenin fark etmediği kurulum demek.
  fail "update.sh başarılı döndü ama çalışan sürüm $FINAL"
fi

tail -n 20 "$LOG_FILE" >&2 || true
fail "update.sh düştü — ayrıntı $LOG_FILE içinde"
