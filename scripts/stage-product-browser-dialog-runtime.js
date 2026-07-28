"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");


const rootDir = path.resolve(__dirname, "..");


const readArgs = function() {
    const options = {
        productPath: "",
        outputDir: path.join(rootDir, "dist")
    };
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        const current = args[index];

        if (current === "--product-path") {
            index += 1;
            options.productPath = path.resolve(args[index] || "");
            continue;
        }

        if (current === "--out-dir") {
            index += 1;
            options.outputDir = path.resolve(args[index] || options.outputDir);
            continue;
        }

        throw new Error(`Unknown product browser runtime argument: ${current}`);
    }

    if (
        !options.productPath
        || options.productPath === path.parse(options.productPath).root
    ) {
        throw new Error(
            "A product path is required to stage its browser dialog runtime."
        );
    }

    return options;
};


const customJSRuntimeEntrySource = function(sourcePath) {
    return [
        `import * as productRuntime from ${JSON.stringify(`./${path.basename(sourcePath)}`)};`,
        "",
        "const globalRuntime = globalThis;",
        "const modules = Array.isArray(globalRuntime.dialogForgeProfileCustomJSModules)",
        "    ? globalRuntime.dialogForgeProfileCustomJSModules",
        "    : [];",
        "",
        "if (!modules.includes(productRuntime)) {",
        "    modules.push(productRuntime);",
        "}",
        "",
        "globalRuntime.dialogForgeProfileCustomJSModules = modules;",
        "",
        "export default productRuntime;"
    ].join("\n");
};


const productContributionEntrySource = function(sourcePath) {
    return [
        `import * as productModule from ${JSON.stringify(`./${path.basename(sourcePath)}`)};`,
        "",
        "const productContribution = productModule.productContribution",
        "    || productModule.default",
        "    || null;",
        "",
        "globalThis.dialogForgeProductContribution = productContribution;",
        "",
        "export { productContribution };",
        "export default productContribution;"
    ].join("\n");
};


const buildBrowserModule = function(options) {
    if (!fs.existsSync(options.sourcePath)) {
        fs.mkdirSync(path.dirname(options.outputPath), {
            recursive: true
        });
        fs.writeFileSync(options.outputPath, options.fallbackSource);
        return;
    }

    fs.mkdirSync(path.dirname(options.outputPath), {
        recursive: true
    });
    esbuild.buildSync({
        stdin: {
            contents: options.entrySource(options.sourcePath),
            loader: "ts",
            resolveDir: path.dirname(options.sourcePath),
            sourcefile: options.sourceFileName
        },
        outfile: options.outputPath,
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        sourcemap: false
    });
};


const stageProductBrowserDialogRuntime = function(options) {
    const sourcePath = path.join(
        options.productPath,
        "dialogs",
        "customJSRuntime.ts"
    );
    const outputPath = path.join(
        options.outputDir,
        "browser-product",
        "dialogs",
        "customJSRuntime.js"
    );

    buildBrowserModule({
        sourcePath,
        outputPath,
        entrySource: customJSRuntimeEntrySource,
        sourceFileName: "dialogforge-product-browser-runtime.ts",
        fallbackSource: "export default {};\n"
    });
    buildBrowserModule({
        sourcePath: path.join(
            options.productPath,
            "bootstrap",
            "productContribution.ts"
        ),
        outputPath: path.join(
            options.outputDir,
            "browser-product",
            "bootstrap",
            "productContribution.js"
        ),
        entrySource: productContributionEntrySource,
        sourceFileName: "dialogforge-product-browser-contribution.ts",
        fallbackSource: [
            "const productContribution = null;",
            "globalThis.dialogForgeProductContribution = productContribution;",
            "export { productContribution };",
            "export default productContribution;",
            ""
        ].join("\n")
    });

    const runtimeProfileSource = path.join(
        options.productPath,
        "runtime",
        "runtimeControlProfile.R"
    );
    const runtimeProfileOutput = path.join(
        options.outputDir,
        "browser-product",
        "runtime",
        "runtimeControlProfile.R"
    );

    fs.mkdirSync(path.dirname(runtimeProfileOutput), {
        recursive: true
    });
    if (fs.existsSync(runtimeProfileSource)) {
        fs.copyFileSync(runtimeProfileSource, runtimeProfileOutput);
    }
    else {
        fs.writeFileSync(runtimeProfileOutput, "");
    }
};


const main = function() {
    stageProductBrowserDialogRuntime(readArgs());
};


if (require.main === module) {
    main();
}


module.exports = {
    stageProductBrowserDialogRuntime
};
