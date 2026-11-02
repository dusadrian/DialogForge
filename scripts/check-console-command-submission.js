"use strict";

const assert = require("node:assert/strict");
const {
    createConsoleVisibleCommandController
} = require("../dist/src/console/renderer/consoleVisibleCommandController");
const {
    planConsoleInputExecution
} = require("../dist/src/console/terminal/consoleInputExecution");
const {
    createScriptExecutionController
} = require("../dist/src/script-editor/renderer/scriptExecutionController");


const successfulReceipt = function(request, index) {
    const parentId = `command-${index}`;

    return {
        ok: true,
        evaluationOutcome: "success",
        transcriptEvents: [
            {
                type: "submitted",
                id: `${parentId}-input`,
                parentId,
                text: request.text,
                source: request.source
            },
            {
                type: "output",
                id: `${parentId}-output`,
                parentId,
                streamName: "stdout",
                message: `result ${index}\n`
            },
            {
                type: "completed",
                id: `${parentId}-completed`,
                parentId,
                state: "idle"
            }
        ]
    };
};


const createSubmissionFixture = function(options = {}) {
    const requests = [];
    const history = [];
    const completions = [];
    const busy = [];
    const fragmentChecks = [];
    let controller;

    controller = createConsoleVisibleCommandController({
        getSession: function() {
            return { status: "ready" };
        },
        startSession: async function() {
            throw new Error("The fixture runtime is already ready.");
        },
        renderStatus: function() {
            throw new Error("The fixture must not render an unavailable runtime.");
        },
        recordHistory: function(text) {
            history.push(text);
        },
        registerCompletionInput: function(text) {
            completions.push(text);
        },
        setRuntimeBusy: function(value) {
            busy.push(value);
        },
        readOutputWidth: function() {
            return 96;
        },
        checkFragment: async function(code) {
            fragmentChecks.push(code);

            if (options.checkFragment) {
                return options.checkFragment(code);
            }

            return "complete";
        },
        executeCommand: async function(request) {
            requests.push(request);

            // Runtime submitted echoes must not add each chunk to history.
            controller.recordSubmittedCommand(request.text, request.source);

            if (options.executeCommand) {
                return options.executeCommand(request, requests.length, controller);
            }

            return successfulReceipt(request, requests.length);
        }
    });

    return {
        controller,
        requests,
        history,
        completions,
        busy,
        fragmentChecks
    };
};


const checkCompleteCommands = async function() {
    const commands = [
        "class(rivers)",
        "x <- type.convert(rivers, as.is = TRUE)",
        "class(x)"
    ];
    const text = commands.join("\n");
    const fixture = createSubmissionFixture();
    const receipt = await fixture.controller.executeWithReceipt(text, "console.fixture");

    assert.equal(receipt.accepted, true);
    assert.deepEqual(fixture.requests, commands.map(function(command) {
        return {
            text: command,
            source: "console.fixture",
            outputWidth: 96
        };
    }), "Each completed expression must become its own visible command.");
    assert.deepEqual(fixture.history, [text]);
    assert.deepEqual(fixture.completions, [text]);
    assert.equal(fixture.busy[0], true);
    assert.equal(fixture.busy.at(-1), false);
    assert.equal(fixture.busy.slice(0, -1).every(Boolean), true);
    assert.equal(receipt.result.ok, true);
    assert.equal(receipt.result.evaluationOutcome, "success");
    assert.deepEqual(
        receipt.result.transcriptEvents.map(function(event) {
            return [event.type, event.text || event.message || event.state];
        }),
        commands.flatMap(function(command, index) {
            return [
                ["submitted", command],
                ["output", `result ${index + 1}\n`],
                ["completed", "idle"]
            ];
        }),
        "Aggregated receipts must retain each input/output/completion boundary."
    );

    fixture.controller.recordSubmittedCommand("external_command()", "script.fixture");
    assert.deepEqual(fixture.history, [text, "external_command()"]);
};


const checkMultilineCall = async function() {
    const callLines = ["sum(", "    1,", "    2", ")"];
    const call = callLines.join("\n");
    const incompleteFragments = new Set([
        "sum(",
        "sum(\n    1,",
        "sum(\n    1,\n    2"
    ]);
    const checkFragment = function(code) {
        return incompleteFragments.has(code) ? "incomplete" : "complete";
    };
    const text = `${call}\nclass(rivers)`;
    const expected = [call, "class(rivers)"];
    const plan = await planConsoleInputExecution(text, async function(code) {
        return checkFragment(code);
    });

    assert.deepEqual(plan, { chunks: expected, incomplete: false, remainder: "" });

    const fixture = createSubmissionFixture({ checkFragment });
    const receipt = await fixture.controller.executeWithReceipt(text, "console.fixture");

    assert.equal(receipt.accepted, true);
    assert.deepEqual(fixture.requests.map(request => request.text), expected);
    assert.deepEqual(fixture.fragmentChecks, [
        "sum(",
        "sum(\n    1,",
        "sum(\n    1,\n    2",
        call,
        "class(rivers)"
    ]);
    assert.deepEqual(fixture.history, [text]);
};


