# دپلوی production

> از 2026-10-29 ، همان روش FundyPanel (`D:\fundyprop\docs\deployment.md`). دپلوی با **یک دستور روی ویندوز** انجام می‌شود ،
> بدون ورود دستی به سرور. روی سرور نه build می‌شود نه `npm install` ؛ برای تغییر کد (بدون پکیج تازه) نه کامپیوتر توسعه
> و نه سرور به اینترنت بین‌الملل نیاز ندارند و فقط دسترسی SSH به سرور لازم است.

## دستورها (از ریشه ریپو روی کامپیوتر توسعه)

| دستور | کار |
|---|---|
| `deploy.bat` | بیلد ، فرستادن لایه‌های تغییرکرده به سرور ، **بکاپ Mongo و Redis** ، اجرا ، بررسی سلامت ؛ اگر نسخه تازه سالم بالا نیاید **خودکار به نسخه قبلی برمی‌گردد** |
| `deploy.bat versions` | نسخه‌های نگه‌داشته‌شده روی سرور (۵ تای آخر + نسخه فعلی) با تاریخ و عنوان commit |
| `deploy.bat rollback` | برگشت به نسخه قبل از نسخه فعلی (اجرای دوباره ⇒ یکی قدیمی‌تر) ؛ `rollback <نسخه>` برای نسخه مشخص |
| `deploy.bat status` | نسخه فعلی ، وضعیت کانتینرها ، آخرین رویدادها |
| `deploy.bat check` | بررسی پیش‌نیازهای سرور |
| `deploy.bat setup` | **یک بار** (و روی هر کامپیوتر توسعه تازه): کلید SSH (همان کلید FundyPanel ، `~/.ssh/fundy_deploy_ed25519`) روی این سرور نصب می‌شود (رمز سرور فقط همین یک بار) ، رجیستری محلی ، بررسی سرور |

در cmd از ریشه ریپو کافی است `deploy` ؛ در PowerShell `.\deploy`. پیش‌نیاز: Docker Desktop روشن و Git for Windows.
تنظیمات در `tools/deploy/deploy.conf` (سرور `5.75.192.70` ، پورت SSH `22` ، کاربر). `DEPLOY_DIR` خالی ⇒ پوشه پروژه از برچسب
`com.docker.compose.project.working_dir` کانتینر در حال اجرای `fundynode` پیدا می‌شود.

## فایل env production (`deploy.bat env`)

| دستور | کار |
|---|---|
| `deploy.bat env` | ویرایش `.env` **سرور** در Notepad ؛ بعد از ذخیره ، نام کلیدهای اضافه / حذف / عوض‌شده (بدون مقدار) و تائید y/N ، نوشتن روی سرور و ساخت دوباره `app` و `worker` ؛ ناسالم (یا خطا پشت nginx) ⇒ فایل قبلی خودکار برمی‌گردد |
| `deploy.bat env undo` | برگشت به `.env` قبلی (پشتیبان آخر) |

- `.env` production فقط روی سرور است ؛ `.env` محلی (توسعه) روی production اثری ندارد و `deploy.bat` معمولی آن را نمی‌فرستد.
- **کلید تازه فقط وقتی به برنامه می‌رسد که در `docker-compose.prod.yml` زیر `environment:` سرویس `app` (و اگر لازم است `worker`) با
  `- NEW_KEY=${NEW_KEY}` آمده باشد** ؛ compose این پروژه متغیرها را تک‌تک می‌دهد (env_file ندارد). ترتیب: کلید با `deploy env` روی سرور ،
  خط compose در ریپو ، بعد `deploy` (compose را خودش می‌فرستد).
- فایل در پوشه موقت شخصی دانلود ، در Notepad (یا `FUNDY_EDITOR`) باز و بعد از Enter بررسی می‌شود: CR / BOM حذف ، هر خط `KEY=VALUE` یا توضیح ،
  کلید تکراری فقط هشدار (مقدار آخر). پوشه موقت در هر حالت پاک می‌شود.
