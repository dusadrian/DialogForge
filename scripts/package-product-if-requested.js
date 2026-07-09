"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const main = function () {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        return;
    }

    let packageArgs = args;
    const firstArg = args[0] || "";
    if (firstArg && !firstArg.startsWith("-")) {
        packageArgs = [
            "--product-path",
            firstArg,
            ...args.slice(1)
        ];
    }
    else if (firstArg !== "--product-path") {
        throw new Error("When passing arguments to npm run build, use --product-path <path>.");
    }

    const packageProductPath = path.join(__dirname, "package-product.js");
    const result = spawnSync(process.execPath, [packageProductPath, ...packageArgs], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit"
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};
main();
