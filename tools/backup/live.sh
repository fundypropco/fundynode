#!/usr/bin/env bash
# اتصال زنده به دیتابیس production از کامپیوتر توسعه (Git Bash ویندوز ؛ از live.bat صدا زده می‌شود). جزئیات: docs/deployment.md
#
#   live.bat mongo    تونل SSH + باز کردن MongoDB Compass روی Mongo سرور (دیدن و ویرایش)
#   live.bat redis    تونل SSH + Redis Commander محلی روی Redis سرور (دیدن ، ویرایش ، حذف کلید)
#   live.bat stop     بستن کامل اتصال اگر پنجره قبلی بدون Enter بسته شده باشد
#
# هر تغییری همان لحظه روی داده واقعی است. اتصال فقط تا وقتی پنجره باز است برقرار می‌ماند ؛ با Enter یا Ctrl+C کامل بسته می‌شود.
# روی سرور پورتی باز نمی‌شود و رمزها ذخیره نمی‌شوند: تونل مستقیم به کانتینر می‌رود و رمز هر بار از env کانتینر خوانده می‌شود.
source "$(dirname "$0")/common.sh"

LIVE_FILE=tools/backup/docker-compose.live.yml
MONGO_TUNNEL=27119
REDIS_TUNNEL=16380
REDIS_URL=http://127.0.0.1:8091

live() { docker compose -f "$LIVE_FILE" "$@"; }

# نشانی کانتینر روی شبکه داکر سرور
container_ip() {
  local ip
  ip=$(remote "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' $1" | awk '{print $1}')
  # کانتینر خاموش به‌جای نشانی متن «invalid» می‌دهد
  [[ "$ip" =~ ^[0-9.]+$ ]] || die "Container $1 is not running on the server."
  echo "$ip"
}

server_env() { remote "docker exec $1 printenv $2" | tr -d '\r'; }

# رمز داخل نشانی mongodb:// (نویسه‌های خاص با %XX)
url_encode() {
  local s=$1 i c out=
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case "$c" in
      [a-zA-Z0-9.~_-]) out+=$c ;;
      *) printf -v c '%%%02X' "'$c"; out+=$c ;;
    esac
  done
  echo "$out"
}

# $1 پورت محلی (فقط 127.0.0.1) ؛ $2 نشانی کانتینر ؛ $3 پورت کانتینر
start_tunnel() {
  # پورت گرفته‌شده را باید قبل از ssh دید ؛ وگرنه باز بودن پورت با تونل خودمان اشتباه می‌شود
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && die "Port $1 is already in use (another live window is open?). Close it, or run: live.bat stop"
  ssh -N "${SSH_OPTS[@]}" -o ExitOnForwardFailure=yes -L "127.0.0.1:$1:$2:$3" "$TARGET" </dev/null &
  TUNNEL_PID=$!
  local i
  for i in $(seq 1 60); do
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
    kill -0 "$TUNNEL_PID" 2>/dev/null || die "The SSH tunnel could not start (see messages above)."
    sleep 0.5
  done
  die "The SSH tunnel did not open."
}

# تونلی که بعد از بسته شدن ناگهانی پنجره مانده باشد (فقط اگر شنونده پورت ssh باشد)
kill_tunnel() {
  local pid
  pid=$(netstat -ano | tr -d '\r' | awk -v a="127.0.0.1:$1" '$2 == a && $3 == "0.0.0.0:0" {print $5; exit}')
  [[ -n "$pid" ]] || return 0
  if tasklist //FI "PID eq $pid" //NH | grep -qi '^ssh'; then
    taskkill //F //PID "$pid" >/dev/null && say "Closed a leftover tunnel on port $1"
  fi
}

close_all() {
  trap - EXIT INT TERM
  echo
  say "Closing the live connection..."
  [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
  live down -v --remove-orphans >/dev/null 2>&1 || true
  say "Closed."
}

prepare() {
  require_key
  require_docker
  live down -v --remove-orphans >/dev/null 2>&1 || true
  trap close_all EXIT
  trap 'exit 130' INT TERM
}

banner() {
  echo
  echo "    ***********************************************************"
  echo "    ***  LIVE PRODUCTION DATA: every change is real at once  ***"
  echo "    ***********************************************************"
  echo
  say "$1"
}

stay_open() {
  read -r -p "Press Enter here to close the live connection: " _ || true
}

cmd_mongo() {
  prepare
  local ip user password
  say "Connecting to MongoDB on $TARGET ..."
  ip=$(container_ip my-mongo)
  user=$(server_env my-mongo MONGO_INITDB_ROOT_USERNAME)
  password=$(server_env my-mongo MONGO_INITDB_ROOT_PASSWORD)
  [[ -n "$user" && -n "$password" ]] || die "Could not read the MongoDB credentials from the server."
  start_tunnel "$MONGO_TUNNEL" "$ip" 27017
  banner "MongoDB Compass connected to the live database (127.0.0.1:$MONGO_TUNNEL through the SSH tunnel)"
  open_compass "mongodb://$(url_encode "$user"):$(url_encode "$password")@127.0.0.1:$MONGO_TUNNEL/?authSource=admin&directConnection=true" \
    || warn "MongoDB Compass was not found. Install it, or connect another tool to 127.0.0.1:$MONGO_TUNNEL with the MONGO_INITDB_ROOT_* values (deploy.bat env)."
  stay_open
}

cmd_redis() {
  prepare
  local ip
  say "Connecting to Redis on $TARGET ..."
  ip=$(container_ip my-redis)
  start_tunnel "$REDIS_TUNNEL" "$ip" 6379
  live up -d --wait rediscommander || die "Redis Commander did not start."
  banner "Redis Commander connected to the live Redis: $REDIS_URL"
  open_url "$REDIS_URL"
  stay_open
}

cmd_stop() {
  require_docker
  kill_tunnel "$MONGO_TUNNEL"
  kill_tunnel "$REDIS_TUNNEL"
  live down -v --remove-orphans
  say "Live connection closed."
}

choice=${1:-}
if [[ -z "$choice" ]]; then
  read -r -p "Open live: [1] MongoDB  [2] Redis  (anything else cancels): " choice || true
  case "$choice" in
    1) choice=mongo ;;
    2) choice=redis ;;
    *) exit 0 ;;
  esac
fi
case "$choice" in
  mongo) cmd_mongo ;;
  redis) cmd_redis ;;
  stop) cmd_stop ;;
  *) die "usage: live.bat [mongo | redis | stop]" ;;
esac
