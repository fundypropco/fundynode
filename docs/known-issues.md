# مشکلات شناخته‌شده، ریسک‌ها و کد مرده

> این فهرست حاصل خواندن کامل کد در تاریخ 2026-09-23 (commit `3e4c08c`) است. **هیچ‌کدام هنوز اصلاح نشده‌اند.**
> برچسب‌ها: 🔴 قطعی (از روی کد مشخص است) · 🟡 باید با رفتار EA/پنل تأیید شود · ⚪ ریسک/بهبود
> بعد از رفع هر مورد، آن را از این فایل حذف یا علامت‌گذاری کن.

## الف) خطاهای قطعی در handler های فعال

| # | | محل | مشکل | اثر |
|---|---|---|---|---|
| 1 | 🔴 | `src/services/handlers/HandleUsage.js:8` | `ram` تعریف نشده (باید `data.ram` باشد) | اگر `cpu <= 70` باشد → `ReferenceError` → HTTP 500؛ Usage ذخیره نمی‌شود |
| 2 | 🔴 | `src/services/handlers/HandleSymbolData.js:8` | مدل `Symbol` import نشده؛ در ESM `Symbol` به `Symbol` سراسری جاوااسکریپت اشاره می‌کند | `Symbol.find is not a function` → پیام 301 همیشه 500 |
| 3 | 🔴 | `src/services/handlers/HandleSymbolData.js:28` | متغیر `output` تعریف نشده | حتی با رفع #2 باز هم `ReferenceError` |
| 4 | 🔴 | `HandleSymbolData.js:16` و `HandleRequestProfile.js:36` | سند GetUpdate بدون فیلد `handler` ساخته می‌شود؛ ولی `HandleResSymbolData` (399) و `HandleResRequestProfile` (960) با `handler: 301/40` جستجو می‌کنند | وضعیت این دستورها هرگز `success` نمی‌شود و تا ۶۰ ثانیه مدام دوباره تحویل می‌شوند |
| 5 | 🔴 | `src/services/handlers/handleClose.js:66` | `RequestLog` import نشده | فعلاً خاموش است چون کنترلر `reqLog` را پاس نمی‌دهد؛ با پاس دادن آن crash می‌کند |
| 6 | 🔴 | `handleClose.js:42,46` (مسیر master) | `data.closed_swap_final` و `data.closed_commission_final` در `processMessage` پارس نمی‌شوند | `swap_final`/`commission_final` برای بستن‌های مستقیم Master پر نمی‌شود (کار commit های اخیر ناتمام) |
| 7 | 🔴 | `HandleNewOrder.js:190` | در `processPartial`، `data.closed_commission` وجود ندارد (داخل `partial_item` است) | `newCommission` همیشه 0 |

## ب) crash های احتمالی (null-check ندارد)

| # | | محل | سناریو |
|---|---|---|---|
| 8 | 🔴 | `HandleNewOrder.js:301-307` ، `handleClose.js:237-242` ، `handleModify.js:17-26` | حساب پیدا نشود (acc/acc_meta ناشناخته) → `TypeError` روی `account.copy` یا `accountObj.server` |
| 9 | 🔴 | `HandleResNewOrder.js:85` | اگر `updateStatus` سندی پیدا نکند (keyid اشتباه) → شاخه else روی `getUpdateDoc.origin_acc` crash می‌کند |
| 10 | 🔴 | `HandleResNewOrder.js:66` | نماد Master در `symbols` نباشد → `symbol.tick_value` crash (بعد از `updateStatus` موفق، پس TradeMap ساخته نمی‌شود) |
| 11 | 🔴 | `GetUpdateService.js:310-311` | modify با sl/tp ≠ 0 وقتی TradeMap و سند سفارش اولیه وجود ندارند (مثلاً کپی رد شده) → `doc.side` روی null |
| 12 | 🟡 | `handleClose.js:241` | اگر Master پیام 501/`-1234` را با `acc_fp = 0` بفرستد، حساب با `acc_meta` پیدا نمی‌شود و crash می‌کند؛ ظاهراً Master باید acc_fp غیرصفر بفرستد. همچنین در این مسیر `diff_time` اعمال نمی‌شود (برخلاف 996) |
| 13 | 🔴 | `HandleRequestProfile.js:21` | حساب با `acc = magic` پیدا نشود → crash |

