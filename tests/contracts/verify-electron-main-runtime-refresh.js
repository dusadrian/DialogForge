"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rootDir = process.cwd();
const mainPath = path.join(rootDir, "build/scripts/electron-main.ts");
const runtimeCompositionPath = path.join(rootDir, "shared/shell-electron/runtime/runtimeIpcComposition.ts");
const mainWindowCompositionPath = path.join(rootDir, "shared/shell-electron/windows/mainWindowComposition.ts");
const runtimeIpcPath = path.join(rootDir, "shared/runtime/session/runtimeSessionIpcController.ts");
const zoomControllerPath = path.join(rootDir, "shared/shell-electron/windows/mainWindowZoomController.ts");
const source = [
    fs.readFileSync(mainPath, "utf8"),
    fs.readFileSync(runtimeCompositionPath, "utf8"),
    fs.readFileSync(mainWindowCompositionPath, "utf8")
].join("\n");
const runtimeComposition = fs.readFileSync(runtimeCompositionPath, "utf8");
const runtimeIpc = fs.readFileSync(runtimeIpcPath, "utf8");
const zoomController = fs.readFileSync(zoomControllerPath, "utf8");
const visibleCommandStart = runtimeComposition.indexOf(
    "const executeVisibleCommandAndBroadcast"
);
const visibleCommandBroadcaster = runtimeComposition.slice(
    visibleCommandStart,
    runtimeComposition.indexOf(
        "createRuntimeSessionIpcController",
        visibleCommandStart
    )
);
assert.ok(runtimeIpc.includes("runtimeCommandIpcChannels.executeVisible") &&
    runtimeIpc.includes("return options.executeVisibleCommand(request);") &&
    source.includes("executeVisibleCommand: executeVisibleCommandAndBroadcast"), "visible command IPC handler must use the shared broadcaster");
assert.ok(visibleCommandBroadcaster.includes("bridge.sendTranscriptEvents(events);"), "visible command broadcaster must broadcast transcript events");
assert.ok(!visibleCommandBroadcaster.includes("sendWorkspaceSnapshot(await runtimeSessionManager.listWorkspaceObjects());"), "visible command broadcaster must not synchronously snapshot the full workspace");
assert.ok(visibleCommandBroadcaster.includes("void bridge.broadcastRuntimeEvents().catch"), "visible command broadcaster must fan out runtime events asynchronously");
assert.ok(visibleCommandBroadcaster.includes("bridge.sendTranscriptEvents(events);"), "visible command broadcaster must still broadcast transcript events");
assert.ok(source.includes("createMainWindowZoomController"), "main process must compose the shared zoom controller");
assert.ok(zoomController.includes("fontShortcutAction"), "zoom controller must detect DialogR-style zoom shortcuts");
assert.ok(zoomController.includes("before-input-event"), "zoom controller must intercept Cmd/Ctrl +/- before Chromium handles it");
assert.ok(source.includes("dialogZoomFactor"), "main process must persist shared zoom factor in settings");
assert.ok(zoomController.includes("shellWindowEventChannels.mainZoomFactor"), "zoom controller must notify renderers when zoom changes");
assert.ok(zoomController.includes("setZoomFactor") && zoomController.includes("zoomFactor"), "zoom controller must apply the shared zoom factor to windows");
console.log("Electron main runtime refresh contract verified.");
