async function doSomething() {
    console.log('شروع کار در:', new Date().toLocaleTimeString());

    // شبیه‌سازی یه کار async (مثل فراخوانی API)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // فرضاً گاهی خطا بده
    if (Math.random() < 0.3) {
        throw new Error('خطای تصادفی!');
    }

    console.log('پایان کار در:', new Date().toLocaleTimeString());
}

async function startLoop(intervalMs = 10000) {
    while (true) {
        const startTime = Date.now();

        try {
            await doSomething();
            console.log('انجام شد....')
        } catch (err) {
            console.error('🚨 خطا رخ داد:', err.message);
        }

        const elapsed = Date.now() - startTime;
        const delay = Math.max(intervalMs - elapsed, 0);

        // اگر تابع سریع تموم شد، تا زمان اجرای بعدی صبر کن
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

export default startLoop