## ج) جریان‌های ناقص (پاسخ‌های غیرفعال)

| # | | موضوع |
|---|---|---|
| 14 | 🔴 | **Partial close**: دستور 22 ساخته می‌شود ولی پاسخ 978 در کنترلر کامنت شده ⇒ رکورد dist بسته نمی‌شود، TradeMap باقیمانده ساخته نمی‌شود و waiting های وابسته آزاد نمی‌شوند. |
| 15 | 🔴 | **Open pending order**: دستور 25 ساخته می‌شود ولی پاسخ 975 غیرفعال ⇒ TradeMap در `pending` می‌ماند؛ close/modify بعدی کاربر که دنبال `open` می‌گردند `waiting` می‌شوند و هرگز اجرا نمی‌شوند. |
| 16 | 🔴 | **حذف پندینگ**: پاسخ `991`/`OK DELETE` مسیریابی نشده و `HandleResClose` فقط رکورد `open` را جستجو می‌کند ⇒ TradeMap پندینگ هیچ‌وقت `canceled/deleted` نمی‌شود. |
| 17 | 🟡 | ممکن است برای یک partial هم 500 و هم 501 برسد ⇒ دو دستور PARTIAL_CLOSE. رفتار EA باید بررسی شود. |
| 18 | 🔴 | کنترل صحت کپی (`sendForCheck` / 970) و مدیریت دراودان (400/504/AccountService) کامنت شده‌اند؛ **در حال حاضر هیچ سازوکار خودکار توقف حساب با رسیدن به `drawdown` وجود ندارد.** |

## د) منطق صف و زمان

| # | | موضوع |
|---|---|---|
| 19 | 🔴 | `getUnprocessed` فقط دستورهای **۶۰ ثانیه اخیر** را می‌دهد و `updateWaitings` مقدار `created_at` را تازه نمی‌کند ⇒ اگر باز شدن سفارش روی Master بیش از ۶۰ ثانیه از ساخت یک CLOSE/MODIFY در حالت waiting طول بکشد، آن دستور هرگز تحویل نمی‌شود. همچنین هر دستوری که ظرف ۶۰ ثانیه پاسخ نگیرد رها می‌شود (بدون retry/هشدار). |
| 20 | 🟡 | دستورها تا رسیدن پاسخ `pending` می‌مانند و در هر poll دوباره برگردانده می‌شوند؛ EA باید با `update_id` تکراری‌ها را نادیده بگیرد. |
| 21 | ⚪ | `keyid = Date.now() % 1e9`: دو درخواست در یک میلی‌ثانیه (به‌خصوص با PM2 cluster `instances: max`) می‌توانند keyid یکسان بگیرند ⇒ `updateStatus` ممکن است سند اشتباه را به‌روز کند. همچنین در `processNewOrder` همه copier ها یک keyid مشترک می‌گیرند (چون `data.keyid++` روی کپی محلی است). |
| 22 | 🟡 | دستورهای بدون `origin_acc` (11، 13، 30، 40، 301) با `origin_acc=0` ذخیره می‌شوند؛ باید مشخص شود EA آنها را با چه `:acc` ای poll می‌کند. |
| 23 | ⚪ | `updateWaitings` با `message.replace('-1', ticket)` **اولین** رخداد `-1` را عوض می‌کند؛ اگر قبل از تیکت رشته `-1` دیگری باشد (مثلاً acc منفی/فیلد دیگر) پیام خراب می‌شود. |
| 24 | ⚪ | `updateWaitings` فقط بر اساس `origin_acc + origin_ticket` فیلتر می‌کند نه `acc` copier ⇒ با **چند copier**، تیکت اولین Master روی waiting های Master دیگر هم نوشته می‌شود. |
| 25 | 🟡 | `getTimeOfMsg` برای 987 اندیس 3 را می‌خواند که یک نماد است → `NaN` → چک انقضا ناخواسته رد می‌شود (فعلاً به نفع ماست، ولی شکننده است). |
| 26 | 🟡 | کامنت‌ها `tehran_timestamp_msc` می‌گویند؛ اگر timestamp پیام به وقت تهران باشد (۳.۵ ساعت جلوتر از UTC)، چک انقضای ۶۰ ثانیه‌ای عملاً پیام‌های تا ۳.۵ ساعت قدیمی را هم می‌پذیرد. |
| 27 | ⚪ | `getMqlClusterNo`: خط `c = 1` هر نتیجه‌ای را بازنویسی می‌کند ⇒ cluster همیشه `_1` (احتمالاً عمدی/موقت)، ولی `redis.incr` بیهوده اجرا می‌شود. |

