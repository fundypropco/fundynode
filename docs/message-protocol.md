# پروتکل پیام

همه ارتباط با اکسپرت‌های متاتریدر (و بخشی از ارتباط با پنل) با **رشته‌های متنی** انجام می‌شود.
منبع حقیقت: توابع `processMessage()` در هر فایل `src/services/handlers/*` (ورودی) و `makeMsgForHandler()` در `src/helpers/helper.js` (خروجی).

## ۱. ساختار کلی

```
<acc-part> , <handler> , <info> , <timestamp> , <extra>
   [0]         [1]        [2]        [3]          [4]
```

- جداکننده سطح اول: `,` (پس **هیچ فیلدی نباید کاما داشته باشد** — مثلاً comment سفارش)
- `acc-part`: یا فقط شماره حساب (`1006135456`) یا `acc_originAcc_clusterNo` (`1006135456_123_1`). پارسرها با `split('_')[0]` یا `replace(/_.*/, '')` فقط بخش اول را برمی‌دارند.
- جداکننده‌های داخل `info`:
  - `_&_` بین فیلدها
  - `_@_` بین آیتم‌ها (چند تیکت / چند رکورد)
  - `_=_` بین کلید و مقدار (فقط 989)
  - `_$_` بین server و لیست نمادها (فقط خروجی 301)
- `info[0]` معمولاً برچسب متنی است (`NEW ORDER`, `OK OPEN BUY`, `FAIL ...`)؛ در پاسخ‌ها وجود `ok` (case-insensitive) یعنی موفق.
- `timestamp` (اندیس 3): کنترلر آن را با `Date.now() - 60_000` مقایسه می‌کند ⇒ باید **میلی‌ثانیه** باشد؛ پیام قدیمی‌تر از ۶۰ ثانیه با `Expired Message!!!` رد می‌شود.
- `extra` (اندیس 4): در پاسخ‌ها = `keyid` دستور؛ در رویدادهای کاربر = `-1` یا اطلاعات partial؛ در 502 = `acc_fp`؛ در 501 مقدار `-1234` یعنی گزارش از Master.

## ۲. جدول کدها

### ۲-۱. کدهای دستور خروجی (`ACTION_HANDLER` در `src/helpers/constant.js`)

| کد | نام | اجراکننده | کد پاسخ | handler پاسخ | فعال؟ |
|---|---|---|---|---|---|
| 1 | BUY | Master | 999 | HandleResNewOrder | ✅ |
| 2 | SELL | Master | 998 | HandleResNewOrder | ✅ |
| 3 | MODIFY | Master | 997 | HandleResModify | ✅ |
| 4 | CLOSE | Master | 996 (و 991 برای DELETE طبق کامنت) | HandleResClose | ✅ (991 مسیریابی نشده) |
| 5 | BUYLIMIT | Master | 995 | HandleResNewOrder | ✅ |
| 6 | BUYSTOP | Master | 994 | HandleResNewOrder | ✅ |
| 7 | SELLLIMIT | Master | 993 | HandleResNewOrder | ✅ |
| 8 | SELLSTOP | Master | 992 | HandleResNewOrder | ✅ |
| 11 | BROKER_SYMBOL_DATA | هر حساب بروکر | 989 | HandleResBrokerSymbolData | ✅ |
| 13 | BROKER_SYMBOLS | هر حساب بروکر | 987 | HandleResBrokerSymbols | ✅ |
| 20 | CLOSE_ALL_ORIGIN | MT کاربر | 980 | HandleResCloseAllOrigin | ❌ |
| 21 | BULK_CLOSE | Master | 979 | handleResBulkClose | ❌ |
| 22 | PARTIAL_CLOSE | Master | 978 | handleResPartialClose | ❌ (ولی دستورش هنوز ساخته می‌شود!) |
| 23 | CLOSE_ORIGIN | MT کاربر | 977 | HandleResCloseOrigin | ✅ |
| 25 | OPEN_PENDING_ORDER | Master | 975 | HandleResOpenPendingOrder | ❌ (دستورش ساخته می‌شود) |
| 26 | CLOSE_MAGIC | Master | 974 | HandleResCloseMagic | ❌ |
| 30 | CHECK_TRADES | MT کاربر | 970 | handleResCheckTradeMap | ❌ |
| 40 | (PROFILE SET) | EA درخواست‌کننده | 960 | HandleResRequestProfile | ✅ |
| 301 | (SYMBOL RATES) | EA درخواست‌کننده | 399 | HandleResSymbolData | ✅ |

