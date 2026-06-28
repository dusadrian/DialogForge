"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getProductContribution } = require("../../shared/base-app/bootstrap/productContributionRegistry");
const { resolveProductLocation } = require("../../shared/base-app/bootstrap/productResolver");
const rootDir = process.cwd();
const electronMainPath = path.join(rootDir, "scripts/electron-main.js");
const electronMainSource = fs.readFileSync(electronMainPath, "utf8");
const runtimeSessionCompositionSource = fs.readFileSync(path.join(
    rootDir,
    "shared/shell-electron/runtime/runtimeSessionComposition.ts"
), "utf8");
const productResolverSource = fs.readFileSync(path.join(rootDir, "shared/base-app/bootstrap/productResolver.ts"), "utf8");
const packageProductSource = fs.readFileSync(path.join(rootDir, "scripts/package-product.js"), "utf8");
const mainStartupControllerSource = fs.readFileSync(path.join(rootDir, "shared/base-app/features/main-window/mainStartupController.ts"), "utf8");
const createFixtureProduct = function(id, contributionSource) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-product-"));

    fs.mkdirSync(path.join(fixtureRoot, "bootstrap"), {
        recursive: true
    });
    fs.writeFileSync(
        path.join(fixtureRoot, "product.json"),
        JSON.stringify({
            id,
            name: id,
            version: "0.0.0",
            description: id
        }, null, 4)
    );
    fs.writeFileSync(
        path.join(fixtureRoot, "bootstrap/productContribution.js"),
        contributionSource
    );

    return fixtureRoot;
};

const assertContributionFailure = function(productRoot, expectedText) {
    assert.throws(
        () => {
            getProductContribution(
                resolveProductLocation(rootDir, "base", productRoot)
            );
        },
        (error) => {
            assert.ok(
                String(error.message).includes(expectedText),
                "Expected failure to include: " + expectedText
                    + "\nActual: " + error.message
            );

            return true;
        }
    );
};

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
assertContributionFailure(
    createFixtureProduct(
        "UnsupportedContractProduct",
        [
            `"use strict";`,
            `module.exports.productContribution = {`,
            `    id: "UnsupportedContractProduct",`,
            `    dialogForgeProductContract: 999,`,
            `    createDialogExternalCallHosts: function() { return {}; }`,
            `};`,
            ``
        ].join("\n")
    ),
    "dialogForgeProductContract must be 1"
);
assertContributionFailure(
    createFixtureProduct(
        "WrongIdProduct",
        [
            `"use strict";`,
            `module.exports.productContribution = {`,
            `    id: "DifferentProduct",`,
            `    dialogForgeProductContract: 1,`,
            `    createDialogExternalCallHosts: function() { return {}; }`,
            `};`,
            ``
        ].join("\n")
    ),
    `id must match selected product "WrongIdProduct"`
);
assertContributionFailure(
    createFixtureProduct(
        "MalformedProduct",
        [
            `"use strict";`,
            `module.exports.productContribution = {`,
            `    id: "MalformedProduct",`,
            `    dialogForgeProductContract: 1,`,
            `    createDialogExternalCallHosts: function() { return {}; },`,
            `    consoleStateChipMutationCalls: ["ok", 42]`,
            `};`,
            ``
        ].join("\n")
    ),
    "consoleStateChipMutationCalls must contain only strings"
);
console.log("Product contribution registry verified.");