## ه) امنیت و عملیات

| # | | موضوع |
|---|---|---|
| 28 | ⚪ | **هیچ endpoint ای احراز هویت ندارد**؛ `/api/admin/*` و `/api/tradingroom/sync-*` (همه معاملات همه کاربران) روی پورت 80 باز هستند. هر کسی می‌تواند با `SendMessage` سفارش جعلی بسازد. |
| 29 | ⚪ | در `docker-compose.yml` (dev) Mongo بدون رمز روی پورت میزبان 27117 و Redis روی 6380 باز است. |
| 30 | ⚪ | middleware خطا همیشه HTTP 500 برمی‌گرداند حتی اگر `error.status` چیز دیگری باشد. |
| 31 | 🔴 | `deploy.sh` کانتینر `fundy-node-prod` و `localhost:5001/health` را چک می‌کند که وجود ندارند (نام واقعی `fundynode`، مسیر `/healthcheck`، پشت nginx روی 80). |
| 32 | 🔴 | `restore-auto.sh` ناقص است: فایل به `/data/dump.rdb_` کپی می‌شود و Redis/اپ دوباره start نمی‌شوند. |
| 33 | ⚪ | `TradeMapService.sync` در خطا retry ندارد؛ اگر لاراول در دسترس نباشد رویداد از دست می‌رود (فقط pull دستی جبران می‌کند). |
| 34 | ⚪ | `.gitignore` خود `.gitignore` و `Dockerfile*`/`docker-compose*` را ignore کرده (فایل‌های فعلی track می‌شوند ولی فایل جدید هم‌نام اضافه نمی‌شود). |

## و) کد مرده / بلااستفاده

- handler های مسیریابی‌نشده: `HandleOpenTrades` (400)، `HandleNewData` (504 — به فیلدهای حذف‌شده Account اشاره می‌کند)، `handleResCheckTradeMap` (970)، `HandleResOpenPendingOrder` (975)، `handleResPartialClose` (978)، `handleResBulkClose` (979)، `HandleResCloseAllOrigin` (980)، `HandleResCloseMagic` (974 — متغیرهای `vol`/`symbol` تعریف‌نشده دارد).
- `AccountService.js`: همه توابع کامنت شده؛ فقط `test` خالی export می‌شود، ولی handler های غیرفعال هنوز `bulkClose/closeAll` را صدا می‌زنند.
- `helper.js`: `getCopyTradeParams`، `getOrderVol` (فرمول `vol_factor > 1` تقسیم بر 100 دارد — مشکوک)، `getWiderSl/Tp` (فراخوانی‌ها کامنت شده).
- `isOrderPossible` بعد از `return` اولیه.
- `schedules/cron.js` (import نامعتبر `setBrokersDiff` و `'../helpers/logger'` بدون `.js`)، `schedules/test.js`، `job.getOpenTradesProfit` (از `ACTION_HANDLER.OPEN_TRADES_PROFIT` تعریف‌نشده استفاده می‌کند)، `seeders/seed.js`.
- `/test-queue` job `run-seeders` می‌سازد که worker پردازش نمی‌کند.
- فیلد `datetime` در `GetUpdateService.create` در اسکیما نیست و ذخیره نمی‌شود.
- `Account.status` و `Account.copiers[].vol_factor` در منطق استفاده نمی‌شوند.
