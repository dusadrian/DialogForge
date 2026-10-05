"use strict";

const assert = require("node:assert/strict");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { createBrowserWebRSession } = require("../dist/src/runtime/providers/webr/webRBrowserSession");
const { createRuntimeSessionManager } = require("../dist/src/runtime/session/runtimeSessionManager");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");

const main = async function() {
    for (const host of ["native", "webr"]) {
        for (const lateSuccess of [false, true]) {
            let current = true;
            let finish;
            const requests = [];
            const client = {
                execute(request, dispatch) {
                    requests.push(request);
                    dispatch?.onDispatched?.();
                    return new Promise(resolve => { finish = resolve; });
                },
                detach() {}
            };
            let sequence = 0;
            const manager = host === "webr" ? createBrowserWebRSession({
                isCurrentSession: () => current,
                runtimeControlClient: client,
                visibleCommands: { readConsoleOutputWidth: () => 80, recordTranscriptEvents() {} },
                async workspaceChanged() {}
            }).runtimeSessionManager : createRuntimeSessionManager({
                manifest: { id: "r", capabilities: [] },
                createSession: () => ({ providerId: "r", status: "ready", connection: "connected" }),
                commandController: createRVisibleCommandExecutor({
                    getClient: () => current ? client : null,
                    createRequestId: prefix => prefix + "-" + (++sequence)
                })
            });
            const pending = manager.executeVisibleCommandWithEffects(createVisibleCommandRequest({
                text: 'cat("retired-client")', source: "retired-client-fixture"
            }));
            for (let attempt = 0; attempt < 30 && requests.length === 0; attempt++) {
                await Promise.resolve();
            }
            assert.equal(requests.length, 1, host + ": old command physically entered the controlled adapter");
            current = false;
            await manager.stop();
            finish({ ok: lateSuccess, error: lateSuccess ? "" : "retired-adapter-failure", events: [] });
            const result = await pending;
            assert.equal(result.executionDisposition, "session_lost", host);
            assert.deepEqual(result.transcriptEvents, [], host + ": same executor discards obsolete completion");
            assert.equal(result.workspaceUpdate, null);
            if (host === "webr") {
                const unavailable = await manager.executeRuntimeMethod({ method: "fixture.method", params: {} });
                assert.equal(unavailable.status, "unavailable");
                assert.equal(requests.length, 1, "Retired worker binding must not expose its captured client");
            }
        }
    }
    console.log("Shared executor/client retirement cases passed; physical/rendered acceptance is separate.");
};
main().catch(error => { console.error(error); process.exitCode = 1; });
