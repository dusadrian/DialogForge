"use strict";

const fs = require("fs");
const path = require("path");

module.exports = async function prepareLinuxElectronSandbox(context) {
    if (context.electronPlatformName !== "linux") {
        return;
    }

    const sandboxPath = path.join(context.appOutDir, "chrome-sandbox");
    fs.chmodSync(sandboxPath, 0o4755);
};
