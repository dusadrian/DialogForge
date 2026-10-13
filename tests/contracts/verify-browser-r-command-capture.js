"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const read = (relativePath) => fs.readFileSync(
    path.join(rootDir, relativePath),
    "utf8"
);
const sharedExecutor = read(
    "src/runtime/providers/r/controllers/rVisibleCommandExecutor.ts"
);
const nativeSession = read(
    "src/runtime/providers/r/session/runtimeProcessController.ts"
);
const webRSession = read(
    "src/runtime/providers/webr/webRBrowserSession.ts"
);
const webRControl = read(
    "src/runtime/providers/webr/webRSharedRuntimeControl.ts"
);
const browserConsole = read("src/shell-web/browserConsoleBootstrap.ts");
const shell = read("src/shell-web/pages/shell.js");

assert.ok(
    !fs.existsSync(path.join(
        rootDir,
        "src/runtime/providers/webr/webRCommandCapture.ts"
    ))
        && !fs.existsSync(path.join(
            rootDir,
            "src/runtime/providers/webr/webRVisibleCommandRunner.ts"
        ))
        && !fs.existsSync(path.join(
            rootDir,
            "src/runtime/providers/r/commands/rCommandCapture.ts"
        )),
    "visible output capture adapters must not exist outside the APP runtime"
);
assert.ok(
    sharedExecutor.includes('method: "execute_input"')
        && sharedExecutor.includes("createTranscriptEventsFromRuntimeControl")
        && sharedExecutor.includes("readCommandWorkspaceReconciliation"),
    "the shared APP R executor must own visible command and output semantics"
);
assert.ok(
    nativeSession.includes("createRVisibleCommandExecutor")
        && webRSession.includes("createRVisibleCommandExecutor")
        && !webRSession.includes("captureR")
        && !webRControl.includes("captureR")
        && !shell.includes("captureWebRHiddenText")
        && !shell.includes("captureWebRVisibleCommand"),
    "Electron and WebR must use the same APP visible-command executor"
);
assert.ok(
    browserConsole.includes("createConsoleTranscriptController")
        && webRSession.includes("recordTranscriptEvents")
        && shell.includes("recordTranscriptEvents: function (events)"),
    "browser APP events must use the shared console transcript router"
);

console.log("Shared APP R command capture verified.");
