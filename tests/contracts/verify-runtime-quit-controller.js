"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createRuntimeQuitController } = require("../../shared/shell-electron/lifecycle/runtimeQuitController");
const wait = function (ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};
const createEvent = function () {
    return {
        prevented: 0,
        preventDefault: function () {
            this.prevented += 1;
        }
    };
};
const verifyBeforeQuitWaitsForRuntimeStop = async function () {
    const calls = [];
    const controller = createRuntimeQuitController({
        stopRuntime: async function () {
            calls.push("stop-start");
            await wait(10);
            calls.push("stop-end");
        },
        quitApp: function () {
            calls.push("quit");
        }
    });
    const event = createEvent();
    controller.handleBeforeQuit(event);
    assert.strictEqual(event.prevented, 1);
    assert.deepStrictEqual(calls, ["stop-start"]);
    await wait(25);
    assert.deepStrictEqual(calls, ["stop-start", "stop-end", "quit"]);
};
const verifyRepeatedBeforeQuitDoesNotStartAnotherStop = async function () {
    let stopCount = 0;
    let quitCount = 0;
    const controller = createRuntimeQuitController({
        stopRuntime: async function () {
            stopCount += 1;
            await wait(10);
        },
        quitApp: function () {
            quitCount += 1;
        }
    });
    controller.handleBeforeQuit(createEvent());
    controller.handleBeforeQuit(createEvent());
    await wait(25);
    assert.strictEqual(stopCount, 1);
    assert.strictEqual(quitCount, 1);
};
const verifyPrepareQuitCanCancelShutdown = async function () {
    const calls = [];
    const controller = createRuntimeQuitController({
        prepareQuit: async function () {
            calls.push("prepare");
            return false;
        },
        stopRuntime: async function () {
            calls.push("stop");
        },
        quitApp: function () {
            calls.push("quit");
        }
    });
    controller.handleBeforeQuit(createEvent());
    await wait(5);
    assert.deepStrictEqual(calls, ["prepare"]);
};
const verifyPrepareQuitFailureCancelsShutdown = async function () {
    const calls = [];
    const controller = createRuntimeQuitController({
        prepareQuit: async function () {
            calls.push("prepare");
            throw new Error("Save failed.");
        },
        stopRuntime: async function () {
            calls.push("stop");
        },
        quitApp: function () {
            calls.push("quit");
        }
    });
    controller.handleBeforeQuit(createEvent());
    await wait(5);
    assert.deepStrictEqual(calls, ["prepare"]);
};
const verifyPrepareQuitApprovedContinuesShutdown = async function () {
    const calls = [];
    const controller = createRuntimeQuitController({
        prepareQuit: async function () {
            calls.push("prepare");
            return true;
        },
        stopRuntime: async function () {
            calls.push("stop");
        },
        quitApp: function () {
            calls.push("quit");
        }
    });
    controller.handleBeforeQuit(createEvent());
    await wait(5);
    assert.deepStrictEqual(calls, ["prepare", "stop", "quit"]);
};
const verifyCanceledShutdownCanBeRequestedAgain = async function () {
    let attempts = 0;
    const calls = [];
    const controller = createRuntimeQuitController({
        prepareQuit: async function () {
            attempts += 1;
            calls.push("prepare-" + attempts);
            return attempts > 1;
        },
        stopRuntime: async function () {
            calls.push("stop");
        },
        quitApp: function () {
            calls.push("quit");
        }
    });
    controller.handleBeforeQuit(createEvent());
    await wait(5);
    controller.handleBeforeQuit(createEvent());
    await wait(5);
    assert.deepStrictEqual(calls, ["prepare-1", "prepare-2", "stop", "quit"]);
};
const verifyResumedQuitIsAllowedThrough = async function () {
    const controller = createRuntimeQuitController({
        stopRuntime: async function () { },
        quitApp: function () { }
    });
    const first = createEvent();
    const second = createEvent();
    controller.handleBeforeQuit(first);
    await wait(5);
    controller.handleBeforeQuit(second);
    assert.strictEqual(first.prevented, 1);
    assert.strictEqual(second.prevented, 0);
};
const verifyWillQuitUsesSameStop = async function () {
    let stopCount = 0;
    const controller = createRuntimeQuitController({
        stopRuntime: async function () {
            stopCount += 1;
        },
        quitApp: function () { }
    });
    controller.handleWillQuit();
    controller.handleWillQuit();
    await wait(5);
    assert.strictEqual(stopCount, 1);
};
const run = async function () {
    await verifyBeforeQuitWaitsForRuntimeStop();
    await verifyRepeatedBeforeQuitDoesNotStartAnotherStop();
    await verifyPrepareQuitCanCancelShutdown();
    await verifyPrepareQuitFailureCancelsShutdown();
    await verifyPrepareQuitApprovedContinuesShutdown();
    await verifyCanceledShutdownCanBeRequestedAgain();
    await verifyResumedQuitIsAllowedThrough();
    await verifyWillQuitUsesSameStop();
    console.log("Runtime quit controller contract verified.");
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
