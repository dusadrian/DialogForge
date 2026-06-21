import type {
    RuntimeProvider,
    RuntimeProviderManifest,
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import {
    createColumn,
    createTabularPreview
} from "../../tabular-data/tabularProtocol";
import { createWorkspaceObject } from "../../workspace/workspaceProtocol";


const manifest: RuntimeProviderManifest = {
    id: "python",
    label: "Python",
    language: "python",
    status: "reserved",
    capabilities: [
        "commands.visible",
        "commands.invisible",
        "data.import",
        "workspace.objects",
        "tabular.schema",
        "tabular.read",
        "tabular.writeCells",
        "tabular.writeColumns",
        "tabular.writeRows",
        "tabular.rowNames",
        "tabular.columnNames",
        "help.topics",
        "completions.symbols"
    ]
};


const createRuntimeSession = function(): RuntimeSessionSnapshot {
    return {
        providerId: manifest.id,
        status: "not-started",
        connection: "reserved",
        message: "Python runtime provider is reserved for the future; no Python process is started yet."
    };
};


const readOnlyAdapter: RuntimeReadOnlyAdapter = {
    listWorkspaceObjects: function() {
        return [
            createWorkspaceObject({
                name: "sample_frame",
                kind: "table",
                detail: "Placeholder pandas-like table",
                capabilities: [
                    "tabular.schema",
                    "tabular.read",
                    "tabular.writeCells",
                    "tabular.writeColumns",
                    "tabular.writeRows",
                    "tabular.columnNames",
                    "tabular.rowNames"
                ]
            })
        ];
    },
    readTabularPreview: function(providerId: string, objectName: string) {
        if (objectName !== "sample_frame") {
            return null;
        }

        return createTabularPreview({
            status: "ready",
            providerId,
            objectName,
            columns: [
                createColumn({ name: "case", type: "string" }),
                createColumn({ name: "score", type: "number" })
            ],
            rows: [
                { case: "A", score: 1 },
                { case: "B", score: 0 }
            ],
            rowNames: ["case-A", "case-B"],
            message: "Python read-only adapter returned placeholder tabular preview."
        });
    }
};


export const createRuntimeProvider = function(): RuntimeProvider {
    return {
        manifest,
        createSession: createRuntimeSession,
        readOnlyAdapter
    };
};
