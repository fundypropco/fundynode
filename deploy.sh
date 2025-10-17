#!/bin/bash
set -e

echo "🚀 شروع فرآیند استقرار (Deploy)..."

# ─────────────────────────────
# مسیر پروژه و فولدر بکاپ
# ─────────────────────────────
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
MAX_BACKUPS=7

mkdir -p "$BACKUP_DIR"

# ─────────────────────────────
# 1️⃣ گرفتن بکاپ خودکار قبل از deploy
# ─────────────────────────────
echo "💾 گرفتن بکاپ خودکار از MongoDB و Redis قبل از deploy..."

# MongoDB Backup
docker exec my-mongo sh -c 'mongodump --archive' > "$BACKUP_DIR/mongo_backup_$TIMESTAMP.archive"

# Redis Backup
docker exec my-redis sh -c 'redis-cli save'
docker cp my-redis:/data/dump.rdb "$BACKUP_DIR/redis_backup_$TIMESTAMP.rdb"

echo "✅ بکاپ‌ها ذخیره شدند در: $BACKUP_DIR"

# ─────────────────────────────
# 1.۱ حذف بکاپ‌های قدیمی اگر بیشتر از MAX_BACKUPS باشه
# ─────────────────────────────
echo "🗑️ بررسی تعداد بکاپ‌ها و حذف قدیمی‌ها..."
for type in mongo redis; do
  files=($(ls -1t $BACKUP_DIR/${type}_backup_*))
  count=${#files[@]}
  if [ $count -gt $MAX_BACKUPS ]; then
    for f in "${files[@]:$MAX_BACKUPS}"; do
      echo "❌ حذف فایل قدیمی: $f"
      rm -f "$f"
    done
  fi
done

# ─────────────────────────────
# 2️⃣ ساخت ایمیج‌ها و بالا آوردن سرویس‌ها
# ─────────────────────────────
echo "📦 در حال build و اجرای docker compose..."
docker compose -f docker-compose.prod.yml up -d --build

# ─────────────────────────────
# 3️⃣ بررسی وضعیت کانتینرها
# ─────────────────────────────
echo "🔍 بررسی وضعیت سرویس‌ها..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# ─────────────────────────────
# 4️⃣ بررسی سلامت سرویس Node.js
# ─────────────────────────────
echo "🩺 در حال بررسی سلامت سرویس Node.js..."
for i in {1..10}; do
  health=$(docker inspect --format='{{json .State.Health.Status}}' fundy-node-prod || echo '"starting"')
  if [[ "$health" == "\"healthy\"" ]]; then
    echo "✅ سرویس Node.js سالم است!"
    break
  fi
  echo "⏳ در انتظار سالم شدن اپ... (تلاش $i/10)"
  sleep 5
done

# ─────────────────────────────
# 5️⃣ پیکربندی Logrotate
# ─────────────────────────────
LOGROTATE_FILE="/etc/logrotate.d/fundy-node"

if [ ! -f "$LOGROTATE_FILE" ]; then
  echo "🧾 ایجاد فایل logrotate..."
  sudo tee "$LOGROTATE_FILE" > /dev/null <<EOF
/home/ubuntu/fundy/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        docker exec fundy-node-prod pm2 flush > /dev/null 2>&1 || true
    endscript
}
EOF
  echo "✅ فایل logrotate ساخته شد."
else
  echo "ℹ️ فایل logrotate از قبل وجود دارد، رد شد."
fi

# ─────────────────────────────
# 6️⃣ تست نهایی از health endpoint
# ─────────────────────────────
echo "🌐 تست نهایی سرویس در پورت 5001 ..."
sleep 3
curl -fsS http://localhost:5001/health && echo "✅ اپلیکیشن آماده است!" || echo "⚠️ هنوز پاسخ نداده است!"

echo "🎉 استقرار با موفقیت انجام شد!"


#sudo apt update
#sudo apt install logrotate -y

#chmod +x deploy.sh

#sudo nano /etc/logrotate.d/fundy-node
# چیزی که داخل فایل بالا باید بنویسیم فقط مسیر پروژه خودمون رو میدیم
#/home/ubuntu/fundy/logs/*.log {
#    daily                   # هر روز rotate بشه
#    missingok               # اگه فایل وجود نداشت خطا نده
#    rotate 14               # ۱۴ نسخه قدیمی نگه داره (یعنی ۲ هفته)
#    compress                # فایل‌های قدیمی gzip بشن
#    delaycompress           # فشرده‌سازی از روز دوم شروع بشه
#    notifempty              # اگه فایل خالی بود، کاری نکن
#    create 0640 ubuntu ubuntu  # فایل جدید با owner و permission خاص ساخته بشه
#    sharedscripts           # برای همه فایل‌ها یه بار اسکریپت اجرا بشه
#    postrotate
#        # بعد از rotate شدن لاگ‌ها، به PM2 بگو فایل‌های جدید باز کنه
#        docker exec fundy-node-prod pm2 flush > /dev/null 2>&1 || true
#    endscript
#}

# تست عملکرد
#sudo logrotate -f /etc/logrotate.d/fundy-node
# چیزی که مثلا باید ببینیم
#app.log
#app.log.1.gz
#error.log
#error.log.1.gz


