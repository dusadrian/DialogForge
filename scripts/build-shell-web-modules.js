"use strict";

const childProcess = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const tscPath = path.join(rootDir, "node_modules/typescript/bin/tsc");

childProcess.execFileSync(process.execPath, [
    tscPath,
    "-p",
    path.join(rootDir, "tsconfig.shell-web.json")
], {
    cwd: rootDir,
    stdio: "inherit"
});
