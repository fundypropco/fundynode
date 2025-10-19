#!/bin/bash

# -----------------------------
# تنظیمات
# -----------------------------
CONTAINER_NAME="my_mongo"      # نام کانتینر MongoDB
BACKUP_DIR="/home/mongo_backups"  # مسیر ذخیره بک‌آپ روی سرور
DATE=$(date +%F)                         # تاریخ امروز
BACKUP_PATH="$BACKUP_DIR/$DATE"
MONGO_USER="MONGO_USER"               # اگر نیاز به یوزر و پسورد دارید
MONGO_PASS="MONGO_PASS"

# -----------------------------
# ساخت پوشه بک‌آپ
# -----------------------------
mkdir -p "$BACKUP_PATH"

# -----------------------------
# اجرای mongodump داخل کانتینر و فشرده‌سازی
# -----------------------------
docker exec "$CONTAINER_NAME" mongodump \
    --username "$MONGO_USER" \
    --password "$MONGO_PASS" \
    --authenticationDatabase admin \
    --gzip \
    --archive="/backup/mongo_$DATE.gz"

# -----------------------------
# کپی بک‌آپ از کانتینر به سرور
# -----------------------------
docker cp "$CONTAINER_NAME:/backup/mongo_$DATE.gz" "$BACKUP_PATH/mongo_$DATE.gz"

# -----------------------------
# پاک کردن فایل موقت داخل کانتینر
# -----------------------------
docker exec "$CONTAINER_NAME" rm "/backup/mongo_$DATE.gz"

# -----------------------------
# اطلاع از پایان بک‌آپ
# -----------------------------
echo "MongoDB backup for $DATE completed: $BACKUP_PATH/mongo_$DATE.gz"
