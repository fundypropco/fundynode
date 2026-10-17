# مدل‌های داده (MongoDB / Mongoose)

همه مدل‌ها در `src/models/`. زمان‌ها اغلب `Number` (epoch میلی‌ثانیه) + یک فیلد `String` قالب‌بندی‌شده (`YYYY-MM-DD HH:mm:ss`).
ایندکس‌ها: `boot/mongo.js` برای Account, AccountReport, Broker, GetUpdate, Symbol, TelegramMessage, TelegramPermission صراحتاً `createIndexes` صدا می‌زند؛ بقیه به `autoIndex` پیش‌فرض Mongoose متکی‌اند.

| مدل | کالکشن | نقش | استفاده فعال |
|---|---|---|---|
| Account | `accounts` | حساب کاربر و لیست copier ها | ✅ |
| GetUpdate | `get_updates` | صف دستورها برای EA ها | ✅ |
| TradeMap | `trade_maps` | نگاشت معامله مبدا ↔ مقصد | ✅ |
| Symbol | `symbols` | مشخصات نماد در هر بروکر | ✅ |
| SymbolAlias | `symbol_alias` | لیست نمادهای مجاز و نام‌های جایگزین | ✅ |
| Broker | `brokers` | بروکرها و اختلاف زمانی | ✅ |
| LogRule | `log_rules` | کدام handler لاگ شود | ✅ |
| RequestLog | `request_logs` | لاگ پیام‌های ورودی | ✅ |
| Usage | `usage` | CPU/RAM سرورهای EA | ✅ |
| TelegramMessage | `telegram_messages` | پیام‌های ربات تلگرام | ✅ |
| TelegramPermission | `telegram_permissions` | قوانین دسترسی تلگرام | ✅ |
| TradeMapCheck | `trade_map_checks` | ناهمخوانی‌های کپی | job (عملاً غیرفعال) |
| AccountReport | `account_reports` | گزارش روزانه بالانس/اکوئیتی | ❌ (فقط handler های غیرفعال) |

---

## Redis

علاوه بر صف BullMQ و شمارنده‌های cluster:

| کلید | نوع | محتوا |
|---|---|---|
| `acc_report:{magic}` | string (JSON) با TTL ۲ دقیقه | آخرین گزارش 42 (مقادیر **خام** Master): `{acc, master_acc, free_margin, used_margin, equity, balance, open_trades, closed_trades, timestamp, received_at}` |
| `acc_reports:index` | sorted set | member = magic ، score = timestamp آخرین گزارش؛ برای پیدا کردن همه حساب‌ها بدون SCAN. عضوهایی که کلیدشان منقضی شده در `getAll` پاک می‌شوند. |
| `lock:acc_report_sync` | string با TTL ۱۰ ثانیه | قفل تک‌نسخه‌ای حلقه ارسال به پنل در worker |

دسترسی فقط از طریق `src/services/AccReportService.js` (`save` / `get(acc)` / `getAll()`)؛ چون در Redis است همه پروسس‌های PM2 cluster و worker داده یکسان می‌بینند.

---

## Account (`accounts`)
حساب کاربر (مبدا). از 2026-10-11 با `POST /api/tradingroom/set-acc` از پنل ساخته می‌شود (قبلاً دستی؛ کد مرده 504 هم هست).

| فیلد | نوع | پیش‌فرض | توضیح |
|---|---|---|---|
| `username` | String | `''` | در پروفایل 40 ارسال می‌شود |
| `acc_meta` | Number | 0 | شماره MT دموی کاربر؛ در پراپ بدون متاتریدر = 0 |
| `acc` | Number | 0 | کد حساب معاملاتی کاربر در پراپ / در کپی ساده = شماره MT |
| `server` | String | `''` | سرور بروکر حساب کاربر |
| `initial` | Number | | بالانس اولیه |
| `drawdown` | Number | 0 | **حداقل اکوئیتی مجاز به دلار** (مثلاً 950) — نه درصد |
| `commission_rate`, `swap_rate` | Number | 0 | در پروفایل 40 ارسال می‌شود؛ از پنل (`plan_configs`، پیش‌فرض 30 و 0) می‌آیند |
| `copy` | Boolean | false | کپی برای کل حساب فعال است؟ |
| `news_trading` | Boolean | true | ترید در تایم اخبار مجاز است؟ (2026-10-14، از کانفیگ پنل با `set-acc` / `set-acc-news`) ؛ پیش‌فرض true ⇒ حساب‌های قدیمی بدون محدودیت |
| `news_gap_minutes` | Number | 0 | فاصله مجاز ترید قبل از شروع و بعد از پایان خبر (دقیقه، حداکثر 240) |
| `news_impacts` | [String] | `[]` | درجه‌های اهمیت خبرهایی که فاصله دارند: `high` ، `medium` ، `low` ، `holiday` |
| `copiers[]` | زیرسند | `[]` | `{acc, server, copy, vol_factor=1, cent=false}` — حساب‌های Master مقصد (پایین) |
| `status` | enum | `stopped` | `trading / passed / failed / stopped` (در کد استفاده نمی‌شود) |
| `check_time` | Number | 0 | زمان درخواست بررسی صحت کپی (عملاً استفاده نمی‌شود) |
| `created_at` | Number | now | |

