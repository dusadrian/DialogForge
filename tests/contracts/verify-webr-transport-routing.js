"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    getRuntimeProvider
} = require("../../shared/runtime/providers/runtimeProviderRegistry");


const createTransportProvider = function(responses) {
    const calls = [];
    const provider = getRuntimeProvider("webr", {
        transportEndpoint: "/runtime/webr-worker.js",
        transportConnectProbe: async function() {
            return {
                ok: true,
                message: "Started."
            };
        }
    });
    const transport = provider.transportController;

    transport.sendRequest = async function(request) {
        calls.push(request);

        const response = responses[request.method];

        if (!response) {
            return {
                id: request.id,
                status: "error",
                value: null,
                message: `Missing test response for ${request.method}.`,
                receivedAt: new Date().toISOString()
            };
        }

        return Object.assign({
            id: request.id,
            receivedAt: new Date().toISOString()
        }, response);
    };

    return { provider, calls };
};


void (async function() {
    const { provider, calls } = createTransportProvider({
        "commands.visible": {
            status: "ok",
            value: {
                transcriptEvents: [
                    {
                        type: "submitted",
                        commandKind: "commands.visible",
                        source: "test",
                        text: "1 + 1",
                        createdAt: new Date().toISOString()
                    },
                    {
                        type: "completed",
                        commandKind: "commands.visible",
                        source: "test",
                        text: "1 + 1",
                        createdAt: new Date().toISOString()
                    }
                ]
            },
            message: "Command complete."
        },
        "queries.invisible": {
            status: "ok",
            value: {
                value: "2",
                message: "Query complete."
            },
            message: "Query complete."
        },
        "workspace.objects": {
            status: "ok",
            value: {
                objects: [
                    {
                        name: "webr_data",
                        kind: "data.frame",
                        detail: "WebR data frame",
                        capabilities: ["tabular.read"]
                    }
                ]
            },
            message: "Workspace complete."
        },
        "tabular.preview": {
            status: "ok",
            value: {
                columns: [
                    { name: "case", type: "character" },
                    { name: "score", type: "numeric" }
                ],
                rows: [
                    { case: "A", score: 1 }
                ],
                rowNames: ["case-A"],
                message: "Preview complete."
            },
            message: "Preview complete."
        },
        "help.topic": {
            status: "ok",
            value: {
                title: "Mean",
                body: "Mean help page."
            },
            message: "Help complete."
        },
        "completions.symbols": {
            status: "ok",
            value: {
                items: [
                    { label: "mean", detail: "base", kind: "function" }
                ],
                symbols: ["mean"]
            },
            message: "Completions complete."
        },
        "dependencies.packages": {
            status: "ok",
            value: {
                status: "partial",
                items: [
                    {
                        name: "stats",
                        status: "available",
                        version: "webr",
                        message: "Package is available in the WebR worker."
                    },
                    {
                        name: "notInstalled",
                        status: "missing",
                        version: "",
                        message: "Package is not available in the WebR worker."
                    }
                ],
                message: "Dependency check complete."
            },
            message: "Dependency check complete."
        }
    });
    const snapshot = provider.createSession();

    const events = await provider.commandController.executeVisibleCommand({
        kind: "commands.visible",
        text: "1 + 1",
        source: "test",
        createdAt: new Date().toISOString()
    }, snapshot);

    assert.deepStrictEqual(events.map((event) => event.type), ["submitted", "completed"]);

    const query = await provider.queryController.executeInvisibleQuery({
        query: "1 + 1",
        source: "test"
    }, snapshot);

    assert.strictEqual(query.value, "2");

    const objects = await provider.workspaceController.listWorkspaceObjects(snapshot);

    assert.strictEqual(objects[0].name, "webr_data");

    const preview = await provider.workspaceController.readTabularPreview(
        "webr_data",
        snapshot,
        { objectName: "webr_data", rowStart: 1, rowCount: 1 }
    );

    assert.strictEqual(preview.rows[0].case, "A");

    const help = await provider.toolController.readHelpTopic({
        topic: "mean",
        source: "test"
    }, snapshot);

    assert.strictEqual(help.title, "Mean");

    const completions = await provider.toolController.readCompletions({
        prefix: "me",
        source: "test"
    }, snapshot);

    assert.strictEqual(completions.items[0].label, "mean");

    const dependencies = await provider.toolController.checkDependencies({
        kind: "package",
        names: ["stats", "notInstalled"],
        source: "test"
    }, snapshot);

    assert.strictEqual(dependencies.status, "partial");
    assert.strictEqual(dependencies.items[0].name, "stats");
    assert.strictEqual(dependencies.items[1].status, "missing");
    assert.deepStrictEqual(calls.map((call) => call.method), [
        "commands.visible",
        "queries.invisible",
        "workspace.objects",
        "tabular.preview",
        "help.topic",
        "completions.symbols",
        "dependencies.packages"
    ]);

    console.log("WebR transport routing contract verified.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
