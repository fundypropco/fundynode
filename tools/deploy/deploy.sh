#!/usr/bin/env bash
# دپلوی FundyNode از کامپیوتر توسعه (Git Bash ویندوز ؛ از deploy.bat صدا زده می‌شود) — بدون ورود دستی به سرور ، بدون Docker Hub و npm روی سرور.
# همان روش FundyPanel (D:\fundyprop\tools\deploy) ؛ جزئیات و عیب‌یابی: docs/deployment.md
#
#   deploy.bat               بیلد + فرستادن لایه‌های تغییرکرده به سرور + بکاپ Mongo / Redis + اجرا و بررسی سلامت (برگشت خودکار اگر سالم بالا نیامد)
#   deploy.bat setup         یک بار: ساخت و نصب کلید SSH (رمز سرور یک بار پرسیده می‌شود) ، رجیستری محلی ، بررسی سرور
#   deploy.bat versions      نسخه‌های موجود روی سرور
#   deploy.bat rollback [v]  برگشت به نسخه قبلی (یا نسخه v)
#   deploy.bat status        نسخه فعلی و وضعیت کانتینرهای سرور
#   deploy.bat check         بررسی پیش‌نیازهای سرور
#
# مسیر داده: docker build (محلی) ⇒ push به رجیستری محلی 127.0.0.1:REGISTRY_PORT (کانتینر fundy-registry روی Docker Desktop)
#   ⇒ ssh -R همان پورت را روی 127.0.0.1 سرور باز می‌کند ⇒ docker سرور فقط لایه‌های تازه را از همان تونل pull می‌کند.
# اینترنت بین‌الملل فقط برای ساخت ایمیج‌های base / deps لازم است (اولین بار ، تغییر package-lock.json یا مرحله base در Dockerfile.prod).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# CR حذف می‌شود تا فایلی که با پایان خط ویندوزی ذخیره شده هم درست خوانده شود
source <(tr -d '\r' < "${FUNDY_DEPLOY_CONF:-tools/deploy/deploy.conf}")

DOCKERFILE=Dockerfile.prod
REGISTRY_NAME=fundy-registry
REGISTRY="127.0.0.1:$REGISTRY_PORT"
APP_REPO=fundynode
APP_CONTAINER=fundynode
# فایل‌های پیکربندی که compose روی سرور از پوشه پروژه می‌خواند و از ریپو به‌روز می‌شوند
SYNC_FILES=(docker-compose.prod.yml nginx.conf)
PLATFORM=linux/amd64
TARGET="$DEPLOY_USER@$DEPLOY_HOST"

# پیام‌ها انگلیسی‌اند: ترمینال ویندوز متن فارسی را به‌هم‌ریخته نشان می‌دهد
say() { echo ">>> $*"; }
warn() { echo "!!! $*"; }
die() { echo; echo "!!! $*" >&2; exit 1; }

# SSH با کلید اختصاصی دپلوی و بدون خواندن ~/.ssh/config
SSH_OPTS=(-F none -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15
  -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o StrictHostKeyChecking=accept-new -p "$DEPLOY_SSH_PORT")
# remote ورودی ترمینال را نمی‌خورد (-n) تا پاسخ y/N بعدی سالم برسد ؛ remote_in برای فرستادن فایل از stdin است
remote() { ssh -n "${SSH_OPTS[@]}" "$TARGET" "$@"; }
remote_in() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }
remote_server() { remote "bash '$DEPLOY_DIR/fundy-server.sh' $*"; }

confirm() {
  local ans
  read -r -p "$1 [y/N] " ans
  [[ "$ans" == y || "$ans" == Y || "$ans" == yes ]]
}

require_docker() {
  docker info >/dev/null 2>&1 || die "Docker Desktop is not running. Start it and try again."
}

# DEPLOY_DIR خالی ⇒ پوشه پروژه کامپوزی که کانتینر fundynode را ساخته
resolve_dir() {
  [[ -n "${DEPLOY_DIR:-}" ]] && return 0
  DEPLOY_DIR=$(remote "docker inspect -f '{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}' $APP_CONTAINER 2>/dev/null" | tr -d '\r' || true)
  [[ -n "$DEPLOY_DIR" ]] || die "Could not find the project folder on the server; set DEPLOY_DIR in tools/deploy/deploy.conf."
}

require_ssh() {
  [[ -f "$DEPLOY_KEY" ]] || die "Deploy SSH key not found. Run once: deploy.bat setup"
  remote true 2>/dev/null || die "Cannot log in to $TARGET:$DEPLOY_SSH_PORT with the deploy key. Is the server reachable? (first time: deploy.bat setup)"
  resolve_dir
}

