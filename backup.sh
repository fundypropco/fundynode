#!/bin/bash

# -----------------------------
# تنظیمات
# -----------------------------
CONTAINER_NAME="my-mongo"     
BACKUP_DIR="/home/mongo_backups"  
DATE=$(date +'%F %T')      
BACKUP_PATH="$BACKUP_DIR/$DATE"


# -----------------------------
# ساخت پوشه بک‌آپ
# -----------------------------
mkdir -p "$BACKUP_PATH"


# -----------------------------
# env
# -----------------------------
if [ -f "$(dirname "$0")/.env" ]; then
  set -o allexport
  source "$(dirname "$0")/.env"
  set +o allexport
fi

# -----------------------------
# اجرای mongodump داخل کانتینر و فشرده‌سازی
# -----------------------------
docker exec "$CONTAINER_NAME" mongodump \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
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
