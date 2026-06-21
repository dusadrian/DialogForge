"use strict";

const assert = require("assert");

const {
    bindMainFileDropHandling
} = require("../../shared/base-app/features/file-drop/mainFileDropBindings");

const wait = function(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
};

const waitUntil = async function(predicate) {
    const startedAt = Date.now();

    while (!predicate()) {
        if (Date.now() - startedAt > 1000) {
            throw new Error("Timed out waiting for file-drop queue");
        }

        await wait(5);
    }
};

const createDropEvent = function(paths) {
    return {
        prevented: false,
        dataTransfer: {
            types: ["Files"],
            dropEffect: "",
            files: paths.map((filePath) => ({ filePath }))
        },
        preventDefault: function() {
            this.prevented = true;
        }
    };
};

const verifyDroppedFilesRunInOrder = async function() {
    const listeners = {};
    const actions = [];
    const reports = [];
    const previousWindow = global.window;

    global.window = {
        addEventListener: function(name, listener) {
            listeners[name] = listener;
        }
    };

    try {
        bindMainFileDropHandling({
            getFilePath: (file) => file.filePath,
            inspectPath: async (filePath) => {
                if (filePath === "/tmp/project") {
                    await wait(20);
                    return {
                        kind: "directory",
                        path: filePath,
                        extension: "",
                        name: "project"
                    };
                }

                return {
                    kind: "file",
                    path: filePath,
                    extension: ".r",
                    name: "script.r"
                };
            },
            setWorkingDirectory: async () => {
                actions.push("working-directory");
            },
            openScript: async () => {
                actions.push("script");
            },
            loadWorkspace: async () => {
                actions.push("workspace");
            },
            importFile: async () => {
                actions.push("import");
            },
            reportDropResult: (result) => {
                reports.push(result);
            }
        });

        const event = createDropEvent([
            "/tmp/project",
            "/tmp/script.r"
        ]);

        listeners.drop(event);

        await waitUntil(() => reports.length === 2);

        assert.strictEqual(event.prevented, true);
        assert.deepStrictEqual(actions, ["working-directory", "script"]);
        assert.deepStrictEqual(reports.map((result) => result.status), [
            "handled",
            "handled"
        ]);
    }
    finally {
        global.window = previousWindow;
    }
};

const verifyUnsupportedDroppedFileIsReported = async function() {
    const listeners = {};
    const reports = [];
    const previousWindow = global.window;

    global.window = {
        addEventListener: function(name, listener) {
            listeners[name] = listener;
        }
    };

    try {
        bindMainFileDropHandling({
            getFilePath: (file) => file.filePath,
            inspectPath: async (filePath) => ({
                kind: "file",
                path: filePath,
                extension: ".bin",
                name: "archive.bin"
            }),
            setWorkingDirectory: async () => {},
            openScript: async () => {},
            loadWorkspace: async () => {},
            importFile: async () => {},
            reportDropResult: (result) => {
                reports.push(result);
            }
        });

        listeners.drop(createDropEvent(["/tmp/archive.bin"]));

        await waitUntil(() => reports.length === 1);

        assert.strictEqual(reports[0].status, "unsupported");
        assert.strictEqual(reports[0].action, "unsupported");
        assert.ok(reports[0].message.includes("/tmp/archive.bin"));
    }
    finally {
        global.window = previousWindow;
    }
};

const run = async function() {
    await verifyDroppedFilesRunInOrder();
    await verifyUnsupportedDroppedFileIsReported();

    console.log("File-drop workflow verified.");
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