قاعده: `کد پاسخ = 1000 - کد دستور`؛ پارسرها `data.handler = 1000 - parseInt(parts[1])` می‌کنند تا با `GetUpdate.handler` تطبیق دهند. استثناها: 399→301 و 960→40 که ثابت نوشته شده‌اند.

### ۲-۲. رویدادهای ورودی (از EA یا پنل)

| کد | نام | handler | فعال؟ |
|---|---|---|---|
| 41 | DRAWDOWN (Master اعلام می‌کند تریدر دراودان خورده) | HandleDrawdown | ✅ |
| 300 | USAGE (CPU/RAM سرور EA) | HandleUsage | ✅ |
| 301 | REQUEST SYMBOL RATES | HandleSymbolData | ✅ |
| 302 | REQUEST PROFILE | HandleRequestProfile | ✅ |
| 400 | OPEN_TRADES (سود معاملات باز) | HandleOpenTrades | ❌ |
| 401 | SAMPLE TRADE (اطلاعات بروکر و نماد) | handleSampleTrade | ✅ |
| 402 | AVAILABLE_EXPERT | — | فقط در LogRule |
| 500 | NEW ORDER | HandleNewOrder | ✅ |
| 501 | NEW CLOSE | handleClose | ✅ |
| 502 | NEW MODIFY | handleModify | ✅ |
| 504 | DETAIL (بالانس/اکوئیتی) | HandleNewData | ❌ |

## ۳. پیام‌های ورودی (جزئیات)

اندیس‌ها روی `info.split('_&_')` هستند.

### 500 — NEW ORDER (`HandleNewOrder.js`)
```
acc,500,NEW ORDER_&_ticket_&_symbol_&_type_&_vol_&_open_price_&_open_time_&_sl_&_tp_&_commission_&_magic_&_comment_&_acc_fp,timestamp,PARTIAL|-1
```
| i | فیلد | نکته |
|---|---|---|
| 1 | ticket | تیکت مبدا |
| 2 | symbol | نام نماد در بروکر مبدا |
| 3 | type | `BUY`, `SELL`, `BUY LIMIT`/`BUY_LIMIT`... → فاصله و `_` حذف و upper → کلید `ACTION_HANDLER` |
| 4 | vol | |
| 5 | open_price | |
| 6 | open_time | timestamp (ms)؛ `+ diff_time` می‌شود |
| 7,8 | sl, tp | |
| 9 | commission | |
| 10 | magic | |
| 11 | comment | |
| 12 | acc_fp | اگر ≠0 → پیام از پنل: `platform='panel'`، `Account.findOne({acc})`، `diff_time=0` |

`PARTIAL` (اندیس 4 پیام): `-1` یا آیتم‌ها با `_@_`، هر آیتم با `_&_`:
```
closed_ticket _&_ closed_vol _&_ closed_price _&_ closed_timestamp _&_ closed_swap _&_ closed_commission _&_ closed_profit _&_ open_ticket _&_ open_vol _&_ open_price _&_ open_timestamp
```
در 500 آیتمی انتخاب می‌شود که `open_ticket == ticket`؛ اگر پیدا شد پیام «سفارش جدید» نیست بلکه باقیمانده یک partial است.

پاسخ همزمان: `{status:'success', message:'| order processed for copier X | ...', data:{keyid}}` — برای پنل اگر `message` شامل `processed` نباشد `status='error'`.

### 501 — NEW CLOSE (`handleClose.js`)
```
acc,501,NEW CLOSE_&_ticket_&_close_price_&_close_time_&_symbol_&_type_&_vol_&_swap_&_commission_&_profit_&_magic_&_acc_fp,timestamp,PARTIAL|-1|-1234
```
| i | فیلد |
|---|---|
| 1 | closed_ticket |
| 2 | closed_price |
| 3 | closed_timestamp (ms، `+diff_time`) |
| 4 | symbol |
| 5 | type → `getOrderSide` |
| 6 | closed_vol |
| 7 | closed_swap |
| 8 | closed_commission |
| 9 | closed_profit |
| 10 | magic |
| 11 | acc_fp |

