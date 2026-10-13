"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const dialogRBrowserHost = fs.readFileSync(
    path.join(rootDir, "src/shell-web/pages/shell.js"),
    "utf8"
);
const webRCompletionAdapter = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/webr/webRCompletionAdapter.ts"),
    "utf8"
);
const webRConsoleCompletionAdapter = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/webr/webRConsoleCompletionAdapter.ts"),
    "utf8"
);
const sharedRDispatch = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/r/r-sources/runtimeDispatchCore.R"),
    "utf8"
);
const rCompletionContext = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/r/completions/rCompletionContext.ts"),
    "utf8"
);
const rRequestedPackages = fs.readFileSync(
    path.join(rootDir, "src/runtime/providers/r/completions/rRequestedPackages.ts"),
    "utf8"
);
const shellWebTsconfig = fs.readFileSync(
    path.join(rootDir, "tsconfig.shell-web.json"),
    "utf8"
);

const commonCompletion = fs.readFileSync(path.join(rootDir, "src/runtime/providers/r/completions/rConsoleRuntimeCompletion.ts"), "utf8");
assert.ok(
    dialogRBrowserHost.includes("readWebRConsoleCompletionResult")
        && dialogRBrowserHost.includes("/browser-esm/src/runtime/providers/webr/webRConsoleCompletionAdapter.js")
        && dialogRBrowserHost.includes("/browser-esm/src/runtime/providers/r/completions/rCompletionContext.js")
        && dialogRBrowserHost.includes("/browser-esm/src/runtime/providers/r/completions/rInternalCompletionSymbols.js")
        && dialogRBrowserHost.includes("/browser-esm/src/runtime/providers/r/completions/rRequestedPackages.js")
        && dialogRBrowserHost.includes("contextParser: getRCompletionContext"),
    "browser console completion fetch must call the WebR provider completion adapter"
);
assert.ok(
    dialogRBrowserHost.includes("packageRequestParser: readRRequestedPackages"),
    "browser console completion model must inject the R package-request parser"
);
assert.ok(
    dialogRBrowserHost.includes("suppressedTerminalSymbols: rInternalCompletionSymbolNames")
        && commonCompletion.includes("filterRInternalCompletionSymbols(")
        && webRConsoleCompletionAdapter.includes("createRConsoleCompletionReader")
        && sharedRDispatch.includes("runtime_completion_internal_symbol"),
    "browser console completion fetch must suppress DialogForge internal R helper symbols"
);
assert.ok(
    rCompletionContext.includes("getRCompletionContext")
        && rCompletionContext.includes("namespace-internal")
        && rCompletionContext.includes("data-mask-variable")
        && rCompletionContext.includes("DATA_MASKING_FUNCTIONS"),
    "R provider completion context must own R namespace and data-mask completion parsing"
);
assert.ok(
    rRequestedPackages.includes("readRRequestedPackages")
        && rRequestedPackages.includes("library|require|requireNamespace"),
    "R provider completion package parser must own R package request parsing"
);
assert.ok(
    sharedRDispatch.includes("runtime_completion_from_package")
        && webRConsoleCompletionAdapter.includes("getRuntime()!.readCompletions(request)")
        && commonCompletion.includes("readRConsoleRuntimeCompletion")
        && !webRCompletionAdapter.includes("evalRString")
        && !webRCompletionAdapter.includes("readWebRCompletionResult"),
    "Browser completions must use the shared R query path without an alternate R-string evaluator"
);
assert.ok(
    webRConsoleCompletionAdapter.includes("bindings.isRuntimeBusy()")
        && webRConsoleCompletionAdapter.includes("runtimeSessionManager: RuntimeSessionManager | null | undefined")
        && webRConsoleCompletionAdapter.includes("getRuntime()!.readCompletions(request)")
        && !webRConsoleCompletionAdapter.includes("createBrowserWebRCompletionProvider")
        && !webRConsoleCompletionAdapter.includes("createBrowserWebRCompletionSessionManager")
        && !dialogRBrowserHost.includes("state.completionSessionManager")
        && dialogRBrowserHost.includes("webRRuntimeSession()?.runtimeSessionManager")
        && dialogRBrowserHost.includes("runtimeSessionManager: webRCompletionSessionManager()")
        && dialogRBrowserHost.includes("isRuntimeBusy: function ()"),
    "WebR completion adapter must use the page-owned shared session manager without creating a completion-only runtime manager"
);
assert.ok(
    !dialogRBrowserHost.includes('"mean", "median", "sd", "var", "lm", "glm"')
        && !dialogRBrowserHost.includes('"t.test", "summary", "plot", "hist"')
        && !webRCompletionAdapter.includes('"mean", "median", "sd", "var", "lm", "glm"')
        && !webRCompletionAdapter.includes('"t.test", "summary", "plot", "hist"'),
    "browser console completion fetch must not return a hardcoded package export list"
);
assert.ok(
    commonCompletion.includes("context.chain === context.object")
        && commonCompletion.includes("entry.columns.map")
        && webRConsoleCompletionAdapter.includes("workspaceEntries: bindings.workspaceEntries")
        && dialogRBrowserHost.includes("workspaceEntries"),
    "WebR console completion adapter must preserve fast local data-frame column completions"
);
assert.ok(
    dialogRBrowserHost.includes("state.console?.completionModel?.ingestObjectNames(")
        && dialogRBrowserHost.includes("filterRInternalCompletionSymbols(workspaceObjectNames())"),
    "browser workspace refreshes must add newly imported objects to local console completion"
);
assert.ok(
    shellWebTsconfig.includes("src/runtime/providers/webr/webRCompletionAdapter.ts")
        && shellWebTsconfig.includes("src/runtime/providers/webr/webRConsoleCompletionAdapter.ts")
        && shellWebTsconfig.includes("src/runtime/providers/r/completions/rCompletionContext.ts")
        && shellWebTsconfig.includes("src/runtime/providers/r/completions/rInternalCompletionSymbols.ts")
        && shellWebTsconfig.includes("src/runtime/providers/r/completions/rRequestedPackages.ts"),
    "WebR completion adapter and R completion parsers must be included in the browser ESM build"
);

console.log("Browser completion runtime bridge verified.");
