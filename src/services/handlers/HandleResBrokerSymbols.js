import RequestLog from "../../models/RequestLog.js"
import { makeMsgForHandler, normalizeSymbol } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import SymbolAlias from "../../models/SymbolAlias.js"
import Symbol from "../../models/Symbol.js"
import GetUpdate from "../../models/GetUpdate.js"
import { ACTION_HANDLER } from "../../helpers/constant.js"

export default async (req, res) => {

    //# پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    //# بروزرسانی وضعیت دستور در صف دستورات
    await GetUpdateService.updateStatus(data)

    //# بدست آوردن نام سرور
    const getUpdateDoc = await GetUpdate.findOne({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
    })
    const serverName = getUpdateDoc ? getUpdateDoc.server : 'Test-Server'

    //#
    // استفاده از جدول راهنمای نمادهای معاملاتی برای تشخیص نمادهای قابل معامله در این بروکر
    // 'XAUUSD' → 'XAUUSD'
    // 'XAUUSD_o' → 'XAUUSD'
    const symbolAliases = await SymbolAlias.find().lean();
    const aliasMap = new Map();
    for (const item of symbolAliases) {
        aliasMap.set(item.title, item.title);
        for (const alias of item.alias) {
            aliasMap.set(alias, item.title);
        }
    }

    //# 
    // بدست آوردن نمادهای قابل معامله 
    const tradableSymbols = data.symbols.filter(rawSymbol => {
        const normalized = normalizeSymbol(rawSymbol)
        const title = aliasMap.get(normalized) || aliasMap.get(rawSymbol)
        return Boolean(title)
    })

    //# 
    // آپدیت کردن اطلاعات دیتابیس
    await Symbol.bulkWrite(
        tradableSymbols.map(rawSymbol => {
            const normalized = normalizeSymbol(rawSymbol)

            // بررسی وجود نام نماد در جدول راهنمای بالا
            const title = aliasMap.get(normalized) || aliasMap.get(rawSymbol);

            if (title) {
                return {
                    updateOne: {
                        filter: { title: title, server: serverName },
                        update: { $set: { symbol: rawSymbol, server: serverName } },
                        upsert: true
                    }
                }
            } else {
                return undefined
            }
        }).filter(Boolean)
    )

    //# 
    // درخواست برای ارسال اطلاعات نماد
    let keyid = makeID()
    const promises = [];
    for (const symbol of tradableSymbols) {
        const promise = (async () => {
            const getUpdateData = {
                server: serverName,
                acc: data.acc,
                handler: ACTION_HANDLER.BROKER_SYMBOL_DATA,
                symbol: symbol,
                keyid: keyid++,
            }
            getUpdateData.message = await makeMsgForHandler(getUpdateData.handler, getUpdateData);
            return GetUpdateService.create(getUpdateData);
        })()
        promises.push(promise);
    }
    await Promise.all(promises);

    //# لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    //# ارسال پاسخ عملیات موفقیت آمیز
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,987,#AA,#AAL,#AAPL,#ABBV,#ABT,#ADBE,#ADM,#ADP,#ADS,#AGNC,#AHT,#AIR,#ALV,#AMAT,#AMD,#AMGN,#AMZN,#ASML,#AVGO,#AXP,#BA,#BABA,#BAC,#BAES,#BARC,#BATS,#BAYN,#BB,#BIDU,#BKNG,#BLK,#BLND,#BMW,#BNP,#BRBY,#BT,#BYND,#C,#CAT,#CL,#CLX,#CMA,#CME,#CNC,#COIN,#CON,#COST,#COTY,#CRM,#CSCO,#CVAC,#CVX,#DBX,#DELL,#DIS,#DKNG,#DKNG.,#DOCU,#DVN,#EA,#EBAY,#EDU,#EXPE,#F,#FIS,#FTI,#GD,#GE,#GFI,#GILD,#GOOG,#GPN,#GS,#HD,#HIK,#HPQ,#HSBA,#IBM,#III,#IMB,#INTC,#INTU,#IQ,#ITRK,#JD,#JNJ,#JPM,#KER,#KMI,#KO,#KODK,#LAC,#LCID,#LI,#LLY,#LMT,#LRCX,#LRLCY,#LUMN,#MA,#MBG,#MC,#MCD,#MDLZ,#META,#MLM,#MMM,#MO,#MRNA,#MS,#MSFT,#NFLX,#NIKE,#NIO,#NSC,#NVAX,#NVDA,#NWG,#OKTA,#OXY,#PAH3,#PANW,#PDD,#PEP,#PFE,#PG,#PLUG,#PM,#POOL,#PSON,#PYPL,#QCOM,#RIOT,#RIVN,#RNG,#RNO,#ROST,#RTX,#SBUX,#SIE,#SLB,#SNOW,#STZ,#T,#TAP,#TGT,#TME,#TOT,#TRIP,#TSCO,#TSLA,#TSM,#TTE,#UNA,#UU,#V,#VFC,#VMC,#VOD,#VOW,#VZ,#WB,#WM,#WMT,#XOM,#XYZ,#ZTO,AAVUSD,ADAUSD,ALGUSD,ALIUSD,APTUSD,ARBUSD,ARUSD,ASX200,ATOUSD,AUDCAD_o,AUDCHF_o,AUDJPY_o,AUDLFX,AUDNZD_o,AUDUSD_o,AUSD,AVXUSD,AXSUSD,BCHUSD,BNBUSD,BTCUSD,CAC,CADCHF_o,CADJPY_o,CADLFX,CHFJPY_o,CHFLFX,CHZUSD,COMUSD,DGEUSD,DOTUSD,DSHUSD,ENJUSD,ETHBTC,ETHUSD,EURAUD_o,EURCAD_o,EURCHF_o,EURGBP_o,EURHKD,EURJPY_o,EURLFX,EURMXN,EURNZD_o,EURPLN,EURSGD,EURTRY,EURUSD_o,EURZAR,FDAX,FILUSD,FTSE,GBPAUD_o,GBPCAD_o,GBPCHF_o,GBPDKK,GBPJPY_o,GBPLFX,GBPNOK,GBPNZD_o,GBPSEK,GBPSGD,GBPTRY,GBPUSD_o,GBPZAR,GRTUSD,HBARUSD,HK50,IBEX35,ICPUSD,IMXUSD,INJUSD,JASMYUSD,KAVUSD,LFXJPY,LNKUSD,LTCBTC,LTCUSD,MBTUSD,MNAUSD,MSKUSD,NEAUSD,NEOUSD,NI225,NOTUSD,NQ,NZDCAD_o,NZDCHF_o,NZDJPY_o,NZDLFX,NZDSGD,NZDUSD_o,OPUSD,POLUSD,QTMUSD,RENDERUSD,RUT,SING,SKYUSD,SNDUSD,SOLUSD,SPX,STRUSD,STXUSD,SUIUSD,SUSD,SX5E,TAOUSD,THTUSD,TONUSD,TRXUSD,UKBRENT,UNIUSD,USCRUDE,USDCAD_o,USDCHF_o,USDCNH,USDCZK,USDDKK,USDHKD,USDHUF,USDILS,USDJPY_o,USDKRW,USDLFX,USDMXN,USDNOK,USDPLN,USDRUB,USDSEK,USDSGD,USDTRY,USDX,USDZAR,VETUSD,VIX,WIFUSD,XAGUSD_o,XAUUSD_o,XLMUSD,XNGUSD_o,XPDUSD_o,XPTUSD_o,XRPUSD,XTZUSD,YFIUSD,YGGUSD,YM,ZECBTC,ZECUSD,ZILUSD,1758993211,23
    // acc , 987 , S1 , S2 , timestamp , keyid
    const data = {};

    // msg parts
    msg = msg.toUpperCase()
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.handler = 1000 - parseInt(msg_parts[1])
    data.status = 'success'
    data.result_text = 'success'
    data.code = 0
    data.keyid = msg_parts[msg_parts.length - 1]
    data.symbols = msg_parts.slice(2, -2)

    return data
}
