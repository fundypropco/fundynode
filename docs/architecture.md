# معماری FundyNode

## ۱. جایگاه در سامانه بزرگ‌تر

FundyNode یکی از چند پروژه سامانه پراپ‌تریدینگ Fundy است:

| بازیگر | توضیح | ارتباط با FundyNode |
|---|---|---|
| **متاتریدر دموی کاربر** (EA / «spider») | تریدر روی حساب دمو معامله می‌کند؛ اکسپرت (MQL) هر رویداد را به‌صورت پیام متنی می‌فرستد | `POST /api/spider/SendMessage` |
| **FundyPanel / Trading Room** | پروژه لاراول؛ اتاق معاملات اختصاصی که کاربر بدون متاتریدر در آن سفارش می‌دهد | همان `SendMessage` (پیام‌ها فیلد `acc_fp` دارند) + `GET /api/tradingroom/GetUpdates/:acc/:keyid` برای پیگیری وضعیت + دریافت sync |
| **متاتریدر Master** (حساب واقعی، EA) | سفارش‌ها روی آن کپی می‌شود؛ مدام صف دستورها را poll می‌کند | `GET /api/spider/GetUpdates/:acc` برای گرفتن دستور، `SendMessage` با کدهای 9xx برای اعلام نتیجه |
| **لاراول (panel.fundyprop.com)** | مقصد همگام‌سازی معاملات | FundyNode به `POST https://panel.fundyprop.com/api/sync-trade` با هدر `X-API-Key` رویداد می‌فرستد |
| **ربات بله** | اعلان‌ها | `sendToNotifBot` در `helper.js` (API `tapi.bale.ai`) |
| **تلگرام** | ذخیره/خواندن پیام‌ها و «permission» ها برای یک ربات جانبی | `/api/telegram/*` |

> کد MQL اکسپرت‌ها و کد لاراول در این ریپو نیستند. هر فرمت پیامی که اینجا پارس/ساخته می‌شود باید با آنها هماهنگ بماند.

## ۲. مدل ذهنی: صف دستور مبتنی بر polling

```
 ┌───────────────┐   1. رویداد (مثلاً NEW ORDER, 500)        ┌──────────────┐
 │ MT دمو / پنل  │ ───────────────────────────────────────► │  FundyNode   │
 └───────────────┘   ◄── پاسخ همزمان {status, message, keyid} │  (Express)   │
                                                              │              │
                              2. برای هر copier یک سند در      │  get_updates │
                                 get_updates با status=pending │  (MongoDB)   │
                                                              └──────┬───────┘
 ┌───────────────┐   3. GET /api/spider/GetUpdates/:origin_acc       │
 │  MT Master    │ ◄─────────────────────────────────────────────────┘
 │  (EA)         │      {ok, result:[{update_id, message}], timestamp}
 │               │
 │               │   4. اجرای دستور و اعلام نتیجه (مثلاً 999 = RES_BUY)
 └───────────────┘ ───────────────────────────────────────► FundyNode
                        5. updateStatus → ساخت/به‌روزرسانی TradeMap → sync به لاراول
```

- ارتباط FundyNode با متاترید‌ها **یک‌طرفه از سمت آنها** است: FundyNode هیچ‌وقت به متاتریدر درخواست نمی‌زند؛ فقط در `get_updates` دستور می‌گذارد.
- برخی دستورها برای خود حساب مبدا هستند (مثلاً `CLOSE_ORIGIN = 23` برای بستن معامله روی MT دمو وقتی کپی ممکن نیست).

## ۳. اجزای اجرایی

| سرویس (compose) | فرمان | توضیح |
|---|---|---|
| `app` (کانتینر `fundynode`) | dev: `nodemon app.js` / prod: `pm2-runtime ecosystem.config.cjs` (cluster، `instances: max`) | سرور Express روی پورت 3000 |
| `worker` (کانتینر `fundyworker`) | dev: `nodemon worker.js` / prod: PM2 fork، ۱ instance | BullMQ Worker روی صف `app-queue`، concurrency=5 |
| `mongo` (`my-mongo`) | mongo:8 | dev بدون auth روی پورت میزبان 27117؛ prod با `MONGO_INITDB_ROOT_*` |
| `redis` (`my-redis`) | redis:8 | صف BullMQ، شمارنده‌های cluster و وضعیت لحظه‌ای حساب‌ها (42) |
| `nginx` (فقط prod) | nginx:alpine | پورت 80 → `app:3000` |

