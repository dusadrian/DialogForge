"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const readTypeScriptFiles = function (directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        return [];
    }
    return fs.readdirSync(directoryPath, {
        withFileTypes: true
    }).flatMap((entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            return readTypeScriptFiles(entryPath);
        }
        return entry.isFile() && entry.name.endsWith(".ts")
            ? [entryPath]
            : [];
    });
};
const importSpecifiers = function (source) {
    const specifiers = [];
    const patterns = [
        /\bfrom\s+["']([^"']+)["']/g,
        /\brequire\(\s*["']([^"']+)["']\s*\)/g,
        /\bimport\(\s*["']([^"']+)["']\s*\)/g
    ];
    patterns.forEach((pattern) => {
        for (const match of source.matchAll(pattern)) {
            specifiers.push(match[1]);
        }
    });
    return specifiers;
};
const resolveImport = function (sourceFile, specifier) {
    if (!specifier.startsWith(".")) {
        return "";
    }
    return path.resolve(path.dirname(sourceFile), specifier);
};
const importsUnder = function (relativeDirectory) {
    const directoryPath = path.join(rootDir, relativeDirectory);
    return readTypeScriptFiles(directoryPath).flatMap((sourceFile) => {
        const source = fs.readFileSync(sourceFile, "utf8");
        return importSpecifiers(source).map((specifier) => ({
            sourceFile,
            specifier,
            targetPath: resolveImport(sourceFile, specifier)
        }));
    });
};
const relative = function (filePath) {
    return path.relative(rootDir, filePath);
};
const assertNoStaticIpcChannelLiterals = function () {
    const sourceFiles = [
        ...readTypeScriptFiles(path.join(rootDir, "build")),
        ...readTypeScriptFiles(path.join(rootDir, "shared"))
    ];
    const patterns = [
        /\b(?:ipcMain|ipcRenderer)\.(?:handle|on|invoke|send)\(\s*["']([^"']+)["']/g,
        /\bwebContents\.send\(\s*["']([^"']+)["']/g
    ];
    const violations = sourceFiles.flatMap((sourceFile) => {
        const source = fs.readFileSync(sourceFile, "utf8");

        return patterns.flatMap((pattern) => {
            return Array.from(source.matchAll(pattern)).map((match) => ({
                source: relative(sourceFile),
                channel: match[1]
            }));
        });
    }).filter((record) => {
        return record.channel !== "send-to";
    });

    assert.deepStrictEqual(
        violations,
        [],
        "Static IPC channels must use an owner-local typed route or event map."
    );
};
const assertNoImportsInto = function (sourceDirectory, forbiddenDirectory, message) {
    const forbiddenPath = path.join(rootDir, forbiddenDirectory);
    const violations = importsUnder(sourceDirectory).filter((record) => {
        return record.targetPath === forbiddenPath
            || record.targetPath.startsWith(forbiddenPath + path.sep);
    });
    assert.deepStrictEqual(violations.map((record) => ({
        source: relative(record.sourceFile),
        import: record.specifier
    })), [], message);
};
assertNoImportsInto("shared", "products", "Shared code must not import product implementations.");
assertNoImportsInto("shared/runtime", "shared/base-app", "Runtime code must not depend on the base application UI.");
assertNoImportsInto("shared/runtime", "shared/shell-electron", "Provider-neutral runtime code must not depend on the Electron shell.");
assertNoImportsInto("shared/core", "shared/base-app", "Core contracts must not depend on the base application UI.");
assertNoImportsInto("shared/core", "shared/shell-electron", "Core contracts must not depend on the Electron shell.");
assertNoImportsInto("shared/core", "shared/dataset-editor", "Core contracts must not depend on feature implementations.");
assertNoImportsInto("shared/core", "shared/script-editor", "Core contracts must not depend on feature implementations.");
assertNoImportsInto("shared/core", "shared/dialog-runtime", "Core contracts must not depend on dialog-runtime implementations.");
assertNoImportsInto("shared/core", "products", "Core contracts must not depend on product implementations.");
assertNoImportsInto("shared/runtime/provider-contract", "shared/runtime/providers/r", "Runtime provider contracts must not import the R provider.");
assertNoImportsInto("shared/runtime/provider-contract", "shared/runtime/providers/python", "Runtime provider contracts must not import the Python provider.");
assertNoStaticIpcChannelLiterals();
console.log("Architecture import boundaries verified.");
