"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const webShellPath = path.join(rootDir, "shared/shell-web/pages/dialogr.js");
const importActionsPath = path.join(rootDir, "shared/base-app/dialogs/source/import/actions.js");

const webShell = fs.readFileSync(webShellPath, "utf8");
const importActions = fs.readFileSync(importActionsPath, "utf8");

assert.ok(
    webShell.includes("DDIwR::convert(.file, n_max = .nrows)"),
    "foreign-file import preview must limit DDIwR conversion to preview rows"
);
assert.ok(
    importActions.includes("th.style.borderRight"),
    "import preview headers must render visible column dividers"
);
assert.ok(
    importActions.includes("td.style.borderRight"),
    "import preview cells must render visible column dividers"
);

console.log("Browser import preview contract verified.");
