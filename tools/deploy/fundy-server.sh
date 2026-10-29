#!/usr/bin/env bash
# اسکریپت سمت سرور دپلوی FundyNode (کنار docker-compose.prod.yml در پوشه پروژه روی سرور).
# deploy.bat (tools/deploy/deploy.sh) این فایل را در هر دپلوی به سرور می‌فرستد و از راه SSH صدا می‌زند ؛ دستی هم قابل اجراست.
# جزئیات: docs/deployment.md
#
#   fundy-server.sh check               پیش‌نیازهای سرور
#   fundy-server.sh deploy <tag> <port> گرفتن ایمیج از رجیستری کامپیوتر توسعه از راه تونل معکوس SSH (127.0.0.1:<port>) ،
#                                       بکاپ Mongo / Redis ، اجرا ، بررسی سلامت و برگشت خودکار به نسخه قبلی اگر سالم بالا نیامد
#   fundy-server.sh versions            نسخه‌های نگه‌داشته‌شده روی سرور
#   fundy-server.sh rollback [tag]      برگشت به نسخه قبل از نسخه فعلی (یا نسخه داده‌شده) ؛ داده Mongo / Redis برنمی‌گردد
#   fundy-server.sh status              نسخه فعلی و وضعیت کانتینرها
#
# پیام‌ها انگلیسی‌اند چون در ترمینال ویندوز (cmd) نمایش داده می‌شوند و متن فارسی آنجا به‌هم‌ریخته دیده می‌شود.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO=fundynode
LIVE="$REPO:live"
# تگ هر نسخه: YYYYMMDD-HHMMSS-<commit>[-dirty] ؛ نسخه‌ای که قبل از این روش روی سرور بود: 00000000-000000-legacy
TAG_RE='^[0-9]{8}-[0-9]{6}-[0-9a-z]+(-dirty)?$'
LEGACY_TAG=00000000-000000-legacy
KEEP=${FUNDY_KEEP_VERSIONS:-5}
HEALTH_TIMEOUT=${FUNDY_HEALTH_TIMEOUT:-180}
APP_CONTAINER=fundynode
OTHER_CONTAINERS=(fundyworker nginx my-mongo my-redis)
MONGO_CONTAINER=my-mongo
REDIS_CONTAINER=my-redis
BACKUP_DIR="$APP_DIR/backups"
MAX_BACKUPS=${FUNDY_MAX_BACKUPS:-7}
STATE="$APP_DIR/.deploy"

cd "$APP_DIR"
mkdir -p "$STATE"

# متغیرهای کامپوز از .env همین پوشه خوانده می‌شوند (رفتار پیش‌فرض docker compose)
compose() { docker compose -f docker-compose.prod.yml "$@"; }
say() { echo ">>> $*"; }
warn() { echo "!!! $*"; }
die() { echo "!!! $*" >&2; exit 1; }

# جلوی دو دپلوی / برگشت هم‌زمان را می‌گیرد
lock() {
  exec 9>"$STATE/lock"
  flock -n 9 || die "Another deploy or rollback is running on the server."
}

valid_tag() { [[ "$1" =~ $TAG_RE ]]; }
current_tag() { cat "$STATE/current" 2>/dev/null || true; }
# وضعیت کانتینر (برای کانتینر ناموجود: missing ؛ docker inspect آنجا یک خط خالی هم چاپ می‌کند)
cstate() {
  local s
  s=$(docker inspect -f "$2" "$1" 2>/dev/null) || s=missing
  echo "${s:-missing}"
}
image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }
label() { docker image inspect -f "{{index .Config.Labels \"$2\"}}" "$1" 2>/dev/null | sed 's/<no value>//'; }
log_event() { echo "$(date '+%Y-%m-%d %H:%M:%S')|$1|$2" >> "$STATE/history"; }

# همه نسخه‌های موجود روی سرور ، جدیدترین اول (تگ با تاریخ شروع می‌شود پس مرتب‌سازی متنی همان ترتیب زمانی است)
list_tags() { docker images "$REPO" --format '{{.Tag}}' | grep -E "$TAG_RE" | sort -ru || true; }

# ایمیجی که پیش از دپلوی با این اسکریپت اجرا می‌شد (بیلد روی خود سرور) یک بار با تگ legacy نگه داشته می‌شود تا برگشت به آن ممکن باشد
adopt_legacy() {
  [[ -n "$(current_tag)" ]] && return 0
  local img
  img=$(docker inspect -f '{{.Image}}' "$APP_CONTAINER" 2>/dev/null || true)
  [[ -z "$img" ]] && return 0
  docker tag "$img" "$REPO:$LEGACY_TAG"
  echo "$LEGACY_TAG" > "$STATE/current"
  log_event adopt "$LEGACY_TAG"
  say "Kept the image that was running before as version $LEGACY_TAG"
}

# کانتینرهای فعلی باید از همین پروژه کامپوز باشند ؛ وگرنه نام volume ها (Mongo!) فرق می‌کند و up یک دیتابیس خالی می‌سازد
check_project() {
  local running want
  running=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$APP_CONTAINER" 2>/dev/null || true)
  [[ -z "$running" ]] && return 0
  want=$(compose config 2>/dev/null | awk '/^name:/ {print $2; exit}')
  [[ "$running" == "$want" ]] \
    || die "Running containers belong to compose project '$running' but $APP_DIR is project '$want' (volumes, i.e. the database, would differ). Aborting."
}

