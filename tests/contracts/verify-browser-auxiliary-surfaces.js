"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");


const projectRoot = path.resolve(__dirname, "../..");
const surfaces = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserAuxiliarySurfaces.ts"),
    "utf8"
);
const composition = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserComposition.ts"),
    "utf8"
);


[
    "settings",
    "help",
    "about",
    "plotViewer",
    "scriptEditor",
    "dataEditor"
].forEach((id) => {
    assert.ok(surfaces.includes(`id: "${id}"`));
});

assert.ok(surfaces.includes('kind: "modal"'));
assert.ok(surfaces.includes('kind: "panel"'));
assert.ok(surfaces.includes('kind: "route"'));
assert.ok(surfaces.includes("listBrowserAuxiliarySurfaces"));
assert.ok(surfaces.includes("findBrowserAuxiliarySurface"));
assert.ok(!surfaces.includes("electron"));

assert.ok(composition.includes("auxiliarySurfaces"));
assert.ok(composition.includes("listBrowserAuxiliarySurfaces"));

console.log("Browser auxiliary surfaces contract verified.");
