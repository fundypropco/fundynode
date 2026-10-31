#!/usr/bin/env bash
# بک‌آپ دیتابیس FundyNode از کامپیوتر توسعه (Git Bash ویندوز ؛ از backup.bat صدا زده می‌شود). جزئیات: docs/deployment.md
#
#   backup.bat               بک‌آپ تازه از MongoDB سرور در backups/fundynode_mongo_<تاریخ>_<ساعت-دقیقه-ثانیه>.archive.gz
#   backup.bat list          فهرست بک‌آپ‌ها ، جدیدترین اول
#   backup.bat view [x]      بالا آوردن یک بک‌آپ و باز کردن MongoDB Compass (x = شماره فهرست یا نام فایل ؛ بدون x پرسیده می‌شود)
#   backup.bat stop          خاموش کردن و پاک کردن کامل دیتابیس موقت
#
# روی سرور هیچ فایلی نوشته یا عوض نمی‌شود: خروجی mongodump مستقیم از SSH به این کامپیوتر می‌آید.
# اسکریپت سرور (fundy-server.sh) هم لازم نیست ⇒ بدون دپلوی و از هر برنچی کار می‌کند.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=../deploy/deploy.conf
# CR حذف می‌شود تا فایلی که با پایان خط ویندوزی ذخیره شده هم درست خوانده شود
source <(tr -d '\r' < "${FUNDY_DEPLOY_CONF:-tools/deploy/deploy.conf}")

BACKUP_DIR=backups
PREFIX=fundynode_mongo
EXT=.archive.gz
TARGET="$DEPLOY_USER@$DEPLOY_HOST"
VIEWER_FILE=tools/backup/docker-compose.viewer.yml
VIEWER_DB=fundynode-backup-mongo
VIEWER_URI='mongodb://127.0.0.1:27118/?directConnection=true'

# پیام‌ها انگلیسی‌اند: ترمینال ویندوز متن فارسی را به‌هم‌ریخته نشان می‌دهد
say() { echo ">>> $*"; }
die() { echo; echo "!!! $*" >&2; exit 1; }

# همان اتصال deploy.sh: کلید اختصاصی و بدون خواندن ~/.ssh/config
SSH_OPTS=(-F none -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15
  -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o StrictHostKeyChecking=accept-new -p "$DEPLOY_SSH_PORT")

viewer() { docker compose -f "$VIEWER_FILE" "$@"; }

require_docker() {
  docker info >/dev/null 2>&1 || die "Docker Desktop is not running. Start it and try again."
}

# بک‌آپ‌ها ، جدیدترین اول (تاریخ در نام فایل است پس مرتب‌سازی متنی همان ترتیب زمانی است)
list_files() {
  ls -1 "$BACKUP_DIR" 2>/dev/null | grep -E "^$PREFIX.*\\$EXT\$" | sort -r || true
}

cmd_new() {
  [[ -f "$DEPLOY_KEY" ]] || die "Deploy SSH key not found. Run once: deploy.bat setup"
  mkdir -p "$BACKUP_DIR"
  local name out
  name="${PREFIX}_$(date +%Y-%m-%d_%H-%M-%S)$EXT"
  out="$BACKUP_DIR/$name"
  PARTIAL="$out.partial"
  # trap بعد از پایان تابع اجرا می‌شود ⇒ متغیر سراسری PARTIAL (نه local)
  trap 'rm -f "${PARTIAL:-}"' EXIT

  say "Dumping MongoDB from $TARGET into $out ..."
  # فقط دیتابیس برنامه (MONGO_INITDB_DATABASE) ، نه کاربران admin ؛ اعتبارنامه از env خود کانتینر
  ssh "${SSH_OPTS[@]}" "$TARGET" 'bash -s' > "$PARTIAL" <<'REMOTE' || die "Backup FAILED (see messages above); no file was kept."
set -euo pipefail
docker exec my-mongo sh -c ': "${MONGO_INITDB_DATABASE:?}"; exec mongodump --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --db "$MONGO_INITDB_DATABASE" --archive --gzip'
REMOTE

  # gzip -t فایل ناقص یا خراب را می‌گیرد ؛ ابتدای آرشیو mongodump همیشه این چهار بایت است
  gzip -t "$PARTIAL" 2>/dev/null || die "The backup is incomplete or corrupted; no file was kept."
  [[ "$(gzip -dc "$PARTIAL" 2>/dev/null | head -c 4 | od -An -tx1 | tr -d ' ')" == 6de29981 ]] \
    || die "The file is not a mongodump archive; no file was kept."
  mv "$PARTIAL" "$out"
  say "Backup saved: $out ($(du -h "$out" | cut -f1))"
}