ایندکس‌ها: `acc`, `acc_meta`, `server`, `status`, `{acc, copiers.acc}`, `{copy, check_time}`.

جستجوی حساب: متاتریدر → `{acc_meta}` ، پنل → `{acc}`.

### `copiers[]` — حساب Master مقصد

| فیلد | پیش‌فرض | توضیح |
|---|---|---|
| `acc`, `server` | | شماره حساب و سرور بروکر Master |
| `copy` | | کپی روی این مقصد فعال است؟ |
| `vol_factor` | 1 | ضریب حجم: پلن حرفه‌ای ۱ ، پلن اقتصادی = سهم تریدر از تقسیم سود با حداقل 0.5 (پنل می‌فرستد) |
| `cent` | false | **حساب مقصد سنتی است؟** (2026-10-11) |

**قاعده کسب‌وکار (تایید کاربر 2026-10-11):** Master پلن‌های **اقتصادی** حساب **سنتی** است و Master پلن‌های
**حرفه‌ای** حساب **استاندارد**. چون در حساب سنتی ۱ لات سنتی = **۰.۰۱ لات استاندارد** است، حجم کپی باید
ضربدر ۱۰۰ شود تا اندازه اقتصادی معامله روی Master با معامله کاربر یکی باشد.

`helper.getOrderVol(volFactor, originVol, isCent)`:

```
حجم copier = ⌊ vol_factor × حجم کاربر × (سنتی ? 100 : 1) × 100 ⌋ / 100
```

مثال: کاربر ۰.۱ لات ، پلن اقتصادی با سهم ۶۰٪ ، Master سنتی ⇒ `0.6 × 0.1 × 100 = 6` لات سنتی (= ۰.۰۶ لات استاندارد).

⚠️ **مبنا همین فیلد `cent` است، نه `vol_factor` و نه نوع پلن.** تا 2026-10-11 تبدیل از روی
`vol_factor < 1` حدس زده می‌شد؛ آن قاعده دو حفره داشت: پلن اقتصادی با تقسیم سود ۱۰۰٪ (ضریب دقیقا ۱)
اصلا تبدیل نمی‌شد، و هر ترکیب دیگری (اقتصادی روی Master استاندارد یا حرفه‌ای روی Master سنتی) ۱۰۰ برابر
غلط می‌شد بدون هیچ خطایی. رکوردهای قدیمی با `tools/backfill-copier-cent.mjs` پر می‌شوند (همان قاعده قدیمی
`vol_factor < 1` ⇒ `cent` تا رفتار عوض نشود) و خروجی اسکریپت حساب‌هایی را که باید دستی بررسی شوند فهرست می‌کند.

⚠️ **یک شماره حساب می‌تواند چند رکورد داشته باشد** ولی فقط تازه‌ترین رکورد فعال است: `set-acc` رکورد تازه می‌سازد و
رکورد قبلی همان `acc` را (اگر `trading` و `copy` بود) `stopped` + `copy=false` می‌کند و پاک نمی‌کند (تاریخچه).
پس جست‌وجوی حساب باید با `Account.findLast(filter)` باشد (`findOne` + `sort({created_at:-1, _id:-1})`) نه `findOne` خالی —
در `tradingroom` (هر سه endpoint حساب) و `HandleNewOrder` / `handleClose` / `handleModify` / `HandleResNewOrder` / `HandleRequestProfile` همین‌طور است.
کد مرده (`HandleNewData` 504 ، `handleResCheckTradeMap`) هنوز `findOne` خالی دارد.

---

## ForexNews (`forex_news`) — اخبار اقتصادی ساعت‌دار ۷ روز (2026-10-14)
از پنل با `POST /api/tradingroom/set-news` (دکمه «ارسال به FundyNode» صفحه اخبار ادمین) ؛ هر ارسال کل مجموعه را جایگزین می‌کند.

| فیلد | نوع | توضیح |
|---|---|---|
| `news_id` | Number | شناسه خبر در پنل (`forex_news.id`) |
| `currency` | String | نماد ارز (USD ، EUR ، ... ؛ `ALL` = همه نمادها) |
| `title` | String | |
| `impact` | String | `high` / `medium` / `low` / `holiday` (ایندکس) |
| `start` | Number | زمان شروع، یونیکس **میلی‌ثانیه** UTC (ایندکس) |
| `duration` | Number | طول خبر به دقیقه (0 = لحظه‌ای) |
| `symbols` | [String] | نمادهای اضافه همین ارز از تنظیمات تریدینگ روم پنل (مثلا US30 برای USD) |

