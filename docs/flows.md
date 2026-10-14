# جریان‌های کسب‌وکار

هر جریان با شماره خط/فایل مرجع آمده تا در تسک‌های بعدی سریع پیدا شود. «⚠» یعنی نکته‌ای که در [known-issues.md](known-issues.md) هم ثبت شده.

## مسیر مشترک همه پیام‌ها (`src/controllers/spider.js` → `sendMessage`)

1. `getHandlerOfMsg` = `Number(parts[1])` ، `getTimeOfMsg` = `Number(parts[3])`
2. اگر `timestamp < Date.now() - 60_000` → `{status:'error', message:'Expired Message!!!'}`
3. `setRequestLog(handler, message)` — اگر LogRule آن handler فعال باشد یک RequestLog می‌سازد (فقط 500 و 501 پاسخ و مدت زمان را روی آن ثبت می‌کنند)
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
- اگر حساب پیدا نشود → پاسخ `{status:'error', message:'Account Not Found!!!'}` (همین رفتار در 501 کاربر، 502 و 302)
- `open_timestamp = open_time + diff_time`

**processNewOrder** (اگر `account.copy == false` → پیام `| Account Is Disabled |`)
برای هر `copier` با `copy == true`:
1. **تکراری بودن** (`isDuplicatedOrder`): اگر TradeMap با `(acc_src, ticket_src, acc_dist=copier.acc, status ∈ open|pending)` وجود دارد → رد می‌شود.
   - حالت خاص: اگر آن TradeMap `pending` است و سفارش جدید `buy`/`sell` است یعنی پندینگ مبدا فعال شده → دستور `OPEN_PENDING_ORDER (25)` برای Master ساخته می‌شود. ⚠ پاسخ آن (975) غیرفعال است.
2. **اعتبار نماد** (`isValidSymbols` در `helper.js`):
   - اگر حساب `server` و `acc_meta` دارد (متاتریدر دمو): `symbol_a` = Symbol(`account.server`, `symbol`) و `symbol_b` = Symbol(`copier.server`, `title = symbol_a.title`) — تبدیل نماد بین دو بروکر از طریق `title`.
   - وگرنه (پنل): `symbol_b` = Symbol(`copier.server`, `symbol`) و `symbol_a = symbol_b` (پنل نام نماد بروکر Master را می‌فرستد).
3. **امکان سفارش** (`isOrderPossible`): آخرین گزارش 42 حساب از Redis (`AccReportService.get(account.acc)`) خوانده می‌شود:
   - اگر گزارشی نباشد (EA در ۲ دقیقه اخیر 42 نفرستاده) → با ثابت `ALLOW_ORDER_WITHOUT_ACC_REPORT` (فعلاً `true`) سفارش بدون بررسی پذیرفته و یک `warn` لاگ می‌شود.
   - هزینه سفارش روی نماد Master (`symbol_b`)، با `lots = vol / vol_min`: `commission = |commission_max × lots|` ، `spread_value = vol × tick_value × (spread_avg_5 / point)` ، `margin = margin × lots`.
   - شرط ۱: `equity − drawdown > commission + 2×spread_value + margin` وگرنه `free equity is not enough`.
   - شرط ۲: `free_margin > commission + 2×spread_value + margin` وگرنه `free margin is not enough`.
   - در صورت رد، مثل نماد نامعتبر، برای حساب دارای `acc_meta` دستور `CLOSE_ORIGIN (23)` ساخته می‌شود.
4. `GetUpdateService.prepareOrderData` → سند `get_updates` با `status='pending'`:
   - `handler = ACTION_HANDLER[type]` ، `vol` = همان حجم مبدا (کپی ۱:۱؛ `vol_factor` استفاده نمی‌شود) ، `sl/tp` = همان مبدا (`getWiderSl/Tp` کامنت شده) ، `magic = account.acc` ، `slippage = 50`
   - فیلدهای `origin_*` اطلاعات سمت کاربر را نگه می‌دارند.
5. اگر نماد نامعتبر بود یا سفارش ممکن نبود و حساب `acc_meta` دارد → دستور `CLOSE_ORIGIN (23)` تا معامله روی MT دمو بسته شود.

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
بسته شدن مستقیم روی Master (مثلاً SL/TP): TradeMap با `(acc_dist=acc, ticket_dist=closed_ticket, status='open')` بسته می‌شود (`close_*_dist`, `profit_dist`, `swap_dist`, `swap_final`, `commission_dist`, `commission_final`) و sync `closed` می‌شود. دستوری ساخته نمی‌شود. زمان بستن باید میلی‌ثانیه از EA برسد و `diff_time` اعمال نمی‌شود. اگر معامله باز پیدا نشود (مثلاً قبلاً با 996 بسته شده) باز هم پاسخ `success` با `trade: ''` برمی‌گردد.

