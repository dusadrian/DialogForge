"use strict";

const assert = require("node:assert/strict");
const {
    createMainStartupController
} = require("../dist/src/base-app/features/main-window/mainStartupController");


const runtimeSession = function (status) {
    return {
        providerId: "r",
        status,
        connection: "runtime-control",
        message: `Runtime is ${status}.`
    };
};


const compositionWithSession = function (session) {
    return {
        runtime: {
            id: "r",
            capabilities: []
        },
        runtimeSession: session,
        productSettings: {
            runtimeStartup: {
                autoStart: true,
                providerId: "r"
            }
        }
    };
};


const createBindings = function (composition, authoritativeSession, calls) {
    const noop = function () {};

    return {
        getComposition: async function () {
            return composition;
        },
        applyComposition: async function () {},
        readPersistedWorkspacePaneVisible: async function () {
            return false;
        },
        setWorkspacePaneVisible: async function () {},
        initializeWorkspacePane: noop,
        readApplicationSettings: async function () {
            return {};
        },
        readActiveDataset: async function () {
            return {
                status: "none",
                providerId: "r",
                objectName: "",
                message: "No active dataset."
            };
        },
        refreshConsoleWorkingDirectory: async function () {},
        initializeConsoleFlow: noop,
        bindMainUi: noop,
        bindRuntimeSessionEvents: function () {
            calls.push("events-bound");
        },
        readRuntimeSession: async function () {
            calls.push("session-read");
            return authoritativeSession;
        },
        refreshWorkspace: async function () {},
        initializeVisibleCommandEditor: async function () {},
        focusVisibleCommandInput: noop,
        markReady: noop,
        startRuntimeSession: async function () {
            calls.push("runtime-started");
            return runtimeSession("ready");
        },
        setBootStage: noop,
        renderMenu: noop,
        renderProductInfo: noop,
        renderProductSettings: noop,
        renderApplicationSettings: noop,
        applyApplicationSettings: noop,
        renderCapabilities: noop,
        renderRuntimeSession: function (session) {
            calls.push(`session-rendered:${session.status}`);
        },
        renderConsoleStatus: function (session) {
            calls.push(`console-rendered:${session.status}`);
        },
        renderRuntimeEvents: noop,
        renderPrompts: noop,
        renderFeatures: noop,
        renderProductCapabilities: noop,
        renderStartupTasks: noop,
        applyMainTranslations: noop,
        renderActiveDataset: noop,
        refreshProductConsoleStateChips: async function () {},
        renderDatasetEditorSelection: noop
    };
};


const verifyAuthoritativeReadyStateReplacesCompositionHint = async function () {
    const calls = [];
    const composition = compositionWithSession(runtimeSession("starting"));
    const controller = createMainStartupController(
        createBindings(composition, runtimeSession("ready"), calls)
    );

    await controller.start();

    assert.ok(calls.indexOf("events-bound") < calls.indexOf("session-read"));
    assert.ok(calls.includes("session-rendered:starting"));
    assert.ok(calls.includes("session-rendered:ready"));
    assert.ok(calls.includes("console-rendered:ready"));
    assert.ok(!calls.includes("runtime-started"));
};


const verifyExistingStartupIsNotStartedAgain = async function () {
    const calls = [];
    const composition = compositionWithSession(runtimeSession("not-started"));
    const controller = createMainStartupController(
        createBindings(composition, runtimeSession("starting"), calls)
    );

    await controller.start();

    assert.ok(!calls.includes("runtime-started"));
};


const main = async function () {
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalSetTimeout = global.setTimeout;

    global.requestAnimationFrame = function (callback) {
        callback();
        return 0;
    };
    global.setTimeout = function (callback) {
        callback();
        return 0;
    };

    try {
        await verifyAuthoritativeReadyStateReplacesCompositionHint();
        await verifyExistingStartupIsNotStartedAgain();
    }
    finally {
        global.requestAnimationFrame = originalRequestAnimationFrame;
        global.setTimeout = originalSetTimeout;
    }
};


main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