قاعده (`src/helpers/newsRule.js` ، `findNewsBlock`): حساب با `news_trading = false` از `start − gap` تا `start + duration + gap` روی نمادی که `title` آن کد ارز را دارد یا در `symbols` است (ALL ⇒ همه) معامله باز نمی‌کند ؛ فقط درجه‌های `news_impacts`.

## GetUpdate (`get_updates`) — صف دستور

| فیلد | توضیح |
|---|---|
| `handler` | کد دستور (`ACTION_HANDLER`، یا 40/301) |
| `message` | رشته کامل دستور که EA دریافت می‌کند |
| `keyid` | شناسه دستور (`update_id`)؛ `Date.now() % 1e9` |
| `platform` | `metatrader` / `panel` |
| `status` | `pending` (آماده تحویل) · `waiting` (منتظر تیکت مقصد) · `success` · `error` · `internal_error` (استفاده نمی‌شود) |
| `try_count` | تعداد پاسخ‌های دریافت‌شده |
| `side` | `buy, buy_limit, buy_stop, sell, sell_limit, sell_stop, none` |
| `description[]` | دلایل/خطاها (`text/code/MQL_NAME`) |
| `server, acc, ticket, symbol, vol, sl, tp, comment, magic` | سمت **اجراکننده** (معمولاً Master) |
| `origin_*` | سمت **کاربر**: server, acc, acc_meta, ticket, symbol, vol, open/close price/time/timestamp, sl, tp, comment, magic, commission, swap, profit |
| `origin_new_ticket/vol/commission` | برای partial: تیکت و حجم باقیمانده |
| `symbol_title` | نام استاندارد نماد |
| `created_at`, `updated_at` | |

ایندکس‌ها: `{acc, handler}`, `{server, handler}`, `{origin_acc, origin_ticket}`, `{acc, status, created_at}` و تکی‌ها.

چرخه عمر:
```
waiting ──(updateWaitings بعد از باز شدن مقصد)──► pending ──(GetUpdates تحویل، تا ۶۰ ثانیه)──► success | error  (با پاسخ 9xx)
```
- تحویل در `getUnprocessed`: `{origin_acc: acc, status:'pending', created_at >= now-60s}`.
- به‌روزرسانی در `updateStatus`: `{acc, handler, keyid}`.
- ⚠ دستورهایی که `origin_acc` ندارند (13, 11, 30, 40, 301) با `origin_acc = 0` ذخیره می‌شوند.

---

## TradeMap (`trade_maps`) — مهم‌ترین جدول
یک رکورد = یک معامله کاربر روی یک copier.

| گروه | فیلدها |
|---|---|
| سمت کاربر (`_src`) | `server, acc, ticket, symbol, vol, open_price, open_time, open_timestamp, sl, tp, close_price, close_time, close_timestamp, magic, comment, commission, swap, profit` |
| سمت Master (`_dist`) | همان فیلدها با پسوند `_dist` (ایندکس روی `close_timestamp_dist`) |
| مقادیر شرکت | `commission_final`, `swap_final` — محاسبه‌شده در Master (از 996 / 999) ؛ **عدد خام EA** (سنت در حساب سنتی) |
| ضریب copier (2026-10-11) | `vol_factor` و `cent` همان copier در لحظه ساخت معامله (`HandleResNewOrder` از `Account.copiers` ؛ پارشیال/پندینگ از TradeMap مادر). رکوردهای قدیمی ندارند ⇒ مثل حساب استاندارد با ضریب ۱ (پر کردن: `tools/backfill-trademap-vol-factor.mjs`) |
| مقادیر کاربر (2026-10-11) | `profit_user` ⇐ `profit_dist` ، `swap_user` ⇐ `swap_final` ، `commission_user` ⇐ `commission_final` ، هر کدام تقسیم بر ۱۰۰ در حساب سنتی (دو رقم اعشار) = **دلار واقعی روی Master**. با hook `pre('save')` از روی فیلدهای خام حساب می‌شوند |
| نماد | `symbol_title`, `symbol_weight`, `tick_value`, `tick_size` |
| وضعیت | `status`: `open, closed, pending, canceled, deleted` · `side` · `closing_type`: `single, partial, bulk, magic, all, none` · `partial_code` (گروه‌بندی تکه‌های partial: بخش‌های بسته و باقیمانده یک معامله یک کد دارند ؛ 0 = بدون بستن بخشی) · `platform` |
| `created_at` | |

ایندکس‌ها: `{acc_src, ticket_src, acc_dist, ticket_dist}`, `{acc_src, ticket_src}`, `{acc_src, acc_dist, status}`, `{acc_dist, ticket_dist}`.