---

## ۳. مدیفای (502) — `handleModify.js`
- `acc_fp` از اندیس 4 پیام؛ `-1` ⇒ متاتریدر.
- برای هر آیتم (ticket, sl, tp, open_price) و هر copier: `prepareModifyData` → `MODIFY (3)` (`pending` اگر TradeMap باز پیدا شد، وگرنه `waiting` با `-1`).
  - اگر sl یا tp ≠ 0 و TradeMap نیست، سند سفارش اولیه از GetUpdate خوانده می‌شود (side/symbol آن فعلاً فقط برای `getWiderSl/Tp` کامنت‌شده لازم است).
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
- **301 → دستور 301 → تأیید 399**: لیست `symbol/commission/swap` همه نمادهای یک server.

## ۱۰. همگام‌سازی با لاراول — `TradeMapService.sync`
| رویداد | کجا |
|---|---|
| `created` | HandleResNewOrder (موفق) |
| `modified` | HandleResModify |
| `updated` | HandleNewOrder.processPartial |
| `closed` | HandleResClose ، handleClose (master) |

- POST به `https://panel.fundyprop.com/api/sync-trade` با `{event, data:[tradeMap]}` و هدر `X-API-Key: FUNDYPANEL_API_KEY`، timeout ۱۰ ثانیه.
- خطا فقط لاگ می‌شود (بدون retry). لاراول می‌تواند با `/api/tradingroom/sync-*` داده را pull کند.

### ۱۰-۱. وضعیت لحظه‌ای حساب‌ها (42 → Redis → FundyPanel)
```
EA Master ──42 هر ثانیه──► HandleAccReport ──► Redis (acc_report:{magic}, TTL 2m)
                                                   │
worker.js ─ startAccReportSync (هر ۱ ثانیه، فقط یک worker با قفل Redis) ─┘──► POST FUNDYPANEL_ACC_REPORT_URL
```
- حلقه در `src/schedules/accReportSync.js` است (نه BullMQ)؛ اجرای بعدی فقط بعد از پایان قبلی (بدون همپوشانی).
- قفل `lock:acc_report_sync` (۱۰ ثانیه، هر تیک تمدید) تضمین می‌کند حتی با چند worker فقط یکی ارسال کند؛ اگر آن worker بمیرد، دیگری حداکثر پس از ۱۰ ثانیه ادامه می‌دهد.
- اگر `FUNDYPANEL_ACC_REPORT_URL` خالی باشد ارسال غیرفعال است. API پنل هنوز ساخته نشده و آدرس فعلی فرضی است.
- بدنه (هدر `X-API-Key: FUNDYPANEL_API_KEY`، timeout ۵ ثانیه):
```json
{ "sent_at": 1790502064154,
  "accounts": [ { "acc": 342, "status": "trading", "online": true, "master_acc": 1006135456,
                  "equity": 1300, "balance": 1250, "open_trades": 2, "closed_trades": 41,
                  "timestamp": 1790502050779, "age_ms": 1375 } ] }
```
  - `accounts` = اجتماع حساب‌های دارای گزارش زنده در Redis و حساب‌های `status='trading'` در Mongo. حساب trading بدون گزارش با `online=false` و مقادیر `null` می‌آید؛ حساب دارای گزارش که trading نیست `status=null` دارد.
  - `age_ms` = فاصله زمان دریافت گزارش در سرور تا زمان ارسال.
  - **از 2026-10-11:** `free_margin` / `used_margin` به پنل نمی‌روند (در Redis برای `isOrderPossible` می‌مانند) و به جایشان `open_trades` / `closed_trades` (پیام 42 i=8/9 ، نامعلوم ⇒ `null`).
  - **`balance` و `equity` به مقیاس کاربر تبدیل می‌شوند** (`helpers/copierAmounts.toUserBalance`):
    `initial + (مقدار خام − initial × units) / (units × vol_factor)` با دو رقم اعشار ؛ units = ۱۰۰ برای copier سنتی.
    مثال: initial 1000 ، سنتی ، `vol_factor` 0.5 ، ایکوئیتی خام 99000 سنت ⇒ `980`. حساب استاندارد با ضریب ۱ ⇒ همان عدد خام.
    فرمول متن درخواست کاربر قدر مطلق داشت؛ با علامت پیاده شد (وگرنه ضرر کاربر سود نمایش داده می‌شد).
  - چرا اینجا و نه در پنل یا هنگام ذخیره 42: Redis باید خام بماند (`isOrderPossible`)، و worker همین حالا هر ثانیه یک کوئری Mongo روی حساب‌ها می‌زند؛
    همان کوئری با فیلدهای `initial` و `copiers` (و حساب‌های دارای گزارش) کافی است ⇒ بدون کوئری اضافه. copier = همان `master_acc` گزارش ، وگرنه اولین copier فعال ؛ برای حسابی با چند رکورد، تازه‌ترین رکورد.
  - اگر لیست خالی باشد چیزی ارسال نمی‌شود. خطا retry ندارد (تیک بعدی داده تازه را می‌فرستد)؛ لاگ خطا فقط اولین بار و هر ۶۰ خطای پیاپی.

