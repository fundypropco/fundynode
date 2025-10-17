#!/bin/bash
set -e

echo "🔄 شروع فرآیند بازگردانی (Restore)..."

BACKUP_DIR="./backups"

# بررسی وجود بکاپ‌ها
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ فولدر بکاپ پیدا نشد: $BACKUP_DIR"
  exit 1
fi

echo "📂 لیست بکاپ‌های موجود:"
ls -1 "$BACKUP_DIR"

# انتخاب فایل بکاپ MongoDB
read -p "نام فایل بکاپ MongoDB برای Restore انتخاب کن: " MONGO_BACKUP
if [ ! -f "$BACKUP_DIR/$MONGO_BACKUP" ]; then
  echo "❌ فایل MongoDB پیدا نشد!"
  exit 1
fi

# انتخاب فایل بکاپ Redis
read -p "نام فایل بکاپ Redis برای Restore انتخاب کن: " REDIS_BACKUP
if [ ! -f "$BACKUP_DIR/$REDIS_BACKUP" ]; then
  echo "❌ فایل Redis پیدا نشد!"
  exit 1
fi

# ─────────────────────────────
# 1️⃣ توقف کانتینرها
# ─────────────────────────────
echo "🛑 توقف کانتینرهای MongoDB و Redis..."
docker stop my-mongo my-redis

# ─────────────────────────────
# 2️⃣ Restore MongoDB
# ─────────────────────────────
echo "📦 بازگردانی MongoDB..."
cat "$BACKUP_DIR/$MONGO_BACKUP" | docker exec -i my-mongo mongorestore --archive --drop
echo "✅ MongoDB بازگردانی شد."

# ─────────────────────────────
# 3️⃣ Restore Redis
# ─────────────────────────────
echo "📦 بازگردانی Redis..."
docker cp "$BACKUP_DIR/$REDIS_BACKUP" my-redis:/data/dump.rdb
docker start my-redis
echo "✅ Redis بازگردانی شد."

# ─────────────────────────────
# 4️⃣ شروع اپ Node.js
# ─────────────────────────────
echo "🚀 شروع اپ Node.js..."
docker compose -f docker-compose.prod.yml up -d

echo "🎉 بازگردانی با موفقیت انجام شد!"
