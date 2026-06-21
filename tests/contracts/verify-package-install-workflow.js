"use strict";
const assert = require("assert");
const { createRPackageInstallWorkflow } = require("../../shared/runtime/providers/r/dependencies/packageInstallWorkflow");
const createLog = function () {
    return {
        queries: [],
        libraryChoices: [],
        restartPrompts: [],
        restarts: [],
        commands: []
    };
};
const verifyInstallRoutingAndRestore = async function () {
    const log = createLog();
    let queryIndex = 0;
    const queryValues = [
        "QCA,jsonlite",
        "1\t/user/library\t/default/library"
    ];
    const workflow = createRPackageInstallWorkflow({
        getProductId: () => "DialogQCA",
        getPackageSourcePolicy: () => ({
            cran: [
                "httpgd",
                "jsonlite",
                "askpass",
                "later",
                "digest",
                "statistics"
            ],
            runiverse: [
                "admisc",
                "declared",
                "venn"
            ],
            both: [
                "DDIwR",
                "QCA"
            ]
        }),
        executeQuery: async (query) => {
            log.queries.push(query);
            return {
                status: "ready",
                value: queryValues[queryIndex++]
            };
        },
        chooseLibrary: async (input) => {
            log.libraryChoices.push(input);
            return { action: "user" };
        },
        confirmRestart: async (packages) => {
            log.restartPrompts.push(packages);
            return { action: "restore" };
        },
        restartRuntime: async (action) => {
            log.restarts.push(action);
            return { status: "ready" };
        },
        executeVisibleCommand: async (command, source) => {
            log.commands.push({
                command,
                source
            });
        }
    });
    await workflow.installRequired([
        "unknown",
        "QCA",
        "admisc",
        "jsonlite",
        "QCA"
    ]);
    assert.deepStrictEqual(log.restartPrompts, [
        ["jsonlite", "QCA"]
    ]);
    assert.deepStrictEqual(log.restarts, ["restore"]);
    assert.deepStrictEqual(log.libraryChoices, [{
            userLibrary: "/user/library",
            defaultLibrary: "/default/library"
        }]);
    assert.strictEqual(log.commands.length, 1);
    const command = log.commands[0];
    assert.strictEqual(command.source, "DialogQCA.packages.installRequired");
    assert.ok(command.command.includes('"admisc"'));
    assert.ok(command.command.includes('"jsonlite"'));
    assert.ok(command.command.includes('"QCA"'));
    assert.ok(command.command.includes('"unknown"'));
    assert.ok(command.command.includes("dependencies = TRUE"));
    assert.ok(command.command.includes('lib = "/user/library"'));
    assert.ok(command.command.includes("https://dusadrian.r-universe.dev"));
    assert.ok(command.command.includes("https://cloud.r-project.org"));
};
const verifyRestartCancellation = async function () {
    const log = createLog();
    const workflow = createRPackageInstallWorkflow({
        getProductId: () => "DialogR",
        getPackageSourcePolicy: () => ({
            runiverse: ["declared"]
        }),
        executeQuery: async (query) => {
            log.queries.push(query);
            return {
                status: "ready",
                value: "declared"
            };
        },
        chooseLibrary: async (input) => {
            log.libraryChoices.push(input);
            return { action: "default" };
        },
        confirmRestart: async (packages) => {
            log.restartPrompts.push(packages);
            return { action: "cancel" };
        },
        restartRuntime: async (action) => {
            log.restarts.push(action);
            return { status: "ready" };
        },
        executeVisibleCommand: async (command, source) => {
            log.commands.push({
                command,
                source
            });
        }
    });
    await workflow.installRequired(["declared"]);
    assert.deepStrictEqual(log.restartPrompts, [["declared"]]);
    assert.deepStrictEqual(log.restarts, []);
    assert.deepStrictEqual(log.libraryChoices, []);
    assert.deepStrictEqual(log.commands, []);
};
const verifyUpdateFiltering = async function () {
    const log = createLog();
    let queryIndex = 0;
    const queryValues = [
        "",
        "0\t\t/default/library"
    ];
    const workflow = createRPackageInstallWorkflow({
        getProductId: () => "DialogR",
        getPackageSourcePolicy: () => ({
            runiverse: ["admisc", "declared"],
            both: ["DDIwR"]
        }),
        executeQuery: async (query) => {
            log.queries.push(query);
            return {
                status: "ready",
                value: queryValues[queryIndex++]
            };
        },
        chooseLibrary: async () => {
            throw new Error("Library prompt should not open when R reports no choice is needed.");
        },
        confirmRestart: async () => {
            throw new Error("Restart prompt should not open when no target package is loaded.");
        },
        restartRuntime: async () => {
            throw new Error("Runtime should not restart when no target package is loaded.");
        },
        executeVisibleCommand: async (command, source) => {
            log.commands.push({
                command,
                source
            });
        }
    });
    await workflow.updateRequired([
        "jsonlite",
        "declared",
        "DDIwR",
        "admisc"
    ]);
    assert.strictEqual(log.commands.length, 1);
    assert.strictEqual(log.commands[0].source, "DialogR.packages.updateRequired");
    assert.ok(log.commands[0].command.includes('"admisc"'));
    assert.ok(log.commands[0].command.includes('"DDIwR"'));
    assert.ok(log.commands[0].command.includes('"declared"'));
    assert.ok(!log.commands[0].command.includes('"jsonlite"'));
    assert.ok(!log.commands[0].command.includes("lib ="));
};
const verifyUpdateFallbackWhenPolicyIsLate = async function () {
    const log = createLog();
    let queryIndex = 0;
    const queryValues = [
        "",
        "0\t\t/default/library"
    ];
    const workflow = createRPackageInstallWorkflow({
        getProductId: () => "DialogQCA",
        getPackageSourcePolicy: () => ({}),
        executeQuery: async (query) => {
            log.queries.push(query);
            return {
                status: "ready",
                value: queryValues[queryIndex++]
            };
        },
        chooseLibrary: async () => {
            throw new Error("Library prompt should not open when R reports no choice is needed.");
        },
        confirmRestart: async () => {
            throw new Error("Restart prompt should not open when no target package is loaded.");
        },
        restartRuntime: async () => {
            throw new Error("Runtime should not restart when no target package is loaded.");
        },
        executeVisibleCommand: async (command, source) => {
            log.commands.push({
                command,
                source
            });
        }
    });
    await workflow.updateRequired([
        "jsonlite",
        "QCA",
        "venn",
        "admisc"
    ]);
    assert.strictEqual(log.commands.length, 1);
    assert.strictEqual(log.commands[0].source, "DialogQCA.packages.updateRequired");
    assert.ok(log.commands[0].command.includes('"admisc"'));
    assert.ok(log.commands[0].command.includes('"QCA"'));
    assert.ok(log.commands[0].command.includes('"venn"'));
    assert.ok(!log.commands[0].command.includes('"jsonlite"'));
    assert.ok(log.commands[0].command.includes("https://dusadrian.r-universe.dev"));
};
const verifyFailedRestartStopsInstall = async function () {
    let commandCount = 0;
    const workflow = createRPackageInstallWorkflow({
        getProductId: () => "DialogR",
        getPackageSourcePolicy: () => ({
            both: ["DDIwR"]
        }),
        executeQuery: async () => ({
            status: "ready",
            value: "DDIwR"
        }),
        chooseLibrary: async () => ({ action: "default" }),
        confirmRestart: async () => ({ action: "clean" }),
        restartRuntime: async () => ({ status: "failed" }),
        executeVisibleCommand: async () => {
            commandCount += 1;
        }
    });
    await workflow.updateRequired(["DDIwR"]);
    assert.strictEqual(commandCount, 0);
};
const run = async function () {
    await verifyInstallRoutingAndRestore();
    await verifyRestartCancellation();
    await verifyUpdateFiltering();
    await verifyUpdateFallbackWhenPolicyIsLate();
    await verifyFailedRestartStopsInstall();
};
void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