- `extra == '-1234'` ⇒ `acc_type='master'`: خود Master بسته‌شدن تیکت را گزارش داده؛ فقط سمت dist در TradeMap با `(acc_dist=acc, ticket_dist=closed_ticket, status='open')` بسته می‌شود. **چیدمان فیلدها در این حالت فرق دارد:**
  ```
  master_acc_originAcc_c,501,NEW CLOSE_&_ticket_&_close_price_&_close_time_&_symbol_&_type_&_vol_&_swap_&_swap_final_&_commission_&_commission_final_&_profit_&_magic_&_acc_fp,timestamp,-1234
  ```
  - `close_time` باید مثل بقیه پیام‌ها **میلی‌ثانیه** باشد (نسخه‌های قبلی EA Master به‌اشتباه ثانیه می‌فرستادند و قرار است در سمت متاتریدر اصلاح شود)؛ `diff_time` در این مسیر اعمال نمی‌شود.
  - پاسخ همیشه: `{status:'success', data:{acc_type:'master', trade: ticket_dist | ''}}` (`''` یعنی معامله باز متناظر پیدا نشد).
- در غیر این صورت `acc_type='user'`؛ اگر `extra != -1` آیتم partial با `closed_ticket == ticket` جستجو می‌شود (همان فرمت 500).

پاسخ (کاربر): `{status:'success', data:{keyid}}`

### 502 — NEW MODIFY (`handleModify.js`)
```
acc,502,NEW MODIFY_&_ticket_&_sl_&_tp_&_open_price_@_ticket_&_sl_&_tp_&_open_price...,timestamp,acc_fp
```
- برچسب اول با regex حذف و بقیه با `_@_` به آیتم‌ها شکسته می‌شود (چند تیکت در یک پیام).
- **اینجا `acc_fp` در اندیس 4 پیام است**؛ `-1` ⇒ متاتریدر (`acc_meta`)، هر مقدار دیگر ⇒ پنل (`acc`).

### 401 — SAMPLE TRADE (`handleSampleTrade.js`)
```
acc,401,name_&_server_&_currency_&_tehran_ts_msc_&_symbol_&_lots_&_type_&_open_price_&_close_price_&_open_time_msc_&_close_time_msc_&_commission_&_profit_&_spread_&_bid_&_ask_&_diff_with_tehran_&_spread_avg_5_&_spread_avg_50_&_leverage_&_margin,timestamp,-2
```
اثر: upsert `Broker{server, title=name, diff_time = round(diff/1800)*1800*1000}` و اگر نماد در SymbolAlias شناخته شد upsert `Symbol` (کمیسیون min/max، اسپرد min/max/last/avg، margin، leverage).

### 41 — DRAWDOWN (`HandleDrawdown.js`)
```
master_acc_x_y,41,DRAWDOWN_&_magic_&_user_name_&_lane_&_mode_&_reason_&_eq_real_&_bal_real_&_eq_company_&_bal_company_&_dd_real_&_dd_company_&_closed_&_failed_&_flags_@_record_1_@_record_2_@_,timestamp,-2
```
- فرستنده: EA حساب **Master**؛ `acc` قبل از اولین `_` = شماره Master (همان `copiers.acc`).
- `magic` (i=1 از بخش قبل از اولین `_@_`) = `Account.acc` تریدر.
- فعلاً فقط `magic` استفاده می‌شود؛ بقیه فیلدها و رکوردهای بعد از `_@_` پارس نمی‌شوند.
- اثر: `Account` با `{acc: magic, "copiers.acc": master}` → `status='failed'`، `copy=false`، و `copy=false` برای **همه** copier ها.
- پاسخ: `{status:'success'}` یا `{status:'error', message:'Account Not Found!!!'}`.

### 300 — USAGE
```
acc,300,cpu_&_ram_&_disk_&_net,timestamp,-3
```

### 301 — REQUEST SYMBOL RATES
```
acc_cluster,301,REQUEST SYMBOL RATES_&_server_&_commission_rate_&_swap_rate_&_CYCLE n,timestamp,-2
```
پاسخ‌دهی به‌صورت دستور خروجی 301 (پایین). تأیید دریافت با 399.

### 302 — REQUEST PROFILE
```
acc_cluster,302,REQUEST PROFILE_&_server_&_magic_&_CYCLE n,timestamp,-2
```
`magic` = acc کاربر (Account.acc). پاسخ به‌صورت دستور خروجی 40. تأیید دریافت با 960.

## ۴. پاسخ‌های Master / EA

همه: `acc[_...],CODE,<info>,timestamp,keyid`

