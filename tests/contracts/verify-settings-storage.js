"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mergeSettingsLayers, readEffectiveSettings, writeUserSettings } = require("../../shared/shell-electron/settings/settingsStorage");
const writeJson = function (filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
};
const verifyLayerMerge = function () {
    const merged = mergeSettingsLayers({
        dependencies: ["httpgd", "QCA"],
        dialogRuntimeRequirements: {
            calibrate: { rPackages: ["QCA"] }
        },
        terminalSettings: {
            fontSize: 13,
            cursorBlink: true
        },
        uiActionCommandVisibility: "hidden",
        language: "en_US"
    }, {
        dependencies: ["QCA", "venn"],
        dialogRuntimeRequirements: {
            venn: { rPackages: ["QCA", "venn"] }
        }
    }, {
        dependencies: ["admisc"],
        terminalSettings: {
            fontSize: 15
        },
        uiActionCommandVisibility: "visible",
        language: "ro_RO"
    });
    assert.deepStrictEqual(merged.dependencies, ["httpgd", "QCA", "venn", "admisc"]);
    assert.deepStrictEqual(merged.dialogRuntimeRequirements, {
        calibrate: { rPackages: ["QCA"] },
        venn: { rPackages: ["QCA", "venn"] }
    });
    assert.deepStrictEqual(merged.terminalSettings, {
        fontSize: 15,
        cursorBlink: true
    });
    assert.strictEqual(merged.uiActionCommandVisibility, "visible");
    assert.strictEqual(merged.language, "ro_RO");
};
const verifyReadAndWrite = function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-settings-"));
    const paths = {
        systemSettingsPath: path.join(root, "system.json"),
        profileSettingsPath: path.join(root, "profile.json"),
        userSettingsPath: path.join(root, "user", "settings.json")
    };
    writeJson(paths.systemSettingsPath, {
        dependencies: ["httpgd"],
        dialogRuntimeRequirements: {
            frequencies: { rPackages: ["admisc"] }
        },
        terminalSettings: {
            fontFamily: "system",
            fontSize: 13
        },
        windowStates: {
            main: { width: 1 }
        }
    });
    writeJson(paths.profileSettingsPath, {
        dependencies: ["declared"],
        dialogRuntimeRequirements: {
            summaries: { rPackages: ["declared"] }
        }
    });
    writeJson(paths.userSettingsPath, {
        dependencies: ["user-owned-should-not-win-alone"],
        dialogRuntimeRequirements: {
            userDialog: { rPackages: ["user"] }
        },
        terminalSettings: {
            fontSize: 16
        },
        uiActionCommandVisibility: "visible",
        enableAuthoringFeatures: true,
        dialogs: {
            transient: true
        }
    });
    const effective = readEffectiveSettings(paths);
    assert.deepStrictEqual(effective.dependencies, ["httpgd", "declared", "user-owned-should-not-win-alone"]);
    assert.deepStrictEqual(effective.terminalSettings, {
        fontFamily: "system",
        fontSize: 16
    });
    assert.strictEqual(effective.uiActionCommandVisibility, "visible");
    assert.strictEqual(effective.enableAuthoringFeatures, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(effective, "windowStates"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(effective, "dialogs"), false);
    const written = writeUserSettings(paths, {
        dependencies: ["QCA"],
        dialogRuntimeRequirements: {
            calibrate: { rPackages: ["QCA"] }
        },
        terminalSettings: {
            fontSize: 18
        },
        uiActionCommandVisibility: "hidden",
        language: "ro_RO"
    });
    const saved = JSON.parse(fs.readFileSync(paths.userSettingsPath, "utf8"));
    assert.deepStrictEqual(written, {
        dialogRuntimeRequirements: {
            calibrate: { rPackages: ["QCA"] }
        },
        terminalSettings: {
            fontSize: 18
        },
        uiActionCommandVisibility: "hidden",
        enableAuthoringFeatures: true,
        language: "ro_RO"
    });
    assert.deepStrictEqual(saved, written);
};
verifyLayerMerge();
verifyReadAndWrite();
console.log("Settings storage contract verified.");