- سرور (`fundy-server.sh env-apply`): قفل مشترک با دپلوی ⇒ پشتیبان در `.deploy/env-backups/` (۱۰ تای آخر ، دسترسی 600) ⇒ نوشتن در جا با
  دسترسی 600 ⇒ `docker compose config` ⇒ `up -d --no-deps --force-recreate app worker` ⇒ سلامت app و درخواست از داخل nginx ⇒ ناسالم ⇒ فایل قبلی.
- mongo / redis / nginx ری‌استارت نمی‌شوند. عوض کردن `MONGO_INITDB_ROOT_*` رمز واقعی Mongo را عوض نمی‌کند (فقط بار اول با volume خالی) ؛
  آزمون: رمز اشتباه ⇒ app سالم بالا نیامد ⇒ فایل قبلی برگشت.

## چطور کار می‌کند

```
کامپیوتر توسعه (Docker Desktop)                                   سرور (پوشه پروژه)
 docker build  ──► fundy-registry (127.0.0.1:5055) ◄── ssh -R 5055 ──  docker pull 127.0.0.1:5055/fundynode:<نسخه>
                                                                       بکاپ ⇒ docker tag … fundynode:live ⇒ compose up -d ⇒ /healthcheck سالم؟
```

- `Dockerfile.prod` سه مرحله دارد: `base` (node:22-slim + pm2) ، `deps` (`npm ci --omit=dev` از package-lock.json) ، `app` (کد).
  `tools/deploy/deploy.sh` مرحله‌های base / deps را فقط وقتی متنشان یا `package.json` / `package-lock.json` عوض شود به‌صورت
  ایمیج محلی `fundynode-base:<هش>` و `fundynode-deps:<هش>` می‌سازد (**تنها جای نیازمند اینترنت** ، فقط روی کامپیوتر توسعه)
  و app را روی آنها بیلد می‌کند (با `--network=none` آزمایش شد). لایه کد هر دپلوی حدود نیم مگابایت است.
- رجیستری محلی `fundy-registry` (registry:2 ، Apache-2.0) با FundyPanel مشترک است (مخزن‌های جدا `fundynode` / `fundypanel`).
- `docker-compose.prod.yml` و `nginx.conf` سرور از ریپو می‌آیند ؛ هر تفاوتی اول diff نشان داده و تائید y/N خواسته می‌شود.
  `app` و `worker` هر دو `image: fundynode:live` با `pull_policy: never` دارند.
- تونل معکوس `ssh -R 127.0.0.1:5055:127.0.0.1:5055` فقط در طول همان فرمان باز است ؛ `AllowTcpForwarding` در sshd باید روشن باشد (پیش‌فرض).
- سمت سرور (`tools/deploy/fundy-server.sh` ، هر دپلوی بالا فرستاده می‌شود): قفل flock ⇒ بررسی هم‌پروژه بودن کانتینرها با compose
  (وگرنه volume `mongo-data` فرق می‌کرد) ⇒ pull لایه‌های تازه ⇒ **بکاپ** `mongodump --gzip` (با اعتبارنامه `MONGO_INITDB_ROOT_*` خود
  کانتینر mongo) و `dump.rdb` ردیس در `backups/` (۷ تای آخر ؛ خطای بکاپ ⇒ دپلوی پیش از هر تغییری متوقف) ⇒ تگ `fundynode:live`
  ⇒ `compose up -d` ⇒ صبر برای healthcheck اپ (حداکثر ۱۸۰ ثانیه ؛ دو ری‌استارت پشت هم = خراب) ⇒ `nginx -t` و `nginx -s reload`
  و یک درخواست واقعی از داخل کانتینر nginx به `/healthcheck` (همان مسیری که EA ها و پنل می‌روند) ⇒ ناسالم: ۴۰ خط آخر لاگ و
  **برگشت خودکار**.
