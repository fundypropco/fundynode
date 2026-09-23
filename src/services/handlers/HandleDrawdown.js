import Account from '../../models/Account.js'

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // پیدا کردن اکانت تریدر متصل به این مستر و غیرفعال کردن آن
    // وضعیت اکانت failed شده و کپی روی اکانت و همه کپی کننده ها متوقف میشود
    const account = await Account.findOneAndUpdate(
        { acc: data.magic, "copiers.acc": data.acc },
        {
            $set: {
                status: 'failed',
                copy: false,
                "copiers.$[].copy": false
            }
        },
        { new: true }
    )

    if (!account) {
        return res.send({
            status: 'error',
            message: 'Account Not Found!!!'
        })
    }

    // #.
    // ارسال پاسخ عملیات موفقیت آمیز
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g.
    // 1006135456_342_2 , 41 , DRAWDOWN_&_magic_&_user_name_&_lane_&_mode_&_reason_&_eq_real_&_bal_real_&_eq_company_&_bal_company_&_dd_real_&_dd_company_&_closed_&_failed_&_flags_@_record_1_@_record_2_@_ , 1758983673 , -2
    // master_acc , 41 , DRAWDOWN & magic(trader acc) & ... @ records , timestamp , -2
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.timestamp = Number(msg_parts[3])
    const info = msg_parts[2]

    // msg info
    // بخش اصلی پیام قبل از اولین _@_ است و رکوردها بعد از آن می آیند
    const info_parts = info.split('_@_')[0].split('_&_')
    data.magic = Number(info_parts[1])

    return data
}
