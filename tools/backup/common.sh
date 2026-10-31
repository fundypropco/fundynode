# بخش مشترک backup.sh و live.sh (source می‌شود). جزئیات: docs/deployment.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=../deploy/deploy.conf
# CR حذف می‌شود تا فایلی که با پایان خط ویندوزی ذخیره شده هم درست خوانده شود
source <(tr -d '\r' < "${FUNDY_DEPLOY_CONF:-tools/deploy/deploy.conf}")

TARGET="$DEPLOY_USER@$DEPLOY_HOST"

# پیام‌ها انگلیسی‌اند: ترمینال ویندوز متن فارسی را به‌هم‌ریخته نشان می‌دهد
say() { echo ">>> $*"; }
warn() { echo "!!! $*"; }
die() { echo; echo "!!! $*" >&2; exit 1; }

# همان اتصال deploy.sh: کلید اختصاصی و بدون خواندن ~/.ssh/config
SSH_OPTS=(-F none -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15
  -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o StrictHostKeyChecking=accept-new -p "$DEPLOY_SSH_PORT")
remote() { ssh -n "${SSH_OPTS[@]}" "$TARGET" "$@"; }

require_docker() {
  docker info >/dev/null 2>&1 || die "Docker Desktop is not running. Start it and try again."
}

require_key() {
  [[ -f "$DEPLOY_KEY" ]] || die "Deploy SSH key not found. Run once: deploy.bat setup"
}

open_url() { cmd.exe //c start "" "$1" 2>/dev/null || true; }

# Compass نصب‌شده با نشانی داده‌شده ؛ نصب نبود ⇒ 1 برمی‌گرداند
open_compass() {
  local exe
  for exe in "${LOCALAPPDATA:-}/MongoDBCompass/MongoDBCompass.exe" "${ProgramFiles:-}/MongoDB Compass/MongoDBCompass.exe"; do
    if [[ -f "$exe" ]]; then
      MSYS_NO_PATHCONV=1 "$exe" "$1" >/dev/null 2>&1 &
      return 0
    fi
  done
  return 1
}