# رجیستری محلی (registry:2 ، Apache-2.0) فقط روی 127.0.0.1 کامپیوتر توسعه
ensure_registry() {
  local st
  st=$(docker ps -a --filter "name=^${REGISTRY_NAME}\$" --format '{{.State}}')
  case "${st:-missing}" in
    running) return 0 ;;
    missing)
      docker image inspect registry:2 >/dev/null 2>&1 \
        || { say "Pulling registry:2 image (one time)..."; docker pull registry:2 >/dev/null || die "Could not pull registry:2 (needs Docker Hub or a mirror once)."; }
      docker run -d --name "$REGISTRY_NAME" --restart unless-stopped \
        -p "127.0.0.1:$REGISTRY_PORT:5000" -e REGISTRY_STORAGE_DELETE_ENABLED=true \
        -v fundy-registry:/var/lib/registry registry:2 >/dev/null
      ;;
    *) docker start "$REGISTRY_NAME" >/dev/null ;;
  esac
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf "http://$REGISTRY/v2/" >/dev/null && return 0
    sleep 1
  done
  die "Local registry on $REGISTRY did not start."
}

# متن یک مرحله Dockerfile (از «FROM ... AS <name>» تا FROM بعدی) برای هش ایمیج‌های base / deps
stage_text() { tr -d '\r' < "$DOCKERFILE" | awk -v s="$1" '/^FROM /{on = ($0 ~ (" AS " s "$"))} on'; }
hash12() { sha256sum | cut -c1-12; }

# ایمیج‌های base و deps محلی‌اند و فقط وقتی تعریفشان عوض شود دوباره ساخته می‌شوند (تنها جایی که اینترنت لازم است)
build_layers() {
  local base_hash deps_hash
  base_hash=$(stage_text base | hash12)
  BASE_IMAGE="fundynode-base:$base_hash"
  deps_hash=$({ echo "$base_hash"; stage_text deps; tr -d '\r' < package.json; tr -d '\r' < package-lock.json; } | hash12)
  DEPS_IMAGE="fundynode-deps:$deps_hash"

  if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    say "Base image changed: building $BASE_IMAGE (needs internet: node image, pm2)..."
    docker build --platform "$PLATFORM" --target base -t "$BASE_IMAGE" -f "$DOCKERFILE" . \
      || die "Base image build failed (internet access is needed for this step)."
  fi
  if ! docker image inspect "$DEPS_IMAGE" >/dev/null 2>&1; then
    say "package-lock.json changed: building $DEPS_IMAGE (needs internet: npm packages)..."
    docker build --platform "$PLATFORM" --target deps --build-arg BASE_IMAGE="$BASE_IMAGE" -t "$DEPS_IMAGE" -f "$DOCKERFILE" . \
      || die "Dependencies image build failed (internet access is needed for this step)."
  fi
}

# فایل‌های SYNC_FILES سرور از ریپو می‌آیند ؛ هر تفاوتی قبل از جایگزینی نشان داده و تائید گرفته می‌شود
sync_files() {
  local f current wanted changed=0
  for f in "${SYNC_FILES[@]}"; do
    current=$(remote "cat '$DEPLOY_DIR/$f' 2>/dev/null" | tr -d '\r' || true)
    wanted=$(tr -d '\r' < "$f")
    if [[ "$current" != "$wanted" ]]; then
      changed=1
      echo
      warn "$f on the server will change:"
      diff <(echo "$current") <(echo "$wanted") | sed 's/^/    /' || true
    fi
  done
  if (( changed )); then
    echo
    confirm "Apply these file changes on the server?" || die "Cancelled; nothing was changed on the server."
    for f in "${SYNC_FILES[@]}"; do
      # در جا نوشته می‌شود (نه mv): nginx.conf تک‌فایل bind mount است و فایل تازه با inode دیگر در کانتینر دیده نمی‌شد
      tr -d '\r' < "$f" | remote_in "cat > '$DEPLOY_DIR/$f.new' && cat '$DEPLOY_DIR/$f.new' > '$DEPLOY_DIR/$f' && rm -f '$DEPLOY_DIR/$f.new'"
    done
  fi
}

upload_server_script() {
  tr -d '\r' < tools/deploy/fundy-server.sh \
    | remote_in "cat > '$DEPLOY_DIR/fundy-server.sh.new' && chmod 755 '$DEPLOY_DIR/fundy-server.sh.new' && mv '$DEPLOY_DIR/fundy-server.sh.new' '$DEPLOY_DIR/fundy-server.sh'"
}

