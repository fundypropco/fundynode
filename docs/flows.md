# جریان‌های کسب‌وکار

هر جریان با شماره خط/فایل مرجع آمده تا در تسک‌های بعدی سریع پیدا شود. «⚠» یعنی نکته‌ای که در [known-issues.md](known-issues.md) هم ثبت شده.

## مسیر مشترک همه پیام‌ها (`src/controllers/spider.js` → `sendMessage`)

1. `getHandlerOfMsg` = `Number(parts[1])` ، `getTimeOfMsg` = `Number(parts[3])`
2. اگر `timestamp < Date.now() - 60_000` → `{status:'error', message:'Expired Message!!!'}`
3. `setRequestLog(handler, message)` — اگر LogRule آن handler فعال باشد یک RequestLog می‌سازد (فقط 500 آن را تکمیل می‌کند)
4. `switch(handler)` → فایل handler مربوطه. خطای پرتاب‌شده → middleware خطا → HTTP 500.

---

## ۱. سفارش جدید (500) — `HandleNewOrder.js`

```
MT دمو / پنل ──500──► processMessage ──► partial? ──no──► processNewOrder
                                             └─yes──► processPartial  (بخش ۴)
```

**processMessage**
- اگر `acc_fp` ≠ 0 → `platform='panel'`، `Account.findOne({acc})`، `diff_time=0`
- وگرنه → `Account.findOne({acc_meta: acc})`، `diff_time` از `getBrokerData(account.server)`
- `open_timestamp = open_time + diff_time`

**processNewOrder** (اگر `account.copy == false` → پیام `| Account Is Disabled |`)
برای هر `copier` با `copy == true`:
1. **تکراری بودن** (`isDuplicatedOrder`): اگر TradeMap با `(acc_src, ticket_src, acc_dist=copier.acc, status ∈ open|pending)` وجود دارد → رد می‌شود.
   - حالت خاص: اگر آن TradeMap `pending` است و سفارش جدید `buy`/`sell` است یعنی پندینگ مبدا فعال شده → دستور `OPEN_PENDING_ORDER (25)` برای Master ساخته می‌شود. ⚠ پاسخ آن (975) غیرفعال است.
2. **اعتبار نماد** (`isValidSymbols` در `helper.js`):
   - اگر حساب `server` و `acc_meta` دارد (متاتریدر دمو): `symbol_a` = Symbol(`account.server`, `symbol`) و `symbol_b` = Symbol(`copier.server`, `title = symbol_a.title`) — تبدیل نماد بین دو بروکر از طریق `title`.
   - وگرنه (پنل): `symbol_b` = Symbol(`copier.server`, `symbol`) و `symbol_a = symbol_b` (پنل نام نماد بروکر Master را می‌فرستد).
3. **امکان سفارش** (`isOrderPossible`): فعلاً همیشه `true` (بعد از `return` اولیه، محاسبه free equity کد مرده است).
4. `GetUpdateService.prepareOrderData` → سند `get_updates` با `status='pending'`:
   - `handler = ACTION_HANDLER[type]` ، `vol` = همان حجم مبدا (کپی ۱:۱؛ `vol_factor` استفاده نمی‌شود) ، `sl/tp` = همان مبدا (`getWiderSl/Tp` کامنت شده) ، `magic = account.acc` ، `slippage = 50`
   - فیلدهای `origin_*` اطلاعات سمت کاربر را نگه می‌دارند.
5. اگر نماد نامعتبر بود و حساب `acc_meta` دارد → دستور `CLOSE_ORIGIN (23)` تا معامله روی MT دمو بسته شود.

پاسخ: `message` شامل `| order processed for copier X |` یا دلیل رد؛ `data.keyid` = keyid آخرین سند ساخته‌شده.

### ۱-۱. نتیجه باز شدن روی Master (999/998/995/994/993/992) — `HandleResNewOrder.js`
1. `updateStatus` — سند را با `{acc, handler, keyid}` پیدا، `status` و `try_count++`؛ در موفقیت `ticket` مقصد ذخیره می‌شود؛ در خطا `description` += `text/code/MQL_NAME`.
2. **موفق**:
   - ساخت `TradeMap` (سمت src از `origin_*` سند GetUpdate، سمت dist از پیام پاسخ + `diff_time` بروکر Master)؛ `status='open'` برای market و `'pending'` برای limit/stop؛ `tick_value`, `tick_size`, `symbol_weight` از Symbol.
   - `TradeMapService.sync({event:'created'})` → لاراول
   - `updateWaitings(origin_acc, origin_ticket, ticket)` — دستورهای `waiting` همان تیکت مبدا را `pending` کرده و `-1` را با تیکت واقعی جایگزین می‌کند.
3. **ناموفق**: اگر حساب مبدا **دقیقاً یک** copier دارد و `platform == 'metatrader'` → `CLOSE_ORIGIN (23)` با توضیح `Copier Error: ...` (معامله کاربر هم بسته شود تا ناهمخوانی نماند).

