"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const projectRoot = path.resolve(__dirname, "../..");
const keychainProfile = String(process.env.DIALOGFORGE_NOTARY_PROFILE || "developer-id-notary").trim();
const fail = function (message) {
    throw new Error(message);
};
const requireMacOS = function () {
    if (process.platform !== "darwin") {
        fail("macOS notarization commands must run on macOS.");
    }
};
const productDmgPath = function (productId) {
    const normalizedId = String(productId || "").trim();
    if (!normalizedId) {
        fail("Missing product id. Expected DialogR or DialogQCA.");
    }
    const productRoot = path.resolve(projectRoot, "..", normalizedId);
    const manifestPath = path.join(productRoot, "product.json");
    if (!fs.existsSync(manifestPath)) {
        fail(`Missing product manifest: ${manifestPath}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const productName = String(manifest.name || manifest.id || normalizedId).trim();
    const version = String(manifest.version || "").trim();
    if (!version) {
        fail(`Missing product version in ${manifestPath}`);
    }
    const fileName = productName.replace(/\s+/g, "_")
        + `_${version}_silicon.dmg`;
    const dmgPath = path.join(projectRoot, "build", "output", fileName);
    if (!fs.existsSync(dmgPath)) {
        fail(`Missing built DMG: ${dmgPath}`);
    }
    return dmgPath;
};
const runInherited = function (args) {
    const result = (0, child_process_1.spawnSync)("xcrun", args, {
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
    const result = (0, child_process_1.spawnSync)("xcrun", [
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
const submit = function (productId) {
    const dmgPath = productDmgPath(productId);
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
const staple = function (productId) {
    const dmgPath = productDmgPath(productId);
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
    const productId = String(process.argv[3] || "").trim();
    if (action === "submit") {
        submit(productId);
        return;
    }
    if (action === "history") {
        showLatestHistory();
        return;
    }
    if (action === "staple") {
        staple(productId);
        return;
    }
    fail("Unknown notarization action. Expected submit, history, or staple.");
};
main();
