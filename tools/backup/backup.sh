#!/usr/bin/env bash
# بک‌آپ FundyNode از کامپیوتر توسعه (Git Bash ویندوز ؛ از backup.bat صدا زده می‌شود). جزئیات: docs/deployment.md
#
#   backup.bat               بک‌آپ تازه از MongoDB سرور در backups/fundynode_mongo_<تاریخ>_<ساعت-دقیقه-ثانیه>.archive.gz
#   backup.bat redis         بک‌آپ تازه از Redis سرور در backups/fundynode_redis_<تاریخ>_<ساعت-دقیقه-ثانیه>.rdb
#   backup.bat list          فهرست بک‌آپ‌ها ، جدیدترین اول
#   backup.bat view [x]      بالا آوردن یک بک‌آپ در Compass یا Redis Commander محلی (x = شماره فهرست یا نام فایل ؛ بدون x پرسیده می‌شود)
#   backup.bat stop          خاموش کردن و پاک کردن کامل نمایشگرها و دیتابیس موقت آنها
#
# روی سرور چیزی عوض نمی‌شود: خروجی مستقیم از SSH به این کامپیوتر می‌آید (Redis با یک فایل موقت داخل کانتینر که پاک می‌شود).
# اسکریپت سرور (fundy-server.sh) هم لازم نیست ⇒ بدون دپلوی و از هر برنچی کار می‌کند.
source "$(dirname "$0")/common.sh"

BACKUP_DIR=backups
MONGO_PREFIX=fundynode_mongo
REDIS_PREFIX=fundynode_redis
VIEWER_FILE=tools/backup/docker-compose.viewer.yml
VIEWER_DB=fundynode-backup-mongo
VIEWER_REDIS=fundynode-backup-redis
VIEWER_URI='mongodb://127.0.0.1:27118/?directConnection=true'
VIEWER_REDIS_URL=http://127.0.0.1:8092

viewer() { docker compose -f "$VIEWER_FILE" "$@"; }

timestamp() { date +%Y-%m-%d_%H-%M-%S; }

# بک‌آپ‌ها با تاریخ ، فارغ از نوع ، جدیدترین اول (شماره‌ها در list و view همین ترتیب‌اند)
list_files() {
  ls -1 "$BACKUP_DIR" 2>/dev/null | grep -E "^($MONGO_PREFIX.*\.archive\.gz|$REDIS_PREFIX.*\.rdb)\$" \
    | awk -F_ '{print $3 "_" $4, $0}' | sort -r | cut -d' ' -f2 || true
}

# اسکریپت stdin روی سرور اجرا و خروجی‌اش در فایل موقت ذخیره می‌شود ؛ تا finish آن را نام نهایی ندهد «بک‌آپ» حساب نیست
fetch() {
  require_key
  mkdir -p "$BACKUP_DIR"
  OUT=$1
  PARTIAL="$OUT.partial"
  # trap بعد از پایان تابع اجرا می‌شود ⇒ متغیر سراسری PARTIAL (نه local)
  trap 'rm -f "${PARTIAL:-}"' EXIT
  ssh "${SSH_OPTS[@]}" "$TARGET" 'bash -s' > "$PARTIAL" || die "Backup FAILED (see messages above); no file was kept."
}

finish() {
  mv "$PARTIAL" "$OUT"
  say "Backup saved: $OUT ($(du -h "$OUT" | cut -f1))"
}

cmd_mongo() {
  local out="$BACKUP_DIR/${MONGO_PREFIX}_$(timestamp).archive.gz"
  say "Dumping MongoDB from $TARGET into $out ..."
  # فقط دیتابیس برنامه (MONGO_INITDB_DATABASE) ، نه کاربران admin ؛ اعتبارنامه از env خود کانتینر
  fetch "$out" <<'REMOTE'
set -euo pipefail
docker exec my-mongo sh -c ': "${MONGO_INITDB_DATABASE:?}"; exec mongodump --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --db "$MONGO_INITDB_DATABASE" --archive --gzip'
REMOTE
  # gzip -t فایل ناقص یا خراب را می‌گیرد ؛ ابتدای آرشیو mongodump همیشه این چهار بایت است
  gzip -t "$PARTIAL" 2>/dev/null || die "The backup is incomplete or corrupted; no file was kept."
  [[ "$(gzip -dc "$PARTIAL" 2>/dev/null | head -c 4 | od -An -tx1 | tr -d ' ')" == 6de29981 ]] \
    || die "The file is not a mongodump archive; no file was kept."
  finish
}

