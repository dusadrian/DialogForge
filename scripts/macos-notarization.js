"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const projectRoot = path.resolve(__dirname, "../..");
const keychainProfile = String(process.env.DIALOGFORGE_NOTARY_PROFILE || "developer-id-notary").trim();
const fail = function (message) {
    throw new Error(message);
};
const readObject = function (value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
};
const readProductManifest = function (productRoot) {
    const packagePath = path.join(productRoot, "package.json");
    if (!fs.existsSync(packagePath)) {
        fail(`Missing product package: ${packagePath}`);
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const product = readObject(packageJson.product);
    if (Object.keys(product).length === 0) {
        fail(`Missing product metadata in ${packagePath}`);
    }
    return {
        ...product,
        name: String(product.name || product.displayName || packageJson.productName || packageJson.name || "").trim(),
        version: String(packageJson.version || "").trim(),
        description: String(packageJson.description || "").trim()
    };
};
const isProductRoot = function (candidate) {
    const packagePath = path.join(candidate, "package.json");
    if (!fs.existsSync(packagePath)) {
        return false;
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return Object.keys(readObject(packageJson.product)).length > 0;
};
const requireMacOS = function () {
    if (process.platform !== "darwin") {
        fail("macOS notarization commands must run on macOS.");
    }
};
const resolveProductRoot = function () {
    const args = process.argv.slice(3);
    if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) {
        fail("Unknown notarization argument. Run from the product repository or pass one product path.");
    }

    if (args.length === 1) {
        return path.resolve(process.cwd(), args[0]);
    }

    const envProductRoot = String(process.env.DIALOGFORGE_NOTARY_PRODUCT_ROOT || "").trim();
    if (envProductRoot) {
        return path.resolve(envProductRoot);
    }

    if (isProductRoot(process.cwd())) {
        return process.cwd();
    }

    fail("Could not determine product root. Run this from DialogR/DialogQCA or set DIALOGFORGE_NOTARY_PRODUCT_ROOT.");
};
const productDmgPath = function (productRoot) {
    const manifest = readProductManifest(productRoot);
    const productName = String(manifest.name || manifest.id || path.basename(productRoot)).trim();
    const fileName = productName.replace(/\s+/g, "_")
        + "_silicon.dmg";
    const dmgPath = path.join(productRoot, "build", "output", fileName);
    if (!fs.existsSync(dmgPath)) {
        fail(`Missing built DMG: ${dmgPath}`);
    }
    return dmgPath;
};
const runInherited = function (args) {
    const result = spawnSync("xcrun", args, {
        cwd: projectRoot,
        stdio: "inherit"
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        fail(`xcrun failed with exit code ${String(result.status)}.`);
    }
};
const readHistory = function () {
    const result = spawnSync("xcrun", [
        "notarytool",
        "history",
        "--keychain-profile",
        keychainProfile,
        "--output-format",
        "json"
    ], {
        cwd: projectRoot,
        encoding: "utf8"
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.stderr.write(String(result.stderr || ""));
        fail(`notarytool history failed with exit code ${String(result.status)}.`);
    }
    const parsed = JSON.parse(String(result.stdout || "{}"));
    return Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.history)
            ? parsed.history
            : [];
};
const latestHistoryEntries = function (history) {
    return history.slice().sort((left, right) => {
        const leftTime = Date.parse(String(left.createdDate || ""));
        const rightTime = Date.parse(String(right.createdDate || ""));
        const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
        const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
        return normalizedRight - normalizedLeft;
    }).slice(0, 2);
};
const submit = function (productRoot) {
    const dmgPath = productDmgPath(productRoot);
    console.log(`Submitting ${dmgPath}`);
    runInherited([
        "notarytool",
        "submit",
        dmgPath,
        "--keychain-profile",
        keychainProfile
    ]);
};
const showLatestHistory = function () {
    const latest = latestHistoryEntries(readHistory());
    if (latest.length === 0) {
        throw new Error("No notarization submissions were returned.");
    }
    latest.forEach((entry, index) => {
        if (index > 0) {
            console.log("");
        }
        console.log(`Submission ${String(index + 1)}:`);
        console.log(`Name: ${String(entry.name || "(unknown)")}`);
        console.log(`Status: ${String(entry.status || "(unknown)")}`);
        console.log(`Created: ${String(entry.createdDate || "(unknown)")}`);
        console.log(`ID: ${String(entry.id || "(unknown)")}`);
    });
};
const staple = function (productRoot) {
    const dmgPath = productDmgPath(productRoot);
    console.log(`Stapling ${dmgPath}`);
    runInherited([
        "stapler",
        "staple",
        dmgPath
    ]);
};
const main = function () {
    requireMacOS();
    const action = String(process.argv[2] || "").trim();
    if (action === "submit") {
        submit(resolveProductRoot());
        return;
    }
    if (action === "history") {
        showLatestHistory();
        return;
    }
    if (action === "staple") {
        staple(resolveProductRoot());
        return;
    }
    fail("Unknown notarization action. Expected submit, history, or staple.");
};
main();