const checkSemicolonInput = async function() {
    const text = "1; 2; invisible(3); 4";
    const fixture = createSubmissionFixture();

    await fixture.controller.executeWithReceipt(text, "console.fixture");

    assert.deepEqual(fixture.requests.map(request => request.text), [text]);
    assert.deepEqual(fixture.fragmentChecks, []);
    assert.deepEqual(fixture.history, [text]);
};


const checkArrayReceipts = async function() {
    const fixture = createSubmissionFixture({
        executeCommand: async function(request, index) {
            return successfulReceipt(request, index).transcriptEvents;
        }
    });
    const receipt = await fixture.controller.executeWithReceipt("1\n2", "console.fixture");

    assert.equal(receipt.accepted, true);
    assert.equal(Array.isArray(receipt.result), true);
    assert.deepEqual(receipt.result.map(event => event.id), [
        "command-1-input", "command-1-output", "command-1-completed",
        "command-2-input", "command-2-output", "command-2-completed"
    ]);
};


const checkStoppedSubmission = async function(outcome) {
    const fixture = createSubmissionFixture({
        executeCommand: async function(request, index, controller) {
            const receipt = successfulReceipt(request, index);

            if (index !== 2) {
                return receipt;
            }

            if (outcome === "retired") {
                controller.retire();
                return receipt;
            }

            receipt.ok = false;

            if (outcome === "session_lost" || outcome === "not_started") {
                receipt.executionDisposition = outcome;
                delete receipt.evaluationOutcome;
            }
            else {
                receipt.evaluationOutcome = outcome;
            }

            receipt.transcriptEvents[2] = {
                type: "failed",
                id: "command-2-failed",
                parentId: "command-2",
                message: outcome
            };

            return receipt;
        }
    });
    const text = "first()\nsecond()\nmust_not_run()";
    const receipt = await fixture.controller.executeWithReceipt(text, "console.fixture");

    assert.deepEqual(
        fixture.requests.map(request => request.text),
        ["first()", "second()"],
        `${outcome} must prevent later chunks from executing.`
    );
    assert.deepEqual(fixture.history, [text]);
    assert.deepEqual(fixture.completions, [text]);

    if (outcome === "retired") {
        assert.equal(receipt.accepted, false);
        assert.equal(receipt.result, undefined);
        return;
    }

    assert.equal(receipt.accepted, true);
    assert.equal(receipt.result.ok, false);
    assert.equal(receipt.result.transcriptEvents.length, 6);
    assert.equal(receipt.result.transcriptEvents.at(-1).message, outcome);

    if (outcome === "session_lost" || outcome === "not_started") {
        assert.equal(receipt.result.executionDisposition, outcome);
    }
    else {
        assert.equal(receipt.result.evaluationOutcome, outcome);
    }

    assert.equal(fixture.busy.at(-1), false);
};


const checkScriptSelection = async function(text, expectedChunks) {
    const batches = [];
    const controller = createScriptExecutionController({
        transport: {
            invoke: async function(channel, input) {
                if (channel === "base-app:checkScriptFragment") {
                    return { state: "complete" };
                }

                assert.equal(channel, "base-app:runScriptCodeBatch");
                batches.push(input);
                return { status: "submitted" };
            }
        },
        getMonaco: function() {
            return {};
        },
        getActiveTab: function() {
            return {
                model: {
                    getValueInRange: function() {
                        return text;
                    }
                }
            };
        },
        getEditor: function() {
            return {
                getSelection: function() {
                    return {
                        isEmpty: function() {
                            return false;
                        },
                        startLineNumber: 1,
                        endLineNumber: text.split("\n").length
                    };
                }
            };
        }
    });

    await controller.runAtCursor();

    assert.deepEqual(
        batches,
        [{ chunks: expectedChunks }],
        "Script selections must use the same completed-expression chunks as console input."
    );
};


const main = async function() {
    await checkCompleteCommands();
    await checkMultilineCall();
    await checkSemicolonInput();
    await checkArrayReceipts();

    for (const outcome of ["error", "interrupted", "session_lost", "not_started", "retired"]) {
        await checkStoppedSubmission(outcome);
    }

    const riversCommands = [
        "class(rivers)",
        "x <- type.convert(rivers, as.is = TRUE)",
        "class(x)"
    ];
    await checkScriptSelection(riversCommands.join("\n"), riversCommands);
    await checkScriptSelection("1; 2; 3", ["1; 2; 3"]);

    console.log("Console/script splitting, receipts, history and stop cases passed.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