### ترتیب بوت (`src/index.js`)
1. `boot()` — اتصال همزمان Mongo (با ۱۰ بار retry)، Redis، Queue؛ ساخت ایندکس‌های چند مدل
2. middleware ها: `cors`، `express.json`، `urlencoded`
3. route ها
4. error handler (همیشه HTTP 500 و `Something Went Wrong !!!`) و 404
5. `runSchedule()` — ثبت job تکرارشونده `checkTradeMap` (هر 30s، jobId ثابت پس تکراری نمی‌شود)
6. `app.listen(APP_PORT)`

### الگوی Singleton
`getMongo`, `getRedis`, `getAppQueue` همه با متغیر ماژول + `initPromise` یک‌بار مقداردهی می‌شوند. در PM2 cluster هر پروسس نسخه خودش را دارد (کش‌های `boot/cache.js` هم per-process هستند).

## ۴. Endpoint ها

| متد | مسیر | کنترلر | توضیح |
|---|---|---|---|
| GET | `/healthcheck` | inline | healthcheck داکر |
| GET | `/test-queue` | inline | job `run-seeders` می‌سازد (worker آن را پردازش نمی‌کند) |
| GET | `/api/spider/GetUpdates/:acc` | `spider.getUpdates` | دستورهای pending با `origin_acc = :acc` در ۶۰ ثانیه اخیر |
| POST | `/api/spider/SendMessage` | `spider.sendMessage` | **ورودی اصلی**؛ body: `{ message: "<رشته>" }` |
| GET | `/api/tradingroom/GetUpdates/:acc/:keyid` | `tradingroom.getUpdates` | آخرین سند GetUpdate با `platform='panel'` برای آن acc و keyid (پنل وضعیت اجرای سفارشش را می‌بیند) |
| POST | `/api/tradingroom/sync-all-trades/all` | `tradingroom.syncAllTrades` | TradeMap های با `created_at >= body.from_timestamp` |
| POST | `/api/tradingroom/sync-acc-trades/:acc` | `tradingroom.syncAccTrades` | همه TradeMap های یک `acc_src` |
| POST | `/api/tradingroom/sync-symbols` | `tradingroom.syncSymbols` | همه اسناد Symbol |
| POST | `/api/admin/seed-symbol-alias` | admin | upsert لیست نمادهای مجاز (فارکس، فلزات، کریپتو) |
| POST | `/api/admin/seed-log-rules` | admin | upsert قوانین لاگ درخواست |
| POST | `/api/admin/seed-broker-symbols/:server` | admin | دستور `BROKER_SYMBOLS (13)` برای بروکر (`all` / `old` / نام سرور) |
| POST | `/api/admin/seed-broker-symbols-data/:server` | admin | دستور `BROKER_SYMBOL_DATA (11)` برای هر نماد بروکر |
| GET | `/api/admin/trade-map/:accSrc` | admin | نمایش TradeMap ها به شکل `sender` / `mother` |
| POST | `/api/telegram/SendMessage` | telegram | ذخیره پیام در `telegram_messages` |
| GET | `/api/telegram/GetUpdates` | telegram | ۲۰۰ پیام آخر |
| POST | `/api/telegram/permissions/set` | telegram | body.message = `acc_&_...` ؛ upsert بر اساس acc |
| GET | `/api/telegram/permissions/get/:acc` | telegram | |

> هیچ‌کدام احراز هویت ندارند. پاسخ خطا در سطح منطق معمولاً HTTP 200 با `{status:'error'}` است.

## ۵. صف و زمان‌بندی

- `src/services/QueueService.js` → `add2AppQueue(name, data, repeat, jobId)`؛ jobId پیش‌فرض `name_<unix-seconds>`.
- `worker.js` فقط `checkTradeMap` را اجرا می‌کند (`src/schedules/job.js`):
  - حساب‌هایی با `copy: true` و `check_time >= now` را پیدا می‌کند، برای هر کدام دستور `CHECK_TRADES (30)` می‌سازد و `check_time = 0` می‌کند.
  - سپس `TradeMapCheck` های اعلان‌نشده را به ربات بله می‌فرستد.
  - چون `sendForCheck` (تنها جایی که `check_time` را تنظیم می‌کند) در handler ها کامنت شده و پاسخ 970 هم در کنترلر غیرفعال است، این job فعلاً عملاً کاری انجام نمی‌دهد.