# نسخه‌های قدیمی در رجیستری و ایمیج‌های محلی پاک می‌شوند (نسخه‌های قابل برگشت روی سرورند)
cleanup_local() {
  local tags t digest n=0
  tags=$(curl -sf "http://$REGISTRY/v2/$APP_REPO/tags/list" | tr -d '\n ' | sed -n 's/.*"tags":\[\([^]]*\)\].*/\1/p' | tr -d '"' | tr ',' '\n' | sort -r)
  for t in $tags; do
    n=$((n + 1))
    (( n > LOCAL_KEEP )) || continue
    digest=$(curl -sfI -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json' \
      "http://$REGISTRY/v2/$APP_REPO/manifests/$t" | tr -d '\r' | awk -F': ' 'tolower($1) == "docker-content-digest" {print $2}')
    [[ -n "$digest" ]] && curl -sf -X DELETE "http://$REGISTRY/v2/$APP_REPO/manifests/$digest" >/dev/null || true
  done
  if (( n > LOCAL_KEEP )); then
    MSYS_NO_PATHCONV=1 docker exec "$REGISTRY_NAME" /bin/registry garbage-collect --delete-untagged /etc/docker/registry/config.yml >/dev/null 2>&1 || true
  fi
  n=0
  for t in $(docker images "$REGISTRY/$APP_REPO" --format '{{.Tag}}' | sort -r); do
    n=$((n + 1))
    (( n > LOCAL_KEEP )) && docker rmi "$REGISTRY/$APP_REPO:$t" >/dev/null 2>&1 || true
  done
  return 0
}

cmd_deploy() {
  require_docker
  require_ssh
  ensure_registry

  local sha subject branch tag built
  sha=$(git rev-parse --short=7 HEAD)
  # کوتاه کردن با خود git (حرف به حرف ؛ cut -c بایت می‌شمارد و حرف فارسی را نصف می‌کرد)
  subject=$(git log -1 --format='%<(60,trunc)%s' | sed 's/ *$//')
  branch=$(git rev-parse --abbrev-ref HEAD)
  tag="$(date +%Y%m%d-%H%M%S)-$sha"
  if [[ -n "$(git status --porcelain)" ]]; then
    tag="$tag-dirty"
    warn "There are uncommitted changes; they are deployed too (version $tag)."
  fi
  built=$(date '+%Y-%m-%d %H:%M')
  say "Deploying branch '$branch' as version $tag to $TARGET:$DEPLOY_DIR"

  say "[1/4] Building image..."
  build_layers
  docker build --platform "$PLATFORM" --target app --provenance=false --sbom=false \
    --build-arg DEPS_IMAGE="$DEPS_IMAGE" \
    --label "fundy.version=$tag" --label "fundy.commit=$sha" --label "fundy.branch=$branch" \
    --label "fundy.subject=$subject" --label "fundy.built=$built" \
    -t "$REGISTRY/$APP_REPO:$tag" -f "$DOCKERFILE" . || die "Build failed."

  say "[2/4] Storing image in the local registry..."
  docker push -q "$REGISTRY/$APP_REPO:$tag" >/dev/null || die "Push to the local registry failed."

  say "[3/4] Updating server files..."
  sync_files
  upload_server_script

  say "[4/4] Sending changed layers, backing up and starting the new version on the server..."
  # تونل معکوس فقط در طول همین فرمان باز است: پورت REGISTRY_PORT روی 127.0.0.1 سرور ⇒ رجیستری محلی
  ssh -n "${SSH_OPTS[@]}" -o ExitOnForwardFailure=yes -R "127.0.0.1:$REGISTRY_PORT:127.0.0.1:$REGISTRY_PORT" "$TARGET" \
    "bash '$DEPLOY_DIR/fundy-server.sh' deploy '$tag' '$REGISTRY_PORT'" || die "Deploy FAILED on the server (see messages above)."

  cleanup_local
  echo
  say "Deploy finished: $tag is live."
}

cmd_setup() {
  require_docker

  if [[ ! -f "$DEPLOY_KEY" ]]; then
    say "Creating deploy SSH key $DEPLOY_KEY ..."
    mkdir -p "$(dirname "$DEPLOY_KEY")"
    ssh-keygen -q -t ed25519 -N "" -C "fundy-deploy@$(hostname)" -f "$DEPLOY_KEY"
  fi

  if remote true 2>/dev/null; then
    say "Deploy key already works on the server."
  else
    say "Installing the deploy key on $TARGET (enter the server password ONCE when asked)..."
    ssh -F none -o StrictHostKeyChecking=accept-new -p "$DEPLOY_SSH_PORT" "$TARGET" \
      "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; grep -qxF '$(cat "$DEPLOY_KEY.pub")' ~/.ssh/authorized_keys || echo '$(cat "$DEPLOY_KEY.pub")' >> ~/.ssh/authorized_keys" \
      || die "Could not install the key."
    remote true || die "Key installed but key login still fails."
    say "Deploy key installed; no password is needed from now on."
  fi

  ensure_registry
  say "Local registry is running on $REGISTRY"

  resolve_dir
  say "Project folder on the server: $DEPLOY_DIR"
  remote "test -d '$DEPLOY_DIR'" || die "$DEPLOY_DIR does not exist on the server."
  upload_server_script
  remote_server check
  echo
  say "Setup done. Deploy with: deploy.bat"
}

case "${1:-deploy}" in
  deploy) cmd_deploy ;;
  setup) cmd_setup ;;
  versions|status|check) require_ssh; remote_server "$1" ;;
  rollback) shift; require_ssh; remote_server rollback "$@" || die "Rollback failed." ;;
  *) die "usage: deploy.bat [deploy | setup | versions | rollback [version] | status | check]" ;;
esac
