"use strict";

const { spawnSync } = require("child_process");
const path = require("path");


const rootDir = path.resolve(__dirname, "..");


const readArgs = function() {
    const options = {
        outputDir: path.join(rootDir, "dist"),
        productArgs: []
    };
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        const current = args[index];

        if (current === "--out-dir") {
            index += 1;
            options.outputDir = path.resolve(args[index] || options.outputDir);
            continue;
        }

        options.productArgs.push(current);
    }

    return options;
};


const run = function(command, args, env = process.env) {
    const result = spawnSync(command, args, {
        cwd: rootDir,
        env,
        stdio: "inherit"
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};


const main = function() {
    const options = readArgs();
    const outputDir = path.resolve(options.outputDir);
    const declaredProductPath = process.env.DIALOGFORGE_WEB_PRODUCT_PATH
        || options.productArgs.find((argument) => {
            return !String(argument || "").startsWith("-");
        })
        || "";
    const productPath = declaredProductPath
        ? path.resolve(declaredProductPath)
        : "";
    const env = Object.assign({}, process.env, {
        DIALOGFORGE_SOURCE_ROOT: rootDir,
        DIALOGFORGE_DIST_DIR: outputDir
    });

    run("tsc", [
        "-p",
        "tsconfig.json",
        "--outDir",
        outputDir
    ], env);
    run(process.execPath, [
        "scripts/copy-static.js",
        "--include-web-runtime"
    ], env);
    run(process.execPath, ["scripts/build-shell-web-modules.js"], env);
    run(process.execPath, ["scripts/stage-live-script-browser-artifact.js"], env);

    if (productPath) {
        run(process.execPath, [
            "scripts/stage-product-browser-dialog-runtime.js",
            "--product-path",
            productPath,
            "--out-dir",
            outputDir
        ], env);
    }

    if (options.productArgs.length > 0 || process.env.DIALOGFORGE_WEB_PRODUCT_PATH) {
        run(process.execPath, [
            path.join(outputDir, "scripts/web-product-dev-server.js"),
            "--build-only",
            ...options.productArgs
        ], env);
    }
};


main();
