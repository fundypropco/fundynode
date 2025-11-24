module.exports = {
    apps: [
        {
            name: "fundyworker",
            script: "./worker.js",
            instances: 1,
            exec_mode: "fork",
            watch: false
        }
    ]
};
