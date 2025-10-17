#!/bin/bash
set -e

echo "🔄 شروع فرآیند بازگردانی خودکار (Restore Auto)..."

BACKUP_DIR="./backups"

# بررسی وجود فولدر بکاپ
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ فولدر بکاپ پیدا نشد: $BACKUP_DIR"
  exit 1
fi

# پیدا کردن جدیدترین بکاپ MongoDB و Redis
LATEST_MONGO=$(ls -1t $BACKUP_DIR/mongo_backup_* 2>/dev/null | head -n 1)
LATEST_REDIS=$(ls -1t $BACKUP_DIR/redis_backup_* 2>/dev/null | head -n 1)

if [ -z "$LATEST_MONGO" ] || [ -z "$LATEST_REDIS" ]; then
  echo "❌ بکاپ مناسب برای MongoDB یا Redis پیدا نشد!"
  exit 1
fi

echo "📂 جدیدترین بکاپ MongoDB: $LATEST_MONGO"
echo "📂 جدیدترین بکاپ Redis: $LATEST_REDIS"

# ─────────────────────────────
# 1️⃣ توقف کانتینرها
# ─────────────────────────────
echo "🛑 توقف کانتینرهای MongoDB و Redis..."
docker stop my-mongo my-redis

# ─────────────────────────────
# 2️⃣ Restore MongoDB
# ─────────────────────────────
echo "📦 بازگردانی MongoDB..."
cat "$LATEST_MONGO" | docker exec -i my-mongo mongorestore --archive --drop
echo "✅ MongoDB بازگردانی شد."

# ─────────────────────────────
# 3️⃣ Restore Redis
# ─────────────────────────────
echo "📦 بازگردانی Redis..."
docker cp "$LATEST_REDIS" my-redis:/data/dump.rdb_
