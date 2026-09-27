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
| `acc_report:{magic}` | string (JSON) با TTL ۲ دقیقه | آخرین گزارش 42: `{acc, master_acc, free_margin, used_margin, equity, balance, timestamp, received_at}` |
| `acc_reports:index` | sorted set | member = magic ، score = timestamp آخرین گزارش؛ برای پیدا کردن همه حساب‌ها بدون SCAN. عضوهایی که کلیدشان منقضی شده در `getAll` پاک می‌شوند. |
| `lock:acc_report_sync` | string با TTL ۱۰ ثانیه | قفل تک‌نسخه‌ای حلقه ارسال به پنل در worker |

دسترسی فقط از طریق `src/services/AccReportService.js` (`save` / `get(acc)` / `getAll()`)؛ چون در Redis است همه پروسس‌های PM2 cluster و worker داده یکسان می‌بینند.

---

## Account (`accounts`)
حساب کاربر (مبدا). توسط FundyPanel/دستی ساخته می‌شود؛ FundyNode آن را ایجاد نمی‌کند (جز کد مرده 504).

| فیلد | نوع | پیش‌فرض | توضیح |
|---|---|---|---|
| `username` | String | `''` | در پروفایل 40 ارسال می‌شود |
| `acc_meta` | Number | 0 | شماره MT دموی کاربر؛ در پراپ بدون متاتریدر = 0 |
| `acc` | Number | 0 | کد حساب معاملاتی کاربر در پراپ / در کپی ساده = شماره MT |
| `server` | String | `''` | سرور بروکر حساب کاربر |
| `initial` | Number | | بالانس اولیه |
| `drawdown` | Number | 0 | **حداقل اکوئیتی مجاز به دلار** (مثلاً 950) — نه درصد |
| `commission_rate`, `swap_rate` | Number | 0 | در پروفایل 40 ارسال می‌شود |
| `copy` | Boolean | false | کپی برای کل حساب فعال است؟ |
| `copiers[]` | زیرسند | `[]` | `{acc, server, copy, vol_factor=1}` — حساب‌های Master مقصد |
| `status` | enum | `stopped` | `trading / passed / failed / stopped` (در کد استفاده نمی‌شود) |
| `check_time` | Number | 0 | زمان درخواست بررسی صحت کپی (عملاً استفاده نمی‌شود) |
| `created_at` | Number | now | |

ایندکس‌ها: `acc`, `acc_meta`, `server`, `status`, `{acc, copiers.acc}`, `{copy, check_time}`.

جستجوی حساب: متاتریدر → `{acc_meta}` ، پنل → `{acc}`.

---

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
| مقادیر شرکت | `commission_final`, `swap_final` — محاسبه‌شده در Master (از 996 / 999) |
| نماد | `symbol_title`, `symbol_weight`, `tick_value`, `tick_size` |
| وضعیت | `status`: `open, closed, pending, canceled, deleted` · `side` · `closing_type`: `single, partial, bulk, magic, all, none` · `partial_code` (گروه‌بندی تکه‌های partial) · `platform` |
| `created_at` | |

ایندکس‌ها: `{acc_src, ticket_src, acc_dist, ticket_dist}`, `{acc_src, ticket_src}`, `{acc_src, acc_dist, status}`, `{acc_dist, ticket_dist}`.

- ساخته می‌شود در: `HandleResNewOrder` (و در کد غیرفعال: partial / open pending).
- `profit_final` در commit `3e4c08c` حذف شد.
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
