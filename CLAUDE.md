# FundyNode — راهنمای پروژه برای Claude

> این فایل در شروع هر جلسه خوانده می‌شود. خلاصه است؛ جزئیات در پوشه [docs/](docs/) هستند.
> هر وقت رفتار کد عوض شد، سند مربوطه را هم به‌روز کن.

## قوانین کاری (مهم)

- **هیچ تغییری مستقیم روی `main` نرود.** همه تغییرات روی یک branch/worktree انجام می‌شود، کاربر آن را بازبینی می‌کند و خودش merge می‌کند.
- بدون درخواست صریح، commit/push نکن.
- زبان گفتگو و کامنت‌های کد **فارسی** است؛ نام متغیرها و توابع انگلیسی. سبک کامنت‌گذاری موجود (`// #.` + توضیح فارسی) را حفظ کن.
- پروژه تست خودکار ندارد (`npm test` خالی است). بعد از تغییر، مسیر پیام را دستی دنبال کن و نتیجه را صادقانه گزارش کن.
- پیش از تغییر در یک handler، فرمت پیام آن را در [docs/message-protocol.md](docs/message-protocol.md) چک کن؛ طرف MQL (اکسپرت متاتریدر) در این ریپو نیست و هر تغییر فرمت باید با آن هماهنگ شود.

## پروژه در یک نگاه

FundyNode بخشی از سامانه پراپ‌تریدینگ Fundy است: یک **کپی‌تریدر پیام‌محور** بین حساب‌ها.

```
 متاتریدر دموی کاربر (EA)  ─┐                                     ┌─► متاتریدر Master (حساب واقعی، EA)
                            ├─ POST /api/spider/SendMessage ─► FundyNode ─ GetUpdate (صف دستور) ─┤  با polling:
 FundyPanel / Trading Room ─┘   (پیام متنی CSV-مانند)          │                                  │  GET /api/spider/GetUpdates/:acc
      (لاراول)                                                  │                                  └─► نتیجه اجرا را دوباره با
                                                                ├─► TradeMap (نگاشت تیکت مبدا↔مقصد)     SendMessage (کد 9xx) برمی‌گرداند
                                                                └─► sync به لاراول: POST panel.fundyprop.com/api/sync-trade
```

- پیام ورودی = رشته متنی: `acc[_originAcc_cluster],HANDLER,info,timestamp,extra` (جداکننده‌های داخلی: `_&_` ، `_@_` ، `_=_`)
- عدد دوم پیام (HANDLER) مسیر را در [src/controllers/spider.js](src/controllers/spider.js) تعیین می‌کند.
- پاسخ‌های اجرای دستور با کد `1000 - actionHandler` برمی‌گردند (مثلاً BUY=1 → پاسخ 999).
- «Account» = حساب کاربر (مبدا/src)؛ «copiers» = حساب‌های Master که سفارش روی آنها کپی می‌شود (مقصد/dist).

## پشته فنی

Node.js 22 (ESM، `"type": "module"`) · Express 5 · Mongoose 8 (MongoDB 8) · ioredis + BullMQ (Redis 8) · pino (لاگ) · axios · Docker Compose · PM2 (در production) · nginx

## اجرا

```bash
docker compose up -d --build          # توسعه: app روی localhost:5000 ، debugger 9229/9230 ، mongo 27117 ، redis 6380
./deploy.sh                           # production (docker-compose.prod.yml + بکاپ قبل از استقرار)
```

- `app.js` → سرور HTTP (`src/index.js`) ؛ `worker.js` → پردازشگر صف BullMQ (فقط job `checkTradeMap`)
- متغیرهای محیطی: `MONGO_URI`, `REDIS_HOST`, `REDIS_PORT`, `APP_PORT`, `FUNDYPANEL_API_KEY`, `BALE_NOTIF_BOT_TOKEN`, `BALE_NOTIF_BOT_CHANNEL_ID`, `MONGO_INITDB_*` (نمونه: `.envsample`)
- لاگ‌ها: `logs/app.log` (pino، سطح `warn`، زمان تهران)

## نقشه کد

