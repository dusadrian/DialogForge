"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createVisibleCommandRequest } = require("../../shared/runtime/commands/commandProtocol");
const { createRuntimeExtensionMethodRequest } = require("../../shared/runtime/extensions/runtimeExtensionProtocol");
const { getRuntimeProvider } = require("../../shared/runtime/providers/runtimeProviderRegistry");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const verifyLocalRExists = function () {
    execFileSync("R", ["--version"], {
        stdio: "ignore"
    });
};
const verifyRVisibleCommand = async function () {
    verifyLocalRExists();
    process.env.DIALOGFORGE_R_PROCESS = "1";
    const streamedEvents = [];
    const sleep = function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    };
    const waitUntil = async function (predicate, timeoutMs) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (predicate()) {
                return;
            }
            await sleep(50);
        }
        assert.ok(predicate());
    };
    const manager = createRuntimeSessionManager(getRuntimeProvider("r", {
        onTranscriptEvents: function (events) {
            streamedEvents.push(...events);
        }
    }));
    await manager.start();
    const events = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "cat(21 + 21)",
        source: "contract-test"
    }));
    const multilineEvents = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "script_sum <- 20 + 22\ncat(script_sum)",
        source: "contract-test"
    }));
    const emptyOutputEvents = await manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "silent_value <- 42",
        source: "contract-test"
    }));
    const assertLiveConsoleEvents = function (items, expectedOutput) {
        assert.strictEqual(items[0].type, "submitted");
        assert.strictEqual(items[1].type, "completed");
        assert.strictEqual(items[1].state, "busy");
        assert.ok(items.some((event) => {
            return event.type === "prompt_state"
                && event.inputPrompt === "> "
                && event.continuationPrompt === "+ ";
        }));
        assert.strictEqual(items[items.length - 1].type, "completed");
        assert.strictEqual(items[items.length - 1].state, "idle");
        if (expectedOutput === null) {
            assert.ok(!items.some((event) => {
                return event.type === "output";
            }));
            return;
        }
        const output = items.find((event) => {
            return event.type === "output";
        });
        assert.ok(output);
        assert.strictEqual(output.message, expectedOutput);
        assert.strictEqual(output.streamName, "stdout");
    };
    assertLiveConsoleEvents(events, "42");
    assertLiveConsoleEvents(multilineEvents, "42");
    assertLiveConsoleEvents(emptyOutputEvents, null);
    streamedEvents.length = 0;
    const slowCommand = manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "Sys.sleep(1); cat('done')",
        source: "contract-test"
    }));
    await sleep(250);
    assert.ok(streamedEvents.some((event) => {
        return event.type === "completed" && event.state === "busy";
    }));
    assertLiveConsoleEvents(await slowCommand, "done");
    streamedEvents.length = 0;
    const promptedCommand = manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "cat(readline('Name: '))",
        source: "contract-test"
    }));
    await waitUntil(() => {
        return streamedEvents.some((event) => {
            return event.type === "prompt" && event.prompt === "Name: ";
        });
    }, 2500);
    const promptEvent = streamedEvents.find((event) => {
        return event.type === "prompt" && event.prompt === "Name: ";
    });
    const promptReply = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "reply_prompt",
        params: {
            parentId: promptEvent.parentId,
            reply: "Ada"
        },
        source: "contract-test"
    }));
    const promptedEvents = await promptedCommand;
    assert.strictEqual(promptReply.status, "ready");
    assertLiveConsoleEvents(promptedEvents, "Ada");
    const completions = await manager.readCompletions({
        prefix: "mea",
        source: "contract-test",
        code: "mea",
        cursorColumn: 4,
        timeoutMs: 3200
    });
    assert.strictEqual(completions.status, "ready");
    assert.ok(completions.items.some((item) => {
        return item.label === "mean";
    }));
    const completionDir = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-completion-"));
    const completionFile = path.join(completionDir, "sample-file.csv");
    fs.writeFileSync(completionFile, "x\n1\n", "utf8");
    const pathPrefix = path.join(completionDir, "sam");
    const pathCode = "read.csv(\"" + pathPrefix;
    const pathCompletions = await manager.readCompletions({
        prefix: pathPrefix,
        source: "contract-test",
        code: pathCode,
        cursorColumn: pathCode.length + 1,
        timeoutMs: 3200
    });
    assert.strictEqual(pathCompletions.status, "ready");
    assert.ok(pathCompletions.items.some((item) => {
        return item.label === completionFile && item.kind === "file";
    }));
    const interrupted = manager.executeVisibleCommand(createVisibleCommandRequest({
        text: "Sys.sleep(5)",
        source: "contract-test"
    }));
    await sleep(300);
    const interruptResult = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "runtime.interrupt",
        source: "contract-test"
    }));
    const interruptedEvents = await interrupted;
    assert.strictEqual(interruptResult.status, "ready");
    assert.ok(interruptedEvents.some((event) => {
        return event.type === "completed" && event.state === "busy";
    }));
    assert.strictEqual(interruptedEvents[interruptedEvents.length - 1].state, "interrupted");
    await manager.stop();
};
verifyRVisibleCommand()
    .then(() => {
    console.log("R visible command contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