# بکاپ Mongo و Redis پیش از عوض کردن نسخه (همان کار deploy.sh قدیمی) ؛ MAX_BACKUPS نسخه آخر نگه داشته می‌شود
backup_data() {
  local ts t files
  ts=$(date +"%Y-%m-%d_%H-%M-%S")
  mkdir -p "$BACKUP_DIR"
  if [[ "$(cstate "$MONGO_CONTAINER" '{{.State.Status}}')" == running ]]; then
    # اعتبارنامه از متغیرهای خود کانتینر mongo (MONGO_INITDB_ROOT_*)
    docker exec "$MONGO_CONTAINER" sh -c 'mongodump --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' \
      > "$BACKUP_DIR/mongo_backup_$ts.archive.gz" || { rm -f "$BACKUP_DIR/mongo_backup_$ts.archive.gz"; die "MongoDB backup failed; deploy stopped before changing anything."; }
  else
    warn "$MONGO_CONTAINER is not running; MongoDB backup skipped"
  fi
  if [[ "$(cstate "$REDIS_CONTAINER" '{{.State.Status}}')" == running ]]; then
    docker exec "$REDIS_CONTAINER" redis-cli save >/dev/null \
      && docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$BACKUP_DIR/redis_backup_$ts.rdb" >/dev/null \
      || die "Redis backup failed; deploy stopped before changing anything."
  else
    warn "$REDIS_CONTAINER is not running; Redis backup skipped"
  fi
  for t in mongo redis; do
    files=$(ls -1t "$BACKUP_DIR"/${t}_backup_* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) || true)
    [[ -n "$files" ]] && echo "$files" | xargs rm -f
  done
  say "Backup: $BACKUP_DIR/*_$ts.* ($(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1) in backups)"
}

# وضعیت سلامت کانتینر اپ (healthcheck کامپوز روی /healthcheck) تا HEALTH_TIMEOUT ثانیه
wait_healthy() {
  local start st
  start=$(date +%s)
  sleep 5
  while :; do
    st=$(cstate "$APP_CONTAINER" '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')
    case "$st" in
      healthy) return 0 ;;
      unhealthy|exited|dead|missing) return 1 ;;
    esac
    # اپی که در شروع می‌افتد با restart: always پشت هم بالا و پایین می‌شود
    (( $(cstate "$APP_CONTAINER" '{{.RestartCount}}') >= 2 )) 2>/dev/null && return 1
    if (( $(date +%s) - start > HEALTH_TIMEOUT )); then return 1; fi
    sleep 5
  done
}

# fundynode:live را به نسخه داده‌شده می‌برد و کانتینرها را با آن بالا می‌آورد
switch_to() {
  local tag=$1
  docker tag "$REPO:$tag" "$LIVE"
  # خطای up کار را قطع نمی‌کند تا بررسی سلامت بعدی و برگشت خودکار اجرا شوند
  if ! compose up -d >"$STATE/compose.log" 2>&1; then
    cat "$STATE/compose.log"
    warn "docker compose up reported an error"
  fi
  local want got
  want=$(image_id "$LIVE")
  got=$(docker inspect -f '{{.Image}}' "$APP_CONTAINER" 2>/dev/null || true)
  if [[ "$want" != "$got" ]]; then
    # کامپوز معمولا با عوض شدن ایمیج خودش کانتینر را از نو می‌سازد ؛ این فقط احتیاط است
    compose up -d --force-recreate app worker >>"$STATE/compose.log" 2>&1 || cat "$STATE/compose.log"
  fi
  echo "$tag" > "$STATE/current"
}

# worker و بقیه کانتینرها هم باید روشن باشند
report_services() {
  local c st
  for c in "${OTHER_CONTAINERS[@]}"; do
    st=$(cstate "$c" '{{.State.Status}}')
    [[ "$st" == running ]] || warn "$c is $st"
  done
}

# فقط KEEP نسخه آخر نگه داشته می‌شود (نسخه فعلی هرگز پاک نمی‌شود)
prune_versions() {
  local cur t n=0
  cur=$(current_tag)
  for t in $(list_tags); do
    n=$((n + 1))
    if (( n > KEEP )) && [[ "$t" != "$cur" ]]; then
      docker rmi "$REPO:$t" >/dev/null 2>&1 || true
    fi
  done
  docker image prune -f >/dev/null 2>&1 || true
}

