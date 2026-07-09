"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const stageProduct = function (productPath) {
    const result = spawnSync(process.execPath, [
        path.join(__dirname, "package-product.js"),
        "--product-path",
        productPath,
        "--stage-only"
    ], {
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
const main = function () {
    const args = process.argv.slice(2);
    const productPath = args[0] && !args[0].startsWith("-")
        ? args[0]
        : "";
    const forwardedArgs = productPath
        ? args.slice(1)
        : args;
    const electronArgs = productPath
        ? [
            "dist/scripts/electron-main.js",
            "--product-path",
            productPath,
            ...forwardedArgs
        ]
        : [
            "dist/scripts/electron-main.js",
            "--product",
            "base",
            ...forwardedArgs
        ];
    if (productPath) {
        stageProduct(productPath);
    }
    const electronCommand = process.platform === "win32"
        ? "electron.cmd"
        : "electron";
    const result = spawnSync(electronCommand, electronArgs, {
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
