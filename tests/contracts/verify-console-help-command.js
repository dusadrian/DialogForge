"use strict";

const assert = require("assert");

const {
    parseConsoleHelpCommand
} = require("../../shared/console/terminal/contextualHelp");
const {
    createConsoleEditorSubmissionController
} = require("../../shared/console/terminal/consoleEditorSubmissionController");
const {
    createHelpTopicRequest
} = require("../../shared/runtime/help/helpProtocol");
const {
    createRToolController
} = require("../../shared/runtime/providers/r/controllers/rToolController");


const createBindings = function(inputValue) {
    const calls = {
        checkFragment: 0,
        clearInput: 0,
        executeCode: 0,
        recordHelpCommand: [],
        showHelpTopic: []
    };

    return {
        calls,
        bindings: {
            hasModel: function() {
                return true;
            },
            isInteractive: function() {
                return true;
            },
            getSessionPhase: function() {
                return "ready";
            },
            getInputValue: function() {
                return inputValue;
            },
            setInputValue: function() {},
            clearInput: function() {
                calls.clearInput += 1;
            },
            requestFocus: function() {},
            requestPromptFocus: function() {},
            refreshInteractivity: function() {},
            refreshPrompt: function() {},
            scrollToPrompt: function() {},
            recordHelpCommand: function(code) {
                calls.recordHelpCommand.push(code);
            },
            showHelpTopic: function(request) {
                calls.showHelpTopic.push(request);
            },
            checkFragment: async function() {
                calls.checkFragment += 1;
                return "complete";
            },
            executeCode: async function() {
                calls.executeCode += 1;
                return "ok";
            }
        }
    };
};


const verifyParser = function() {
    assert.deepStrictEqual(parseConsoleHelpCommand("?wtable"), {
        query: "?wtable",
        topic: "wtable",
        package: undefined,
        allowSearch: false
    });
    assert.deepStrictEqual(parseConsoleHelpCommand("?declared::wtable"), {
        query: "?declared::wtable",
        topic: "wtable",
        package: "declared",
        allowSearch: false
    });
    assert.deepStrictEqual(parseConsoleHelpCommand("??wtable"), {
        query: "??wtable",
        topic: "wtable",
        package: undefined,
        allowSearch: true
    });
    assert.strictEqual(parseConsoleHelpCommand("mean(1:3)"), null);
};


const verifyHelpSubmissionBypassesRuntimeExecution = async function() {
    const setup = createBindings("?wtable");
    const controller = createConsoleEditorSubmissionController(setup.bindings);

    await controller.submit();

    assert.strictEqual(setup.calls.checkFragment, 0);
    assert.strictEqual(setup.calls.executeCode, 0);
    assert.strictEqual(setup.calls.clearInput, 1);
    assert.deepStrictEqual(setup.calls.recordHelpCommand, ["?wtable"]);
    assert.deepStrictEqual(setup.calls.showHelpTopic, [{
        query: "?wtable",
        topic: "wtable",
        package: undefined,
        allowSearch: false
    }]);
};


const verifySearchSubmissionBypassesRuntimeExecution = async function() {
    const setup = createBindings("??wtable");
    const controller = createConsoleEditorSubmissionController(setup.bindings);

    await controller.submit();

    assert.strictEqual(setup.calls.checkFragment, 0);
    assert.strictEqual(setup.calls.executeCode, 0);
    assert.deepStrictEqual(setup.calls.showHelpTopic, [{
        query: "??wtable",
        topic: "wtable",
        package: undefined,
        allowSearch: true
    }]);
};


const verifyNormalSubmissionStillExecutesRuntimeCode = async function() {
    const setup = createBindings("mean(1:3)");
    const controller = createConsoleEditorSubmissionController(setup.bindings);

    await controller.submit();

    assert.strictEqual(setup.calls.checkFragment, 1);
    assert.strictEqual(setup.calls.executeCode, 1);
    assert.strictEqual(setup.calls.showHelpTopic.length, 0);
};


const verifyRToolControllerUsesSearchMethod = async function() {
    const methods = [];
    const controller = createRToolController({
        getClient: function() {
            return {
                execute: async function(request) {
                    methods.push(request.method);

                    return {
                        ok: true,
                        result: {
                            kind: "search",
                            topic: request.params.topic,
                            matches: []
                        }
                    };
                }
            };
        },
        createRequestId: function(prefix) {
            return prefix + "-1";
        },
        checkPackageVersion: async function() {
            return "";
        }
    });

    const result = await controller.readHelpTopic(createHelpTopicRequest({
        topic: "wtable",
        allowSearch: true,
        source: "contract-test"
    }), {
        providerId: "r"
    });

    assert.deepStrictEqual(methods, ["search_help_topic"]);
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.kind, "search");
};


const verifyRToolControllerKeepsPathSeparateFromBody = async function() {
    const controller = createRToolController({
        getClient: function() {
            return {
                execute: async function() {
                    return {
                        ok: true,
                        result: {
                            kind: "single",
                            path: "/library/declared/html/weighted.html",
                            body: ""
                        }
                    };
                }
            };
        },
        createRequestId: function(prefix) {
            return prefix + "-1";
        },
        checkPackageVersion: async function() {
            return "";
        }
    });

    const result = await controller.readHelpTopic(createHelpTopicRequest({
        topic: "wtable",
        source: "contract-test"
    }), {
        providerId: "r"
    });

    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.path, "/library/declared/html/weighted.html");
    assert.strictEqual(result.body, "");
};


const main = async function() {
    verifyParser();
    await verifyHelpSubmissionBypassesRuntimeExecution();
    await verifySearchSubmissionBypassesRuntimeExecution();
    await verifyNormalSubmissionStillExecutesRuntimeCode();
    await verifyRToolControllerUsesSearchMethod();
    await verifyRToolControllerKeepsPathSeparateFromBody();
    console.log("Console help command contract verified.");
};


main().catch((error) => {
    console.error(error);
    process.exit(1);
});
