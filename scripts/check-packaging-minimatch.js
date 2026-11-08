"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { FileMatcher } = require("app-builder-lib/out/fileMatcher");
const { mergeASARs } = require("@electron/universal/dist/cjs/asar-utils");
const asar = require("@electron/asar");


const checkDependencyCompatibility = function() {
    const requireAsar = createRequire(require.resolve("@electron/asar"));
    const consumers = [
        require.resolve("app-builder-lib"),
        require.resolve("@electron/universal"),
        require.resolve("@electron/asar"),
        requireAsar.resolve("glob")
    ];

    for (const consumer of consumers) {
        const requireDependency = createRequire(consumer);

        assert.strictEqual(
            requireDependency("minimatch/package.json").version,
            "11.0.5",
            `${consumer} must resolve the patched matcher.`
        );
    }

    // This older consumer calls the module itself as a function. A broad
    // parent override would silently replace that API with an exports object.
    const requireUniversal = createRequire(require.resolve("@electron/universal"));
    const requireDirCompare = createRequire(requireUniversal.resolve("dir-compare"));
    const match = requireDirCompare("minimatch");

    assert.strictEqual(typeof match, "function", "dir-compare");
    assert.strictEqual(match("assets/icon.png", "**/*.png"), true);
    assert.strictEqual(match("assets/icon.txt", "**/*.png"), false);
};


const checkPackagedFileSelection = function(root) {
    const source = path.join(root, "app");
    const matcher = new FileMatcher(source, path.join(root, "out"), (value) => {
        return value;
    }, [
        "scripts",
        "product/**/*",
        "r-runtime/**/*",
        "!r-runtime/native-retired-*/**/*",
        "!product/**/*.{ts,map}"
    ]);
    const filter = matcher.createFilter();
    const cases = [
        ["scripts", true, true],
        ["scripts/start.js", false, true],
        ["scripts/nested/helper.js", false, true],
        ["product/dialogs/example/actions.js", false, true],
        ["product/.settings.json", false, true],
        ["product/bootstrap/contribution.ts", false, false],
        ["product/bootstrap/contribution.js.map", false, false],
        ["r-runtime/native/arm64/helper.so", false, true],
        ["r-runtime/native-retired-old/arm64/helper.so", false, false],
        ["private/token.txt", false, false]
    ];

    for (const [relativePath, directory, included] of cases) {
        assert.strictEqual(filter(path.join(source, relativePath), {
            isDirectory() {
                return directory;
            }
        }), included, relativePath);
    }
};


const checkUniversalArchiveMerge = async function(root) {
    const archives = {};

    for (const arch of ["x64", "arm64"]) {
        const directory = path.join(root, arch);

        fs.mkdirSync(path.join(directory, "assets"), { recursive: true });
        fs.writeFileSync(path.join(directory, "index.js"), "module.exports = 42;\n");
        fs.writeFileSync(path.join(directory, "assets", `${arch}.txt`), arch);
        archives[arch] = path.join(root, `${arch}.asar`);
        await asar.createPackage(directory, archives[arch]);
    }

    const mergeOptions = {
        x64AsarPath: archives.x64,
        arm64AsarPath: archives.arm64,
        outputAsarPath: path.join(root, "universal.asar")
    };

    await assert.rejects(mergeASARs({
        ...mergeOptions,
        singleArchFiles: "*.node"
    }), /not covered by allowList/);

    await mergeASARs({
        ...mergeOptions,
        singleArchFiles: "{x64,arm64}.txt"
    });

    for (const arch of ["x64", "arm64"]) {
        assert.strictEqual(
            asar.extractFile(mergeOptions.outputAsarPath, `assets/${arch}.txt`).toString(),
            arch
        );
    }
    assert.strictEqual(
        asar.extractFile(mergeOptions.outputAsarPath, "index.js").toString(),
        "module.exports = 42;\n"
    );
};


const main = async function() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "packaging-minimatch-"));

    try {
        checkDependencyCompatibility();
        checkPackagedFileSelection(root);
        await checkUniversalArchiveMerge(root);
        console.log("Packaging file filters, legacy matchers and universal ASAR merging passed.");
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