cmd_redis() {
  local out="$BACKUP_DIR/${REDIS_PREFIX}_$(timestamp).rdb"
  say "Dumping Redis from $TARGET into $out ..."
  # redis-cli --rdb مثل یک replica عکس کامل می‌گیرد (BGSAVE پشت صحنه ، سرور نمی‌ایستد)
  # فایل موقت داخل کانتینر و همان‌جا پاک می‌شود: «--rdb -» نشانگر ۴۰ بایتی EOF را هم در خروجی جا می‌گذارد
  fetch "$out" <<'REMOTE'
set -euo pipefail
docker exec my-redis sh -c 'f=/tmp/fundy-backup.rdb; trap "rm -f $f" EXIT
  out=$(redis-cli --rdb "$f" 2>&1) || { echo "$out" >&2; exit 1; }
  cat "$f"'
REMOTE
  # فایل RDB با امضای REDIS شروع و با بایت ff + هشت بایت checksum تمام می‌شود
  [[ "$(head -c 5 "$PARTIAL")" == REDIS && "$(tail -c 9 "$PARTIAL" | head -c 1 | od -An -tx1 | tr -d ' ')" == ff ]] \
    || die "The Redis dump is incomplete or corrupted; no file was kept."
  finish
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

view_mongo() {
  local file=$1
  say "Starting a fresh viewer database..."
  viewer rm -sfv mongo >/dev/null 2>&1 || true
  viewer up -d --wait mongo || die "The viewer database did not start (docker logs $VIEWER_DB)."

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
  open_compass "$VIEWER_URI" || say "MongoDB Compass was not found; connect to it yourself with the address above."
}

view_redis() {
  local file=$1
  say "Starting a fresh viewer Redis with $file ..."
  viewer rm -sfv redis rediscommander >/dev/null 2>&1 || true
  viewer create redis >/dev/null 2>&1 || die "The viewer Redis could not be created."
  # Redis فایل dump.rdb را هنگام شروع می‌خواند
  MSYS_NO_PATHCONV=1 docker cp "$BACKUP_DIR/$file" "$VIEWER_REDIS:/data/dump.rdb" >/dev/null 2>&1 \
    || die "Copying the backup into the viewer failed."
  viewer up -d --wait redis rediscommander || die "The viewer Redis did not start (docker logs $VIEWER_REDIS)."
  docker exec "$VIEWER_REDIS" redis-cli info keyspace | tr -d '\r' | grep '^db' | sed 's/^/    /'
  say "Viewing $file in Redis Commander: $VIEWER_REDIS_URL"
  say "Close it with: backup.bat stop (this deletes only the temporary copy; the backup file stays)"
  open_url "$VIEWER_REDIS_URL"
}

cmd_view() {
  local file
  file=$(pick_file "${1:-}")
  require_docker
  case "$file" in
    *.rdb) view_redis "$file" ;;
    *) view_mongo "$file" ;;
  esac
}

cmd_stop() {
  require_docker
  viewer down -v --remove-orphans
  say "Viewers stopped and their temporary databases removed. Backup files are untouched."
}

case "${1:-new}" in
  new|mongo) cmd_mongo ;;
  redis) cmd_redis ;;
  list) cmd_list ;;
  view) cmd_view "${2:-}" ;;
  stop) cmd_stop ;;
  *) die "usage: backup.bat [mongo | redis | list | view [number or file name] | stop]" ;;
esac
