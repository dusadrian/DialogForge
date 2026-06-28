"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");


const projectRoot = path.resolve(__dirname, "../..");
const settingsHtml = fs.readFileSync(
    path.join(projectRoot, "shared/base-app/pages/settings.html"),
    "utf8"
);
const settingsScript = fs.readFileSync(
    path.join(projectRoot, "shared/base-app/pages/settings.ts"),
    "utf8"
);
const settingsController = fs.readFileSync(
    path.join(
        projectRoot,
        "shared/shell-electron/settings/applicationSettingsIpcController.ts"
    ),
    "utf8"
);
const settingsComposition = fs.readFileSync(
    path.join(
        projectRoot,
        "shared/shell-electron/windows/applicationSupportWindowComposition.ts"
    ),
    "utf8"
);


assert.ok(settingsHtml.includes('id="runtimeProvider"'));
assert.ok(settingsScript.includes("payload.runtimeProviders"));
assert.ok(settingsScript.includes("runtimeStartup"));
assert.ok(settingsComposition.includes("runtimeProviderSelection.choices"));
assert.ok(settingsComposition.includes("choice.visible"));
assert.ok(settingsComposition.includes("runtimeProviderSelection.selectedProviderId"));
assert.ok(settingsController.includes("visibleRuntimeProviderIds"));
assert.ok(settingsController.includes("mergeRuntimeStartup"));
assert.ok(settingsController.includes("visibleProviders.includes(requestedProvider)"));

console.log("Provider selection settings contract verified.");
