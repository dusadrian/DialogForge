"use strict";

const assert = require("node:assert/strict");
const { createHelpCommandActions } = require("../dist/src/runtime/help/helpCommandActions");
const { createHelpCommandUrl, parseHelpCommandUrl } = require("../dist/src/runtime/help/helpCommandUrl");
const { parseRConsoleHelpCommand } = require("../dist/src/runtime/providers/r/help/rContextualHelp");
const { createConsoleEditorSubmissionController } = require("../dist/src/console/terminal/consoleEditorSubmissionController");

const main = async function() {
    for (const host of ["native", "webr"]) {
        const requests = [];
        const topics = [];
        let failed = false;
        let error;
        const actions = createHelpCommandActions({
            async openHelpTopic(request) {
                topics.push(request);
                if (error) { throw error; }
                return { status: "ready", topic: request.topic };
            },
            async executeVisibleCommand(request) {
                requests.push(request);
                if (error) { throw error; }
                return host === "native"
                    ? [{ type: failed ? "failed" : "output" }]
                    : { ok: !failed };
            }
        });
        assert.equal((await actions.openCommandUrl("invalid")).status, "invalid");
        assert.equal((await actions.runExample({})).status, "invalid");
        assert.equal(requests.length, 0);
        for (const kind of ["help", "vignette"]) {
            assert.equal((await actions.openCommandUrl(createHelpCommandUrl(kind, "mean"))).status,
                "ready");
        }
        assert.deepEqual(topics, [0, 1].map(() => ({
            topic: "mean", allowSearch: true, source: "base-app.help-link"
        })));
        assert.equal((await actions.openCommandUrl(createHelpCommandUrl("run", "1 + 1"))).status,
            "ready");
        assert.equal(requests.at(-1).text, "1 + 1");
        assert.equal(requests.at(-1).source, "base-app.help-link");
        for (const value of [
            'cat("100%")', 'cat("%20 %2B %zz")', '5 %% 2',
            'cat("a+b & Ω😀")', 'value <- 1\ncat(value)',
            'value <- 1\r\ncat(value)'
        ]) {
            for (const kind of ["run", "help", "vignette"]) {
                const url = createHelpCommandUrl(kind, value);
                assert.deepEqual(parseHelpCommandUrl(url), { kind, value },
                    "Help command payloads must be decoded exactly once.");
                assert.equal((await actions.openCommandUrl(url)).status, "ready");
                if (kind === "run") {
                    assert.equal(requests.at(-1).text, value);
                }
                else {
                    assert.equal(topics.at(-1).topic, value);
                }
            }
        }
        const example = await actions.runExample({ topic: "mean", package: "base" });
        assert.equal(example.status, "ready");
        assert.equal(example.message, "R help example completed.");
        assert.equal(requests.at(-1).text, 'example("mean", package = "base")');
        assert.equal(requests.at(-1).source, "base-app.help-example");
        failed = true;
        assert.equal((await actions.runExample({ topic: "mean" })).status, "error");
        assert.equal((await actions.openCommandUrl(createHelpCommandUrl("run", "stop()"))).status,
            "error");
        error = new Error("Help execution failed");
        const failure = await actions.openCommandUrl(createHelpCommandUrl("run", "stop()"));
        assert.equal(failure.status, "error");
        assert.equal(failure.message, error.message);
        await assert.rejects(actions.runExample({ topic: "mean" }), /Help execution failed/);

        for (const [input, expected] of [
            ["?base::mean", { topic: "mean", package: "base", kind: "topic", allowSearch: false }],
            ["??mean", { topic: "mean", kind: "topic", allowSearch: true }],
            ["help()", { topic: "help", kind: "topic" }],
            ["help.start()", { topic: "", kind: "home" }],
            ["utils::help.start()", { topic: "", kind: "home" }],
            ["1 + 1", null],
            ["?mean\n1 + 1", null]
        ]) {
            let value = input;
            const shown = [];
            const history = [];
            const executed = [];
            const checked = [];
            const controller = createConsoleEditorSubmissionController({
                hasModel: () => true,
                isInteractive: () => true,
                getSessionPhase: () => "ready",
                getInputValue: () => value,
                setInputValue: next => { value = next; },
                clearInput: () => { value = ""; },
                requestFocus() {},
                requestPromptFocus() {},
                refreshInteractivity() {},
                refreshPrompt() {},
                recordHelpCommand: code => history.push(code),
                parseHelpCommand: parseRConsoleHelpCommand,
                showHelpTopic: request => shown.push(request),
                checkFragment: async code => { checked.push(code); return "complete"; },
                executeCode: async code => { executed.push(code); return "ok"; }
            });
            await controller.submit();
            if (expected) {
                assert.equal(shown.length, 1, host + ": help must be routed once");
                for (const [key, expectedValue] of Object.entries(expected)) {
                    assert.equal(shown[0][key], expectedValue);
                }
                assert.deepEqual(history, [input]);
                assert.deepEqual(checked, []);
                assert.deepEqual(executed, []);
            }
            else {
                assert.deepEqual(shown, []);
                assert.deepEqual(history, []);
                assert.deepEqual(checked, [input]);
                assert.deepEqual(executed, [input]);
            }
            assert.equal(value, "");
            assert.equal(controller.isBusy(), false);
            assert.equal(controller.isSubmitting(), false);
            controller.retire();
        }
    }
    console.log("Shared help command actions cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