| کد | موفق (`info`) | ناموفق |
|---|---|---|
| 999..992 (open) | `OK ..._&_ticket_&_open_timestamp_&_vol_&_open_price_&_sl_&_tp_&_magic_&_comment_&_error_&_commission_&_commission_final` | `FAIL ..._&_?_&_result_code` (کد در i=2) |
| 997 (modify) | `OK MODIFY_&_ticket_&_sl_&_tp_&_open_price` | result_code در i=2 |
| 996 (close) | `OK CLOSE_&_ticket_&_close_price_&_close_timestamp_&_swap_&_swap_final_&_commission_&_commission_final_&_profit_&_error_&_vol_&_symbol` یا `OK DELETE_&_ticket_&_close_timestamp` | result_code در i=2 |
| 977 (close origin) | `OK CLOSE_&_ticket_&_close_price_&_close_timestamp_&_swap_&_commission_&_profit_&_error_&_vol_&_symbol` | result_code در i=2 |
| 987 (broker symbols) | `acc,987,S1,S2,...,Sn,timestamp,keyid` — **لیست با کاما**؛ `symbols = parts.slice(2,-2)` | — |
| 989 (symbol data) | `contract_size_=_v_&_tick_size_=_v_&_tick_value_=_v_&_vol_step_=_v_&_vol_min_=_v_&_vol_max_=_v_&_digits_=_v_&_point_=_v` | — |
| 960 / 399 | فقط تأیید؛ keyid = آخرین بخش | — |

کد خطا با `getMqlError(code)` به نام MQL4/MQL5 (مثل `ERR_INVALID_STOPS`, `TRADE_RETCODE_NO_MONEY`) تبدیل و در `GetUpdate.description` به شکل `result_text/code/NAME` ذخیره می‌شود.

## ۵. دستورهای خروجی (`makeMsgForHandler`)

به انتهای همه اضافه می‌شود: `,<unix-seconds>,<keyid>`. `C` = پسوند cluster (فعلاً همیشه `_1`، فقط برای کدهای 1–8، 3، 4، 21، 22، 25).

| کد | قالب |
|---|---|
| 1, 2 | `{acc}_{origin_acc}C,{h},{symbol}_&_{vol}_&_{slippage}_&_{sl}_&_{tp}_&_{comment}_&_{magic}` |
| 5–8 | `{acc}_{origin_acc}C,{h},{symbol}_&_{open_price}_&_{vol}_&_{slippage}_&_{sl}_&_{tp}_&_{comment}_&_{magic}` |
| 3 | `{acc}_{origin_acc}C,3,{ticket}_&_{origin_open_price}_&_{sl}_&_{tp}` |
| 4 | `{acc}_{origin_acc}C,4,{ticket}` |
| 21 | `{acc}_{origin_acc}C,21,{tickets}` |
| 22 | `{acc}_{origin_acc}C,22,{ticket}_&_{vol}` |
| 25 | `{acc}_{origin_acc}C,25,{ticket}` |
| 23 | `{acc},23,{ticket}` |
| 20 | `{acc},20,0` |
| 26 | `{acc},26,{origin_acc}` |
| 13 | `{acc},13,0` |
| 11 | `{acc},11,{symbol}` |
| 30 | `{acc},30,{method}_&_{history_count}_&_{search_ticket}` |

ساخته‌شده دستی (خارج از `makeMsgForHandler`):

- **40 (PROFILE SET)** — `HandleRequestProfile.js`:
  `{acc_cluster},40,{username}_&_{commission_rate}_&_{swap_rate}_&_{drawdown}_&_0_&_{magic}_&_{server}_&_{last_close_time}_&_{initial}_&_{initial-drawdown}_&_{initial}_&_{initial-drawdown},{unix-s},{keyid}`
- **301 (SYMBOL RATES)** — `HandleSymbolData.js`:
  `{acc_cluster},301,{server}_$_{symbol_&_commission_&_swap}_@_...,{unix-s},{keyid}`

نکات:
- `magic` سفارش کپی‌شده = `account.acc` (کاربر) ⇒ روی Master از magic می‌شود فهمید معامله متعلق به کدام کاربر است.
- `slippage` ثابت 50.
- دستورهای `waiting` به جای تیکت مقصد `-1` دارند؛ `updateWaitings` بعداً با `message.replace('-1', ticket)` (اولین رخداد) آن را جایگزین می‌کند.

## ۶. پاسخ `GetUpdates`

```json
{ "ok": true, "result": [ { "update_id": 123456789, "message": "..." } ], "timestamp": 1758998114 }
```
- فقط `status='pending'`، `origin_acc = :acc`، `created_at >= now-60s`، مرتب نزولی بر اساس زمان.
- `timestamp`: ساعت دیواری تهران که به‌صورت epoch ثانیه بیان شده (از `formatDate` با تایم‌زون تهران و سپس `new Date(...)` با تایم‌زون سرور).
