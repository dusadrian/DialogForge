"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");


const projectRoot = path.resolve(__dirname, "../..");
const surface = fs.readFileSync(
    path.join(projectRoot, "src/shell-web/browserDialogSurface.ts"),
    "utf8"
);
const frameSurface = fs.readFileSync(
    path.join(projectRoot, "src/shell-web/browserFrameSurface.ts"),
    "utf8"
);
const composition = fs.readFileSync(
    path.join(projectRoot, "src/shell-web/browserComposition.ts"),
    "utf8"
);
const browserHost = fs.readFileSync(
    path.join(projectRoot, "src/shell-web/pages/shell.js"),
    "utf8"
);
const shellWebTsconfig = fs.readFileSync(
    path.join(projectRoot, "tsconfig.shell-web.json"),
    "utf8"
);
const dialogBuilder = fs.readFileSync(
    path.join(projectRoot, "src/base-app/pages/dialogBuilder.html"),
    "utf8"
);


assert.ok(dialogBuilder.includes('id="paper"'));
assert.ok(dialogBuilder.includes('id="dialogQuickActions"'));
assert.ok(dialogBuilder.includes("dialogBuilder.css"));
const dialogCss = fs.readFileSync(path.join(projectRoot, "src/base-app/pages/dialogBuilder.css"), "utf8");
assert.ok(dialogCss.includes("appCodicon.css"));

assert.ok(surface.includes("createBrowserDialogSurfaceController"));
assert.ok(surface.includes("createBrowserFrameSurfaceController"));
assert.ok(frameSurface.includes("dialogforge-web-dialog-layer"));
assert.ok(frameSurface.includes("dialogforge-web-dialog__frame"));
assert.ok(surface.includes("dialogBuilder.html"));
assert.ok(surface.includes('role: "dialog"'));
assert.ok(surface.includes("ariaModal: true"));
assert.ok(surface.includes("findBrowserDialogLayerForMessage"));
assert.ok(surface.includes(".dialogforge-web-dialog__frame"));
assert.ok(!surface.includes("electron"));
assert.ok(browserHost.includes("findBrowserDialogLayerForMessage"));
assert.ok(browserHost.includes("/browser-esm/src/shell-web/browserDialogSurface.js"));
assert.ok(shellWebTsconfig.includes("src/shell-web/browserDialogSurface.ts"));

assert.ok(composition.includes("dialogSurfaceController"));
assert.ok(composition.includes("createBrowserDialogSurfaceController"));

console.log("Browser dialog surface contract verified.");