cmd_list() {
  local f n=0
  for f in $(list_files); do
    n=$((n + 1))
    printf ' %3d  %-50s %s\n' "$n" "$f" "$(du -h "$BACKUP_DIR/$f" | cut -f1)"
  done
  (( n > 0 )) || say "No backups yet. Take one with: backup.bat"
}

# $1 = شماره فهرست یا نام فایل ؛ خالی ⇒ فهرست نشان داده و پرسیده می‌شود (Enter = جدیدترین)
pick_file() {
  local choice=${1:-} files
  files=$(list_files)
  [[ -n "$files" ]] || die "No backups yet. Take one with: backup.bat"
  if [[ -z "$choice" ]]; then
    cmd_list >&2
    read -r -p "Backup number to open [1 = newest]: " choice || true
    choice=${choice:-1}
  fi
  if [[ "$choice" =~ ^[0-9]+$ ]]; then
    choice=$(echo "$files" | sed -n "${choice}p")
    [[ -n "$choice" ]] || die "There is no backup with that number (see: backup.bat list)."
  fi
  choice=$(basename "$choice")
  [[ -f "$BACKUP_DIR/$choice" ]] || die "Backup not found: $choice (see: backup.bat list)."
  echo "$choice"
}

# Compass نصب‌شده با نشانی همین دیتابیس ؛ نصب نبود ⇒ کاربر نشانی را دستی می‌دهد
open_compass() {
  local exe
  for exe in "${LOCALAPPDATA:-}/MongoDBCompass/MongoDBCompass.exe" "${ProgramFiles:-}/MongoDB Compass/MongoDBCompass.exe"; do
    if [[ -f "$exe" ]]; then
      MSYS_NO_PATHCONV=1 "$exe" "$VIEWER_URI" >/dev/null 2>&1 &
      return 0
    fi
  done
  say "MongoDB Compass was not found; connect to it yourself with the address above."
}

cmd_view() {
  local file
  file=$(pick_file "${1:-}")
  require_docker

  say "Starting a fresh viewer database..."
  viewer down -v --remove-orphans >/dev/null 2>&1 || true
  viewer up -d --wait || die "The viewer database did not start (docker logs $VIEWER_DB)."

  say "Loading $file ..."
  docker exec -i "$VIEWER_DB" mongorestore --quiet --archive --gzip --drop < "$BACKUP_DIR/$file" \
    || die "Loading the backup FAILED (see messages above)."

  docker exec "$VIEWER_DB" mongosh --quiet --eval '
    db.adminCommand({ listDatabases: 1 }).databases
      .filter(d => !["admin", "config", "local"].includes(d.name))
      .forEach(d => print("    database " + d.name + ": " + db.getSiblingDB(d.name).getCollectionNames().length + " collections"))'
  say "Viewing $file"
  say "MongoDB Compass address: $VIEWER_URI"
  say "Close it with: backup.bat stop (this deletes only the temporary copy; the backup file stays)"
  open_compass
}

cmd_stop() {
  require_docker
  viewer down -v --remove-orphans
  say "Viewer stopped and its temporary database removed. Backup files are untouched."
}

case "${1:-new}" in
  new) cmd_new ;;
  list) cmd_list ;;
  view) cmd_view "${2:-}" ;;
  stop) cmd_stop ;;
  *) die "usage: backup.bat [new | list | view [number or file name] | stop]" ;;
esac