cmd_check() {
  local ok=1
  command -v docker >/dev/null || { warn "docker not found"; ok=0; }
  docker compose version >/dev/null 2>&1 || { warn "docker compose plugin not found"; ok=0; }
  command -v flock >/dev/null || { warn "flock not found (util-linux)"; ok=0; }
  [[ -f .env ]] || { warn "$APP_DIR/.env not found"; ok=0; }
  [[ -f docker-compose.prod.yml ]] || say "docker-compose.prod.yml is not here yet; the first deploy uploads it"
  if command -v sshd >/dev/null; then
    sshd -T 2>/dev/null | grep -iE '^allowtcpforwarding (yes|all|remote)' >/dev/null \
      || { warn "sshd AllowTcpForwarding is off: deploy needs a reverse SSH tunnel"; ok=0; }
  fi
  if docker info --format '{{.HTTPProxy}}{{.HTTPSProxy}}' 2>/dev/null | grep . >/dev/null; then
    warn "dockerd uses an HTTP proxy; make sure NO_PROXY contains 127.0.0.1"
  fi
  if [[ -f docker-compose.prod.yml ]]; then
    check_project
    say "compose project: $(compose config 2>/dev/null | awk '/^name:/ {print $2; exit}')"
  fi
  say "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null) / compose $(docker compose version --short 2>/dev/null)"
  say "disk: $(df -h /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4 " free of " $2}')"
  say "current version: $(current_tag || true)"
  (( ok )) && say "Server check passed" || die "Server check failed"
}

cmd_deploy() {
  local tag=${1:-} port=${2:-}
  valid_tag "$tag" || die "Invalid version tag: '$tag'"
  [[ "$port" =~ ^[0-9]+$ ]] || die "Invalid registry port: '$port'"
  lock
  check_project
  adopt_legacy

  local src="127.0.0.1:$port/$REPO:$tag" prev
  say "[server 1/4] Pulling $tag (only changed layers)..."
  docker pull -q "$src" >/dev/null || die "Pull failed: is the SSH reverse tunnel up?"
  docker tag "$src" "$REPO:$tag"
  docker rmi "$src" >/dev/null 2>&1 || true

  say "[server 2/4] Backing up MongoDB and Redis..."
  backup_data

  prev=$(current_tag)
  say "[server 3/4] Starting containers with $tag..."
  switch_to "$tag"

  say "[server 4/4] Waiting for the app to become healthy (up to ${HEALTH_TIMEOUT}s)..."
  if wait_healthy; then
    log_event deploy "$tag"
    report_services
    prune_versions
    say "Version $tag is live"
    return 0
  fi

  warn "Version $tag did not become healthy. Last app logs:"
  docker logs --tail 40 "$APP_CONTAINER" 2>&1 || true
  log_event failed "$tag"
  if [[ -n "$prev" && "$prev" != "$tag" ]]; then
    warn "Rolling back automatically to $prev..."
    switch_to "$prev"
    if wait_healthy; then
      log_event auto-rollback "$prev"
      report_services
      warn "Rolled back to $prev; the node is running the previous version"
    else
      warn "Previous version $prev is not healthy either! Check the server: docker logs $APP_CONTAINER"
    fi
  fi
  exit 1
}

cmd_versions() {
  local cur t mark
  cur=$(current_tag)
  printf '   %-30s %-17s %s\n' VERSION BUILT COMMIT
  for t in $(list_tags); do
    mark="  "; [[ "$t" == "$cur" ]] && mark="* "
    printf ' %s%-30s %-17s %s\n' "$mark" "$t" "$(label "$REPO:$t" fundy.built)" "$(label "$REPO:$t" fundy.subject)"
  done
  echo "(* = live)"
}

cmd_rollback() {
  local target=${1:-} cur
  lock
  cur=$(current_tag)
  [[ -n "$cur" ]] || die "No deployed version recorded yet."
  if [[ -z "$target" ]]; then
    # نسخه قبل از نسخه فعلی (یکی قدیمی‌تر)
    target=$(list_tags | awk -v c="$cur" 'found {print; exit} $0 == c {found = 1}')
    [[ -n "$target" ]] || die "There is no older version than $cur on the server."
  fi
  valid_tag "$target" || die "Invalid version tag: '$target'"
  [[ -n "$(image_id "$REPO:$target")" ]] || die "Version $target is not on the server (see: versions)."
  [[ "$target" != "$cur" ]] || die "$target is already live."

  say "Rolling back $cur -> $target (MongoDB / Redis data is not rolled back)..."
  switch_to "$target"
  if wait_healthy; then
    log_event rollback "$target"
    report_services
    say "Version $target is live"
  else
    warn "Version $target did not become healthy. Last app logs:"
    docker logs --tail 40 "$APP_CONTAINER" 2>&1 || true
    warn "Switching back to $cur..."
    switch_to "$cur"
    wait_healthy && warn "Back on $cur" || warn "$cur is not healthy either! Check the server."
    exit 1
  fi
}

cmd_status() {
  say "live version: $(current_tag)"
  compose ps --format 'table {{.Name}}\t{{.State}}\t{{.Status}}'
  echo
  say "last events:"
  tail -n 5 "$STATE/history" 2>/dev/null | sed 's/^/    /' || true
}

case "${1:-}" in
  check) cmd_check ;;
  deploy) shift; cmd_deploy "$@" ;;
  versions) cmd_versions ;;
  rollback) shift; cmd_rollback "$@" ;;
  status) cmd_status ;;
  *) die "usage: $0 check | deploy <tag> <port> | versions | rollback [tag] | status" ;;
esac