---

## ۲. بستن کامل (501) — `handleClose.js`

### ۲-۱. گزارش کاربر (`extra != -1234`)
`processClose` برای هر copier فعال:
1. `openTradeMap` = TradeMap با `acc_src, ticket_src=closed_ticket, acc_dist=copier.acc, status='open'`
2. `prepareCloseData` → دستور `CLOSE (4)`؛ اگر TradeMap هنوز وجود ندارد (Master هنوز باز نکرده) `status='waiting'` و `ticket=-1`.
3. سمت src در TradeMap به‌روز می‌شود: `close_price_src`, `close_time_src`, `swap_src`, `profit_src` و منطق کمیسیون (بخش ۶). **sync در این مرحله انجام نمی‌شود.**

### ۲-۲. نتیجه بستن روی Master (996) — `HandleResClose.js`
- `OK CLOSE`: TradeMap های `(acc_dist, ticket_dist)` → رکورد `open` بسته می‌شود: `close_*_dist`, `profit_dist`, `swap_dist`, `swap_final`, `commission_dist`, `commission_final`, `status='closed'`, `closing_type='single'` → sync `closed`.
- `OK DELETE` (حذف پندینگ): فقط `closed_timestamp` پارس می‌شود؛ ⚠ چون رکورد `pending` است و فقط `open` جستجو می‌شود، TradeMap به‌روز نمی‌شود.

### ۲-۳. گزارش خود Master (`extra == -1234`)
بسته شدن مستقیم روی Master (مثلاً SL/TP): TradeMap با `(acc_dist=acc, ticket_dist=ticket, status='open')` بسته و sync `closed` می‌شود. دستوری ساخته نمی‌شود.

---

## ۳. مدیفای (502) — `handleModify.js`
- `acc_fp` از اندیس 4 پیام؛ `-1` ⇒ متاتریدر.
- برای هر آیتم (ticket, sl, tp, open_price) و هر copier: `prepareModifyData` → `MODIFY (3)` (`pending` اگر TradeMap باز پیدا شد، وگرنه `waiting` با `-1`).
  - ⚠ اگر sl یا tp ≠ 0 و TradeMap نیست، کد سند سفارش اولیه را از GetUpdate می‌خواند و بدون null-check از `doc.side` استفاده می‌کند.
- پاسخ 997 (`HandleResModify.js`): TradeMap باز → `open_price/sl/tp` هر دو سمت → sync `modified`.
- پیام MODIFY قیمت ورود (`origin_open_price`) را هم می‌فرستد تا پندینگ‌ها جابه‌جا شوند.

---

## ۴. بستن بخشی (Partial Close)

در متاتریدر ۴ بستن بخشی یک تیکت، تیکت قدیم را می‌بندد و برای باقیمانده تیکت جدید می‌سازد. EA اطلاعات آن را در اندیس 4 پیام‌های 500 (برای تیکت جدید) یا 501 (برای تیکت بسته‌شده) می‌فرستد.

- در 500: آیتمی با `open_ticket == ticket` ؛ در 501: آیتمی با `closed_ticket == ticket`.
- `processPartial` (هر دو فایل) برای هر copier: دستور `PARTIAL_CLOSE (22)` با `vol = closed_vol` و `origin_new_ticket/vol/commission`؛ `waiting` اگر TradeMap باز نیست.
- سمت src در TradeMap: `vol_src = closed_vol` و فیلدهای بستن؛ در نسخه 500 sync `updated` هم انجام می‌شود.
- ⚠ پاسخ 978 (`handleResPartialClose.js`) در کنترلر **غیرفعال** است؛ بنابراین بستن رکورد dist، ساخت TradeMap جدید برای باقیمانده و آزادسازی waiting ها انجام نمی‌شود.
- ⚠ اگر EA برای یک partial هم 500 و هم 501 بفرستد، دو دستور PARTIAL_CLOSE ساخته می‌شود — باید با رفتار EA چک شود.

---

## ۵. سفارش‌های پندینگ (Limit / Stop)
1. 500 با type `BUYLIMIT`... → دستور 5–8 → پاسخ 995–992 → TradeMap با `status='pending'`.
2. وقتی پندینگ مبدا فعال شود، 500 دوباره با همان ticket و type `BUY`/`SELL` می‌آید → `isDuplicatedOrder` → `OPEN_PENDING_ORDER (25)`.
3. ⚠ پاسخ 975 غیرفعال است؛ TradeMap در وضعیت `pending` می‌ماند و بعد از آن close/modify کاربر (که دنبال `open` می‌گردند) به `waiting` می‌افتند.

---

## ۶. منطق کمیسیون (تکرارشونده در چند handler)
در MT5 بعد از partial چند رکورد TradeMap با **یک تیکت** وجود دارد و کمیسیون گزارش‌شده **تجمیعی** است:
```
sum = Σ commission_x  روی همه رکوردهای همان تیکت
if (reported < sum)            // منفی‌تر = بیشتر
    diff = round2(reported - sum)
    if (tradeMaps.length == 1) record.commission_x = reported
    else                        record.commission_x += diff
```
در `HandleResClose` همین منطق برای `commission_final` هم اجرا می‌شود.

