"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { getProductContribution } = require("../../shared/base-app/bootstrap/productContributionRegistry");
const { resolveProductLocation } = require("../../shared/base-app/bootstrap/productResolver");
const rootDir = process.cwd();
const electronMainPath = path.join(rootDir, "build/scripts/electron-main.ts");
const electronMainSource = fs.readFileSync(electronMainPath, "utf8");
const runtimeSessionCompositionSource = fs.readFileSync(path.join(
    rootDir,
    "shared/shell-electron/runtime/runtimeSessionComposition.ts"
), "utf8");
const productResolverSource = fs.readFileSync(path.join(rootDir, "shared/base-app/bootstrap/productResolver.ts"), "utf8");
const packageProductSource = fs.readFileSync(path.join(rootDir, "build/scripts/package-product.ts"), "utf8");
const mainStartupControllerSource = fs.readFileSync(path.join(rootDir, "shared/base-app/features/main-window/mainStartupController.ts"), "utf8");
assert.ok(!electronMainSource.includes("../../products/"), "Electron main must not import product implementation files directly.");
assert.ok(runtimeSessionCompositionSource.includes('from "../../base-app/bootstrap/productContributionRegistry"'), "Electron runtime composition must resolve product-owned behavior through the contribution registry.");
assert.ok(!electronMainSource.includes('product === "DialogR"')
    && !electronMainSource.includes('product === "DialogQCA"'), "Electron main must use product settings and contributions instead of product-name branches.");
assert.ok(!mainStartupControllerSource.includes('"DialogR"')
    && !mainStartupControllerSource.includes('"DialogQCA"'), "Shared startup code must use the runtime startup policy instead of product names.");
assert.ok(!productResolverSource.includes("dist/bootstrap/productContribution.js"), "Product resolution must not consume product-owned dist output.");
assert.ok(!packageProductSource.includes("copyProductCompiledFiles"), "Product staging must compile from product source instead of restoring previous compiled output.");
const baseContribution = getProductContribution(resolveProductLocation(rootDir, "base"));
const fixtureProductPath = path.join(rootDir, "tests/fixtures/external-product");
const fixtureContribution = getProductContribution(resolveProductLocation(rootDir, "FixtureProduct", fixtureProductPath));
assert.strictEqual(baseContribution.id, "base");
assert.strictEqual(fixtureContribution.id, "FixtureProduct");
const context = {
    executeRuntimeMethod: async function () {
        return {
            status: "ready"
        };
    }
};
assert.deepStrictEqual(baseContribution.createDialogExternalCallHosts(context), {});
const fixtureHosts = fixtureContribution.createDialogExternalCallHosts(context);
assert.ok(fixtureHosts.fixture);
assert.strictEqual(fixtureHosts.fixture.supports?.("fixture.echo"), true);
assert.strictEqual(fixtureHosts.fixture.supports?.("fixture.missing"), false);
console.log("Product contribution registry verified.");
