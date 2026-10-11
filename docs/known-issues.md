# مشکلات شناخته‌شده، ریسک‌ها و کد مرده

> این فهرست حاصل خواندن کامل کد در تاریخ 2026-09-23 (commit `3e4c08c`) است. موارد اصلاح‌شده در بخش «ب» آمده‌اند.
> برچسب‌ها: 🔴 قطعی (از روی کد مشخص است) · 🟡 باید با رفتار EA/پنل تأیید شود · ⚪ ریسک/بهبود
> بعد از رفع هر مورد، آن را از این فایل حذف یا علامت‌گذاری کن.

## الف) خطاهای باز در handler های فعال

| # | | محل | مشکل | اثر |
|---|---|---|---|---|
| 37 | 🟡 | `helper.getOrderVol` | حجم کپی به پایین تا دو رقم اعشار گرد می‌شود و می‌تواند **صفر** شود | پلن اقتصادی روی Master **استاندارد** با حجم حداقلی: `0.5 × 0.01 = 0.005 ⇒ 0` و سفارش با حجم صفر به Master می‌رود. روی Master سنتی (قاعده فعلی کسب‌وکار) پیش نمی‌آید. کلمپ به `vol_min` نماد عمدا انجام نشد چون اندازه معامله را بی‌خبر عوض می‌کند |

## ب) اصلاح‌شده

- #1 `HandleUsage`: `ram` → `data.ram`
- #2، #3 `HandleSymbolData`: import مدل `Symbol` و حذف `output` تعریف‌نشده
- #4 دستورهای 301 و 40 حالا فیلد `handler` دارند تا 399/960 وضعیتشان را `success` کنند
- #5 `handleClose`: import `RequestLog` و پاس دادن `reqLog` از کنترلر (لاگ پاسخ 501 کامل می‌شود)
- #7 `HandleNewOrder.processPartial`: کمیسیون از `partialInfo.closed_commission` خوانده می‌شود
- #8، #13 حساب ناشناخته در 500/501(کاربر)/502/302 → پاسخ `{status:'error', message:'Account Not Found!!!'}` به جای HTTP 500
- #36 `tradingroom.setAccStatus`: `account.save()` بدون `await` بود ⇒ پاسخ قبل از پایان نوشتن می‌رفت و پنل تغییر وضعیت خودش را روی نوشتن ناتمام commit می‌کرد (2026-10-11)
- #35 `copiers[].vol_factor` در هیچ مسیر فعالی خوانده نمی‌شد (`getOrderVol` کد مرده بود) ⇒ 2026-10-11 کاربر آن را در `GetUpdateService.prepareOrderData` وصل کرد؛ تبدیل واحد حساب سنتی هم از حدس روی `vol_factor` به فیلد صریح `copiers[].cent` منتقل شد (data-models)
- #39 `isOrderPossible` ایکوئیتی **خام** Master (سنت در حساب سنتی) را با `account.drawdown` (دلار) مقایسه می‌کرد ⇒ روی Master سنتی چک «ایکوئیتی آزاد تا حد دراودان» عملا بی‌اثر بود؛ حالا حد دراودان با `toMasterUnits(drawdown, copier.cent)` به همان واحد برده می‌شود (2026-10-11 ، تایید کاربر)
- #38 `isOrderPossible` کمیسیون/اسپرد/مارجین را با **حجم کاربر** و **نماد copier** حساب می‌کرد ⇒ روی Master سنتی هزینه ۱۰۰ برابر کمتر برآورد می‌شد و محافظ عملا بی‌اثر بود؛ حالا با حجم واقعی copier (`data.copier_vol`) کار می‌کند (2026-10-11)
- #9 `HandleResNewOrder`: شاخه خطا فقط وقتی سند GetUpdate پیدا شده اجرا می‌شود
- #10 `HandleResNewOrder`: نبود نماد Master دیگر مانع ساخت TradeMap نمی‌شود (`tick_value/tick_size/weight = 0`)
- #11 `prepareModifyData`: null-check روی سند سفارش اولیه
- #12 (بخش crash) مسیر master در 501 با `acc_fp = 0` دیگر crash نمی‌کند؛ عدم اعمال `diff_time` در این مسیر طبق تصمیم کاربر عمدی است
- #6 پارس `swap_final/commission_final` مسیر master (commit کاربر `ecacd5c`)
- مسیر master در 501: جستجوی TradeMap با `data.ticket` (همیشه undefined) به جای `data.closed_ticket` انجام می‌شد ⇒ هیچ معامله‌ای بسته نمی‌شد و چون `response` فقط داخل `if` مقدار می‌گرفت، بدنه پاسخ خالی بود (branch `claude/fix-master-close-response`). ارسال زمان بستن به‌صورت ثانیه از سمت EA Master گزارش شده و قرار است در متاتریدر اصلاح شود

## ج) جریان‌های ناقص (پاسخ‌های غیرفعال)

| # | | موضوع |
|---|---|---|
| 14 | 🔴 | **Partial close**: دستور 22 ساخته می‌شود ولی پاسخ 978 در کنترلر کامنت شده ⇒ رکورد dist بسته نمی‌شود، TradeMap باقیمانده ساخته نمی‌شود و waiting های وابسته آزاد نمی‌شوند. |
| 15 | 🔴 | **Open pending order**: دستور 25 ساخته می‌شود ولی پاسخ 975 غیرفعال ⇒ TradeMap در `pending` می‌ماند؛ close/modify بعدی کاربر که دنبال `open` می‌گردند `waiting` می‌شوند و هرگز اجرا نمی‌شوند. |
| 16 | 🔴 | **حذف پندینگ**: پاسخ `991`/`OK DELETE` مسیریابی نشده و `HandleResClose` فقط رکورد `open` را جستجو می‌کند ⇒ TradeMap پندینگ هیچ‌وقت `canceled/deleted` نمی‌شود. |
| 17 | 🟡 | ممکن است برای یک partial هم 500 و هم 501 برسد ⇒ دو دستور PARTIAL_CLOSE. رفتار EA باید بررسی شود. |
| 18 | 🟡 | کنترل صحت کپی (`sendForCheck` / 970) و محاسبه دراودان سمت FundyNode (400/504/AccountService) کامنت شده‌اند. توقف حساب با دراودان اکنون از طریق پیام 41 از Master انجام می‌شود؛ بنابراین به درست کار کردن EA Master وابسته است. |

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
- `helper.js`: `getCopyTradeParams`، `getWiderSl/Tp` (فراخوانی‌ها کامنت شده). `getOrderVol` از 2026-10-11 زنده است (شاخه `vol_factor > 1` هم که قبلا تقسیم بر 100 داشت و صفر برمی‌گرداند اصلاح شد).
- `schedules/cron.js` (import نامعتبر `setBrokersDiff` و `'../helpers/logger'` بدون `.js`)، `schedules/test.js`، `job.getOpenTradesProfit` (از `ACTION_HANDLER.OPEN_TRADES_PROFIT` تعریف‌نشده استفاده می‌کند)، `seeders/seed.js`.
- `/test-queue` job `run-seeders` می‌سازد که worker پردازش نمی‌کند.
- فیلد `datetime` در `GetUpdateService.create` در اسکیما نیست و ذخیره نمی‌شود.
- `Account.copiers[].vol_factor` از 2026-10-11 در `prepareOrderData` استفاده می‌شود. `Account.status` از 2026-10-08 با `set-acc-status` نوشته می‌شود و `copy` را عوض می‌کند، ولی خود `status` در مسیر کپی خوانده نمی‌شود.
