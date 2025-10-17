export default {
    apps: [
        {
            name: "fundynode",
            script: "./app.js",
            instances: "max", // 1, // فقط یک پروسس برای توسعه
            exec_mode: "cluster", // "fork", // cluster لازم نیست توی dev
            watch: false, // تغییر فایل → restart خودکار
        }
    ]
}