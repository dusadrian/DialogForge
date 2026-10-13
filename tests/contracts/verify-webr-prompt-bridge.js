"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = (name) => fs.readFileSync(path.join(process.cwd(), "src", name), "utf8");
const promptTransport = source("runtime/providers/webr/webRPromptTransport.ts");
const control = source("runtime/providers/webr/webRSharedRuntimeControl.ts");
const promptCore = source("runtime/providers/r/r-sources/runtimePromptCore.R");
const consoleBindings = source("runtime/providers/r/r-sources/runtimeConsoleBindings.R");
const session = source("runtime/providers/webr/webRBrowserSession.ts");
const host = source("shell-web/pages/shell.js");

assert.ok(consoleBindings.includes("install_prompt_hooks()"));
assert.ok(promptCore.includes("runtime_evaluate_control_request(request)"));
assert.ok(source("runtime/providers/r/r-sources/runtimeDispatchCore.R").includes('"reply_prompt" = runtime_reply_prompt(params)'));
assert.ok(promptCore.includes("runtime_transport_decode_request(raw, TRUE, require_auth = FALSE)"));
assert.ok(promptCore.includes("transport_read(prompt_event)"));
assert.ok(!promptCore.includes('requireNamespace("askpass"'));
assert.ok(promptTransport.includes("encodeRuntimeControlRequest(request)"));
assert.ok(promptTransport.includes("runtime-worker-input-acknowledgment-timeout"));
assert.ok(control.includes('request.method === "reply_prompt"'));
assert.ok(control.includes("promptTransport.receive(message.data)"));
assert.ok(!control.includes("isInteractiveInputRequest"));
assert.ok(!session.includes('request.method === "reply_prompt"'));
assert.ok(host.includes("executeVisibleCommand(request)"));
assert.ok(source("runtime/providers/r/controllers/rVisibleCommandExecutor.ts").includes("createTranscriptEventsFromRuntimeControl"));
assert.ok(!host.includes("promptCoordinator"));
assert.ok(!promptTransport.includes("manager.requestPrompt"));
assert.ok(!promptTransport.includes("activePrompt"));
assert.ok(!fs.existsSync(path.join(process.cwd(), "src/runtime/providers/webr/webRPromptBridge.ts")));

console.log("Shared prompt source ownership contracts passed; runtime acceptance remains separate.");
