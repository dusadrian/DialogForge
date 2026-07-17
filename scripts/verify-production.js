"use strict";

const path = require("path");
const { spawnSync } = require("child_process");


const rootDir = path.resolve(__dirname, "..");


const readArgs = function() {
    const options = {
        productPath: "",
        skipBuild: false,
        electron: true,
        web: true
    };
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        const current = args[index];

        if (current === "--product-path") {
            index += 1;
            options.productPath = path.resolve(args[index] || "");
            continue;
        }
        if (current === "--skip-build") {
            options.skipBuild = true;
            continue;
        }
        if (current === "--electron-only") {
            options.web = false;
            continue;
        }
        if (current === "--web-only") {
            options.electron = false;
            continue;
        }

        throw new Error(`Unknown production verification argument: ${current}`);
    }

    if (!options.productPath) {
        throw new Error("Missing required --product-path argument.");
    }

    return options;
};


const npmInvocation = function(args) {
    const npmExecPath = String(process.env.npm_execpath || "").trim();

    if (npmExecPath) {
        return {
            command: process.execPath,
            args: [npmExecPath, ...args]
        };
    }

    return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args
    };
};


const run = function(command, args, cwd) {
    const result = spawnSync(command, args, {
        cwd,
        env: process.env,
        stdio: "inherit",
        shell: process.platform === "win32" && command.endsWith(".cmd")
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
};


const runProductBuild = function(productPath, script) {
    const invocation = npmInvocation(["run", script]);

    run(invocation.command, invocation.args, productPath);
};


const main = function() {
    const options = readArgs();

    if (options.electron) {
        if (!options.skipBuild) {
            runProductBuild(options.productPath, "build");
        }

        run(process.execPath, [
            path.join(rootDir, "scripts", "verify-production-electron.js"),
            "--product-path",
            options.productPath
        ], rootDir);
    }

    if (options.web) {
        run(process.execPath, [
            path.join(rootDir, "scripts", "verify-production-web.js"),
            "--product-path",
            options.productPath,
            ...options.skipBuild ? [] : ["--build"]
        ], rootDir);
    }
};


main();