- **502 بعد از دپلوی (2026-10-29 حل شد):** `nginx.conf` قبلا `proxy_pass http://app:3000` ثابت داشت ؛ nginx آدرس IP کانتینر app را
  فقط در شروع می‌گرفت و هر بار app از نو ساخته می‌شد و IP تازه می‌گرفت (مثلا وقتی app و worker هم‌زمان ساخته می‌شوند) ، nginx به IP
  قدیمی می‌فرستاد ⇒ 502 تا `docker restart nginx`. روی سرور جعلی بازتولید شد. حالا `resolver 127.0.0.11 valid=10s` (DNS داخلی داکر)
  و `proxy_pass` با متغیر ⇒ nginx هر ۱۰ ثانیه نام app را دوباره resolve می‌کند (آزمون: عوض شدن IP app بدون restart nginx ⇒ 200) ؛
  بررسی پشت nginx در دپلوی هم هر 502 باقی‌مانده را می‌گیرد. healthcheck خود کامپوز داخل app است و 502 را نمی‌دید.
- `nginx.conf` و compose روی سرور در جا بازنویسی می‌شوند (نه `mv`): nginx.conf تک‌فایل bind mount است و فایل جایگزین‌شده با inode تازه
  در کانتینر دیده نمی‌شد. nginx.conf خراب ⇒ `nginx -t` خطا ، nginx با پیکربندی قبلی ادامه می‌دهد و دپلوی / برگشت شکست‌خورده اعلام می‌شود.
- ایمیجی که پیش از این روش اجرا می‌شد (بیلد روی سرور) در اولین دپلوی با نام `00000000-000000-legacy` نگه داشته می‌شود.
- **داده برنمی‌گردد**: rollback فقط کد را عوض می‌کند ؛ برای برگرداندن Mongo / Redis بکاپ‌های `backups/` و `restore.sh` هست.

## تفاوت با `deploy.sh` قدیمی (حذف شد)

- سرور دیگر کد را build نمی‌کند (`npm install` روی سرور = اینترنت بین‌الملل) ؛ کد روی سرور (checkout قدیمی) دیگر استفاده نمی‌شود.
- `mongodump` قدیمی بدون اعتبارنامه بود (با auth روشن خطا می‌داد) ؛ حالا با اعتبارنامه کانتینر و gzip.
- بررسی سلامت قدیمی نام `fundy-node-prod` و `localhost:5001/health` را می‌دید که با compose هم‌خوان نبود.
- ساخت فایل logrotate برای `/home/ubuntu/fundy/logs` حذف شد (لاگ‌های اپ روی volume `app-logs` اند ، نه آن مسیر).

## چه وقت اینترنت بین‌الملل لازم است

| کار | اینترنت بین‌الملل |
|---|---|
| تغییر کد | **لازم نیست** (فقط SSH به سرور) |
| تغییر `package.json` / `package-lock.json` | فقط کامپیوتر توسعه (npm) ؛ سرور نه |
| تغییر مرحله `base` در Dockerfile.prod | فقط کامپیوتر توسعه |

## آزمون (2026-10-29)

سرور جعلی `docker:dind` + sshd (شبکه و daemon جدا ⇒ pull واقعا از تونل) با استک قدیمی (compose با `build:`) در حال اجرا:
setup (پیدا شدن خودکار پوشه پروژه) ، اولین دپلوی (adopt legacy ، diff compose ، بکاپ Mongo با auth و Redis) ، دپلوی تغییر یک خطی
(۴۸ ثانیه) ، versions ، rollback (۱۶ ثانیه) ، اپ خراب (throw در app.js ⇒ unhealthy ⇒ برگشت خودکار ، حدود ۱:۴۵ به خاطر interval سی ثانیه‌ای healthcheck).
`deploy env`: تغییر `FUNDYPANEL_API_KEY` + کلید تازه (مقدار تازه در کانتینر ، دسترسی 600 ، پشتیبان) ، خط نامعتبر (رد بدون تغییر) ،
رمز Mongo اشتباه (برگشت خودکار ، ۱:۳۷) ، `env undo` ؛ Notepad واقعی دستی آزموده نشد.

## عیب‌یابی

- `Cannot log in … with the deploy key` ⇒ `deploy.bat setup`.
- `Could not find the project folder on the server` ⇒ کانتینر `fundynode` روشن نیست ؛ `DEPLOY_DIR` را در deploy.conf بنویسید.
- `MongoDB backup failed` ⇒ چیزی عوض نشده ؛ `docker logs my-mongo` و فضای دیسک.
- روی سرور دستی: `bash fundy-server.sh status` (یا `versions` ، `rollback`) در پوشه پروژه.