---

## ۷. بستن معامله مبدا (CLOSE_ORIGIN 23 → پاسخ 977) — `HandleResCloseOrigin.js`
زمانی ساخته می‌شود که کپی ممکن نیست (نماد نامعتبر، یا خطای باز شدن روی تنها copier). پاسخ 977: آخرین TradeMap با `(acc_src, ticket_src)` → فیلدهای بستن سمت src (اگر TradeMap وجود داشته باشد). sync انجام نمی‌شود.

---

## ۸. ورود بروکر و نمادها
```
(401) SAMPLE TRADE از هر EA ──► Broker{server, title, diff_time}  +  Symbol (اسپرد/کمیسیون/margin) اگر در SymbolAlias باشد
POST /api/admin/seed-symbol-alias ──► SymbolAlias (۲۸ جفت‌ارز weight=1 ، فلزات و BTC/ETH weight=2)
POST /api/admin/seed-broker-symbols/:server ──► دستور 13 برای Broker.acc ──► (987) لیست نمادها ──► Symbol{title, symbol, weight}
POST /api/admin/seed-broker-symbols-data/:server ──► دستور 11 برای هر Symbol ──► (989) ──► contract_size, tick_*, vol_*, digits, point
```
- `normalizeSymbol`: حذف پیشوند/پسوند (`__EURUSD.i--` → `EURUSD`، `EURUSD_o` → `EURUSD`) و upper-case.
- `Broker.acc` توسط 401 پر **نمی‌شود**؛ برای seed باید دستی تنظیم شده باشد.
- `brokerSymbolsSeeder` اگر دستور 13 هنوز pending باشد فقط `created_at` آن را تازه می‌کند (به‌خاطر پنجره ۶۰ ثانیه‌ای GetUpdates).

## ۹. پروفایل و نرخ نمادها (برای EA)
- **302 → دستور 40 → تأیید 960**: EA پروفایل کاربر (magic = Account.acc) را می‌خواهد؛ پاسخ: username، commission_rate، swap_rate، drawdown، server، زمان آخرین بستن (از TradeMap)، initial و `initial - drawdown`.
- **301 → دستور 301 → تأیید 399**: لیست `symbol/commission/swap` همه نمادهای یک server. ⚠ در حال حاضر خطا می‌دهد (known-issues).

## ۱۰. همگام‌سازی با لاراول — `TradeMapService.sync`
| رویداد | کجا |
|---|---|
| `created` | HandleResNewOrder (موفق) |
| `modified` | HandleResModify |
| `updated` | HandleNewOrder.processPartial |
| `closed` | HandleResClose ، handleClose (master) |

- POST به `https://panel.fundyprop.com/api/sync-trade` با `{event, data:[tradeMap]}` و هدر `X-API-Key: FUNDYPANEL_API_KEY`، timeout ۱۰ ثانیه.
- خطا فقط لاگ می‌شود (بدون retry). لاراول می‌تواند با `/api/tradingroom/sync-*` داده را pull کند.

## ۱۱. جریان پنل (Trading Room)
1. پنل پیام 500/501/502 را با `acc_fp` می‌فرستد (acc = کد حساب کاربر در پراپ).
2. پاسخ 500 شامل `keyid` است.
3. پنل با `GET /api/tradingroom/GetUpdates/:acc/:keyid` آخرین سند `platform='panel'` را می‌خواند تا status/description اجرا را ببیند. توجه: فیلتر روی `GetUpdate.acc` است که برای دستورهای کپی = acc حساب **Master** است.
4. در مسیر پنل، خطای باز شدن باعث CLOSE_ORIGIN نمی‌شود (پنل معامله مبدا متاتریدری ندارد).

## ۱۲. کنترل صحت کپی (غیرفعال)
`sendForCheck` → `Account.check_time` → job هر ۳۰ ثانیه → دستور `CHECK_TRADES (30)` → پاسخ 970 مقایسه با TradeMap و ساخت `TradeMapCheck` (`existence` / `mismatch`) → اعلان بله. همه حلقه‌های این زنجیره فعلاً کامنت شده‌اند.

## ۱۳. مدیریت ریسک / دراودان (غیرفعال)
کد مرده در `AccountService.js` (کامنت‌شده)، `HandleOpenTrades.js` (400) و `HandleNewData.js` (504): محاسبه `profit_bl/profit_eq` هر copier، گزارش روزانه `AccountReport`، و در صورت رسیدن اکوئیتی به `drawdown`: `BULK_CLOSE` روی Master + `copy=false` + `CLOSE_ALL_ORIGIN`/`CLOSE_MAGIC`. فیلدهای `profit_bl/profit_eq` از اسکیمای copier حذف شده‌اند، پس فعال‌سازی مجدد نیاز به بازطراحی دارد.
