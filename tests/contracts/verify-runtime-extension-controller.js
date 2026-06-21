"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createRuntimeExtensionMethodRequest, createWorkspaceFileLoadRequest, createWorkspaceFileSaveRequest } = require("../../shared/runtime/extensions/runtimeExtensionProtocol");
const { createRuntimeSessionManager } = require("../../shared/runtime/session/runtimeSessionManager");
const createProvider = function () {
    return {
        manifest: {
            id: "extension-test",
            label: "Extension Test",
            language: "test",
            capabilities: []
        },
        createSession: function () {
            return {
                providerId: "extension-test",
                status: "not-started",
                connection: "placeholder",
                message: "Extension test session."
            };
        },
        extensionController: {
            executeRuntimeMethod: async function (request, snapshot) {
                return {
                    status: "ready",
                    providerId: snapshot.providerId,
                    method: request.method,
                    value: {
                        params: request.params
                    },
                    message: "Extension method handled by provider.",
                    executedAt: "test"
                };
            }
        }
    };
};
const verify = async function () {
    const manager = createRuntimeSessionManager(createProvider());
    let unavailable = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "workspace.truth_tables"
    }));
    assert.strictEqual(unavailable.status, "unavailable");
    await manager.start();
    let invalid = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: ""
    }));
    assert.strictEqual(invalid.status, "invalid");
    let result = await manager.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
        method: "workspace.truth_tables",
        params: {
            name: "tt1"
        },
        source: "contract-test"
    }));
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.providerId, "extension-test");
    assert.strictEqual(result.method, "workspace.truth_tables");
    assert.deepStrictEqual(result.value, {
        params: {
            name: "tt1"
        }
    });
    assert.deepStrictEqual(createWorkspaceFileLoadRequest("/tmp/session.RData", "contract-test"), {
        method: "runtime.load_workspace_file",
        params: {
            path: "/tmp/session.RData"
        },
        source: "contract-test"
    });
    assert.deepStrictEqual(createWorkspaceFileSaveRequest("/tmp/session.RData", "contract-test"), {
        method: "runtime.save_workspace_file",
        params: {
            path: "/tmp/session.RData"
        },
        source: "contract-test"
    });
};
verify()
    .then(() => {
    console.log("Runtime extension controller contract verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