## ۱۱. جریان پنل (Trading Room)
1. پنل پیام 500/501/502 را با `acc_fp` می‌فرستد (acc = کد حساب کاربر در پراپ).
2. پاسخ 500 شامل `keyid` است.
3. پنل با `GET /api/tradingroom/GetUpdates/:acc/:keyid` آخرین سند `platform='panel'` را می‌خواند تا status/description اجرا را ببیند. توجه: فیلتر روی `GetUpdate.acc` است که برای دستورهای کپی = acc حساب **Master** است.
4. در مسیر پنل، خطای باز شدن باعث CLOSE_ORIGIN نمی‌شود (پنل معامله مبدا متاتریدری ندارد).

## ۱۲. کنترل صحت کپی (غیرفعال)
`sendForCheck` → `Account.check_time` → job هر ۳۰ ثانیه → دستور `CHECK_TRADES (30)` → پاسخ 970 مقایسه با TradeMap و ساخت `TradeMapCheck` (`existence` / `mismatch`) → اعلان بله. همه حلقه‌های این زنجیره فعلاً کامنت شده‌اند.

## ۱۳. مدیریت ریسک / دراودان
**فعال:** تشخیص دراودان در EA حساب Master انجام می‌شود و با پیام **41** (`HandleDrawdown.js`) به FundyNode اطلاع داده می‌شود؛ FundyNode حساب تریدر (`acc = magic` و متصل به آن Master) را `status='failed'` و `copy=false` (روی حساب و همه copier ها) می‌کند. از این به بعد `processNewOrder` برای این حساب `| Account Is Disabled |` برمی‌گرداند. بستن معاملات باز در این مسیر با FundyNode نیست.

**غیرفعال (کد قدیمی):** کد مرده در `AccountService.js` (کامنت‌شده)، `HandleOpenTrades.js` (400) و `HandleNewData.js` (504): محاسبه `profit_bl/profit_eq` هر copier، گزارش روزانه `AccountReport`، و در صورت رسیدن اکوئیتی به `drawdown`: `BULK_CLOSE` روی Master + `copy=false` + `CLOSE_ALL_ORIGIN`/`CLOSE_MAGIC`. فیلدهای `profit_bl/profit_eq` از اسکیمای copier حذف شده‌اند، پس فعال‌سازی مجدد نیاز به بازطراحی دارد.

## قاعده ترید در خبر برای سفارش متاتریدر کاربر (2026-10-14، branch `claude/news-trading-rule`)

- پنل (FundyPanel) سفارش‌های FP Trader را خودش در بازه خبر رد می‌کند؛ ولی معامله‌ای که کاربر مستقیم از متاتریدر خودش (`acc_meta`) باز می‌کند فقط از نود می‌گذرد (KI-38 پنل).
- `HandleNewOrder` ⇒ `isOrderPossible`: اول، فقط برای `data.platform === 'metatrader'`، `findNewsBlock(account, symbol_a.title)` ؛ بسته ⇒ `status=false` با توضیح `news trading is not allowed on this account / ...` ⇒ مثل بقیه موارد ناممکن معامله مبدا بسته می‌شود (`prepareCloseOriginData`، فقط وقتی `acc_meta` هست).
- سفارش‌های `platform = 'panel'` چک نمی‌شوند: پنل خودش چک کرده و Limit/Stop پنل که قبل از بازه ثبت شده باید داخل بازه هم فعال شود (تصمیم صاحب پروژه).
- داده: فیلدهای خبر Account (از `set-acc` / `set-acc-news`) و مجموعه `forex_news` (از `set-news`) — data-models.
- **مبنای زمان فقط UTC:** `start` یونیکس میلی‌ثانیه و زمان معامله `Date.now()` سرور هنگام رسیدن سفارش؛ ساعت بروکر (open_timestamp) و TZ پروسه نقشی ندارند.
- تست: `node tools/news-rule-test.mjs` (مونگوی توسعه 27117، دیتابیس جدا که آخر کار پاک می‌شود) — با `TZ=Asia/Tehran` و `TZ=America/New_York` هم 18/18.