| مسیر | نقش |
|---|---|
| `src/index.js` | boot → middlewares → routes → error handlers → schedules |
| `src/boot/` | اتصال singleton به Mongo/Redis/Queue؛ `cache.js` کش درون‌حافظه‌ای Broker (۵ دقیقه) و LogRule (۱ دقیقه) |
| `src/routes/` + `src/controllers/` | `spider` (EA ها)، `tradingroom` (پنل)، `admin` (seed و گزارش)، `telegram` |
| `src/services/handlers/` | **قلب پروژه**: یک فایل برای هر نوع پیام. الگو: `processMessage()` پارس → منطق → `res.send` |
| `src/services/GetUpdateService.js` | ساخت/به‌روزرسانی دستورها در صف `get_updates` و توابع `prepare*Data` |
| `src/services/TradeMapService.js` | ارسال رویداد TradeMap به لاراول (`created/modified/updated/closed`) |
| `src/helpers/helper.js` | `makeMsgForHandler` (ساخت پیام خروجی)، `getMqlError`، تاریخ، `isValidSymbols`، `normalizeSymbol` |
| `src/helpers/constant.js` | `ACTION_HANDLER` کدهای دستور خروجی |
| `src/models/` | اسکیماهای Mongoose — شرح کامل در [docs/data-models.md](docs/data-models.md) |
| `src/schedules/` | job تکرارشونده `checkTradeMap` هر ۳۰ ثانیه (عملاً غیرفعال، چون `sendForCheck` کامنت شده) |
| `src/seeders/` | پر کردن SymbolAlias، LogRule و درخواست نمادهای بروکر |

## مستندات تفصیلی

- [docs/architecture.md](docs/architecture.md) — بازیگران، اجزا، endpoint ها، استقرار، واژه‌نامه
- [docs/message-protocol.md](docs/message-protocol.md) — فرمت دقیق همه پیام‌های ورودی/خروجی و جدول کدها
- [docs/flows.md](docs/flows.md) — جریان‌های کسب‌وکار: سفارش جدید، بستن، پارشیال، مدیفای، waiting، کمیسیون، sync
- [docs/data-models.md](docs/data-models.md) — کالکشن‌ها، فیلدها، وضعیت‌ها، ایندکس‌ها
- [docs/known-issues.md](docs/known-issues.md) — باگ‌ها، ریسک‌ها و کدهای مرده که هنگام بررسی پیدا شد

## نکات حیاتی که نباید فراموش شوند

1. **handler های فعال** فقط آنهایی هستند که در `switch` فایل `src/controllers/spider.js` کامنت نشده‌اند (41, 300, 301, 302, 399, 401, 500, 501, 502, 999, 998, 997, 996, 995, 994, 993, 992, 977, 960, 987, 989). فایل‌های handler دیگر فعلاً کد مرده‌اند.
2. `GetUpdates/:acc` بر اساس **`origin_acc`** فیلتر می‌کند (نه `acc`) و فقط دستورهای `pending` با عمر **کمتر از ۶۰ ثانیه** را برمی‌گرداند. دستور تا رسیدن پاسخ `pending` می‌ماند، پس ممکن است چند بار تحویل شود؛ `keyid` (همان `update_id`) شناسه یکتای آن است.
3. `updateStatus` دستور را با `{acc, handler, keyid}` پیدا می‌کند؛ اگر سندی `handler` نداشته باشد هیچ‌وقت به‌روز نمی‌شود.
4. `keyid = Date.now() % 1e9` است و برای هر copier یکی اضافه می‌شود — یکتایی تضمین‌شده نیست.
5. پیام‌های ورودی قدیمی‌تر از ۶۰ ثانیه رد می‌شوند (`Expired Message`) — مقایسه با `Date.now()` میلی‌ثانیه‌ای است.
6. `diff_time` هر بروکر (میلی‌ثانیه، گرد شده به ۳۰ دقیقه) به زمان‌های متاتریدر اضافه می‌شود تا همه زمان‌ها یکسان شوند؛ از 401 (sample trade) پر می‌شود.
7. پیام‌هایی که `acc_fp` دارند از **پنل** آمده‌اند: `platform='panel'`، حساب با `acc` پیدا می‌شود و `diff_time=0`. در غیر این صورت از **متاتریدر دمو** آمده‌اند و حساب با `acc_meta` پیدا می‌شود.
8. در سمت `_src` (کاربر) و `_dist` (Master) فیلدهای TradeMap جدا هستند؛ `*_final` (مثل `commission_final`, `swap_final`) مقادیر محاسبه‌شده شرکت روی Master هستند.
9. هیچ endpoint ای احراز هویت ندارد (از جمله `/api/admin/*`).