- ساخته می‌شود در: `HandleResNewOrder` و `handleResPartialClose` (باقیمانده بستن بخشی ، از 2026-10-17) ؛ (در کد غیرفعال: open pending).
- `profit_final` در commit `3e4c08c` حذف شد و در Mongo برنگشت؛ فقط در داده ارسالی به پنل ساخته می‌شود (پایین).
- **⚠️ فیلدهای `_dist` و `commission_final`/`swap_final` در Mongo همیشه عدد خام EA هستند** (کمیسیون تجمیعی پارشیال‌ها با عدد تجمیعی EA مقایسه می‌شود و `vol_dist` حجم دستورهای پندینگ/پارشیال روی Master است). تبدیل به مقیاس کاربر فقط در `helpers/copierAmounts.toPanelTrade` هنگام ارسال به پنل (`TradeMapService.sync` ، `sync-acc-trades` ، `sync-all-trades`):
  - `vol_dist` ÷ units (۴ رقم اعشار) ؛ `profit_dist` ، `swap_dist` ، `commission_dist` ÷ units (۲ رقم) — units = ۱۰۰ برای copier سنتی ، وگرنه ۱
  - `profit_user` ، `swap_user` ، `commission_user` (بالا)
  - `profit_final` ، `swap_final` ، `commission_final` = `Z_user × (1 / vol_factor)` (۲ رقم) = دلار به اندازه معامله کاربر
  - حساب استاندارد با `vol_factor = 1` ⇒ همه مقادیر همان قبلی و `Z_user = Z_final`
  - `map_id` = `String(_id)` (2026-10-17) ⇒ کلید یکتای `plan_trades` پنل (partial_code و تیکت‌ها در بستن بخشی عوض/تکرار می‌شوند)
- **هم‌نامی `*_final`:** در Mongo `commission_final`/`swap_final` = مبلغ با نرخ شرکت که EA گزارش می‌کند (خام ، از profit قابل محاسبه نیست ⇒ باید ذخیره بماند) ؛ در داده ارسالی به پنل `*_final` = مبلغ به اندازه معامله کاربر. `profit_final` فقط در داده پنل ساخته می‌شود.
- در `/api/admin/trade-map/:accSrc` سمت src با نام `sender` و سمت dist با نام `mother` نمایش داده می‌شود.

---

## Symbol (`symbols`)
| فیلد | توضیح |
|---|---|
| `server` | سرور بروکر |
| `title` | نام استاندارد (`EURUSD`) — کلید تطبیق بین بروکرها |
| `symbol` | نام در این بروکر (`EURUSD_o`) |
| `tick_size, contract_size, tick_value, vol_step, vol_min, vol_max, digits, point` | از 989 |
| `weight` | از SymbolAlias (جفت‌ارز 1، فلز/کریپتو 2) |
| `margin, leverage, spread_min/max/avg_5/avg_50/last, commission, commission_min/max, swap` | از 401 |
| `updated_at` | String |

ایندکس یکتا: `{server, title}` و `{server, symbol}`.
⚠ در 401 نام‌گذاری `$min: commission_max` و `$max: commission_min` برعکس است (کمیسیون منفی است؛ پس «بیشترین هزینه» = کوچک‌ترین عدد) — عمدی به نظر می‌رسد.

## SymbolAlias (`symbol_alias`)
`{title (unique), alias[], weight}` — فقط نمادهایی که اینجا هستند وارد `symbols` می‌شوند.

## Broker (`brokers`)
`{title, server (unique), acc, diff_time}` — `diff_time` میلی‌ثانیه (از 401)؛ `acc` حسابی که دستورهای 11/13 برایش فرستاده می‌شود (دستی). کش ۵ دقیقه‌ای در `boot/cache.js`.

## LogRule (`log_rules`)
`{handler (unique), log}` — seed: همه کدهای اصلی `true`. کش ۱ دقیقه‌ای.

## RequestLog (`request_logs`)
`{handler, message, response, datetime, reqTime, resTime, duration}`.

## Usage (`usage`)
`{acc, cpu, ram, disk, net, datetime, timestamp}`.

## TradeMapCheck (`trade_map_checks`)
`{server/acc/ticket _src, server/acc/ticket _dist, type: existence|mismatch, desc, datetime, timestamp, notified}` — یکتا روی `{acc_src, ticket_src, acc_dist, ticket_dist, type}`.

## AccountReport (`account_reports`)
گزارش روزانه به ازای `{acc_src, acc_dist, date}` (یکتا): balance، equity، open_trades، profit_bl/eq و برای بالانس و اکوئیتی: initial / high / low روزانه و total high / low (هرکدام با `_time` و `_timestamp`).

## TelegramMessage / TelegramPermission
`{message, datetime}` و `{acc, rule}` — rule رشته‌ای است که با `acc_&_` شروع می‌شود.