- `worker.js` همچنین حلقه `startAccReportSync` (`src/schedules/accReportSync.js`) را اجرا می‌کند: هر ثانیه وضعیت حساب‌ها را به FundyPanel می‌فرستد (جزئیات در [flows.md](flows.md#۱۰-۱-وضعیت-لحظه‌ای-حساب‌ها-42--redis--fundypanel)).
- `src/schedules/cron.js` و `test.js` استفاده نمی‌شوند.

## ۶. لاگ

- `src/helpers/logger.js`: pino، سطح `warn`، خروجی همزمان stdout و `logs/app.log`، زمان به وقت تهران.
- **RequestLog** (کالکشن `request_logs`): اگر برای handler در `log_rules` مقدار `log: true` باشد، `setRequestLog` پیام ورودی را ذخیره می‌کند. فقط `HandleNewOrder` (500) و `handleClose` (501) پاسخ و مدت زمان را روی همان سند ثبت می‌کنند.
- کش LogRule یک دقیقه‌ای است؛ پس از تغییر `log_rules` تا ۱ دقیقه طول می‌کشد اعمال شود.

## ۷. استقرار و بکاپ

- `deploy.sh`: بکاپ Mongo و Redis در `./backups` (۷ نسخه آخر) → `docker compose -f docker-compose.prod.yml up -d --build` → بررسی سلامت → logrotate.
  - توجه: اسکریپت نام کانتینر `fundy-node-prod` و آدرس `localhost:5001/health` را چک می‌کند که با compose فعلی (`fundynode` و `/healthcheck` پشت nginx روی پورت 80) هم‌خوان نیست؛ بخش health آن عملاً همیشه «منتظر» می‌ماند.
- `backup.sh`: mongodump فشرده با اعتبارنامه `.env` به `/home/mongo_backups/<date>/`.
- `restore.sh` (تعاملی) و `restore-auto.sh` (آخرین بکاپ) — `restore-auto.sh` در انتها ناقص است (مسیر مقصد `dump.rdb_` و بدون start مجدد).

## ۸. واژه‌نامه

| اصطلاح | معنی |
|---|---|
| **spider** | اکسپرت MQL روی متاتریدر (هم دمو و هم Master) |
| **Account** | رکورد حساب کاربر در FundyNode (مبدا/تریدر) |
| **acc** | شناسه حساب کاربر؛ در پراپ = کد حساب معاملاتی کاربر در پراپ، در کپی‌ترید ساده = شماره متاتریدر |
| **acc_meta** | شماره متاتریدر دموی کاربر (در حالت پراپ بدون متاتریدر = 0) |
| **acc_fp** | فیلد انتهایی پیام؛ اگر مقدار داشته باشد پیام از FundyPanel آمده (`platform='panel'`) |
| **copier / Master / mother** | حساب واقعی مقصد که سفارش روی آن کپی می‌شود (در کد `copiers[]`، در admin با نام `mother`) |
| **origin / src / sender** | سمت کاربر (مبدا) |
| **dist** | سمت Master (مقصد) — (منظور «destination» است) |
| **ticket** | شماره سفارش در متاتریدر |
| **keyid / update_id** | شناسه دستور در صف `get_updates` |
| **handler** | عدد دوم پیام؛ نوع پیام/دستور |
| **cluster no** | پسوند `_N` بعد از acc در پیام‌های خروجی تا چند نمونه EA روی Master بار را تقسیم کنند (فعلاً همیشه `_1`) |
| **diff_time** | اختلاف ساعت سرور بروکر (ms) برای یکسان‌سازی زمان‌ها |
| **symbol title / alias** | نام استاندارد نماد (`EURUSD`) در برابر نام نماد در بروکر (`EURUSD_o`) |
| **waiting** | دستوری که هنوز تیکت مقصدش معلوم نیست؛ پس از باز شدن سفارش مقصد `pending` می‌شود |
| **partial** | بستن بخشی از حجم؛ در MT تیکت جدیدی برای باقیمانده ساخته می‌شود |
| **`*_final`** | مقدار محاسبه‌شده/شرکتی (company) برای کمیسیون و سواپ روی Master |
| **master (در handleClose)** | پیام 501 با فیلد پنجم `-1234` یعنی خود Master بستن معامله را گزارش داده (مثلاً SL/TP) |
