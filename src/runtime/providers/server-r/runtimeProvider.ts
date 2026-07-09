import type {
    RuntimeProvider,
    RuntimeProviderManifest,
    RuntimeProviderOptions,
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import {
    createColumn,
    createTabularPreview
} from "../../tabular-data/tabularProtocol";
import { createWorkspaceObject } from "../../workspace/workspaceProtocol";
import { createServerRCommandController } from "./serverRCommandController";
import { createServerRQueryController } from "./serverRQueryController";
import { createServerRTransport } from "./serverRTransport";
import { createServerRToolController } from "./serverRToolController";
import { createServerRWorkspaceController } from "./serverRWorkspaceController";


const manifest: RuntimeProviderManifest = {
    id: "server-r",
    label: "Server R",
    language: "r",
    status: "reserved",
    capabilities: [
        "commands.visible",
        "commands.invisible",
        "data.import",
        "workspace.objects",
        "workspace.activeDataset",
        "workspace.rename",
        "tabular.schema",
        "tabular.read",
        "tabular.writeCells",
        "tabular.writeColumns",
        "tabular.writeRows",
        "tabular.rowNames",
        "tabular.columnNames",
        "tabular.variableMetadata",
        "tabular.variableMetadata.write",
        "tabular.valueLabels",
        "tabular.valueLabels.write",
        "tabular.declaredMissing",
        "tabular.declaredMissing.write",
        "help.topics",
        "completions.symbols",
        "dependencies.packages",
        "plots"
    ]
};


const createRuntimeSession = function(
    transport: ReturnType<typeof createServerRTransport>
): RuntimeSessionSnapshot {
    return {
        providerId: manifest.id,
        status: "not-started",
        connection: "reserved",
        message: "Server R runtime provider is reserved for a remote R session; no server transport is connected yet.",
        transport: transport.getSnapshot()
    };
};


const readOnlyAdapter: RuntimeReadOnlyAdapter = {
    listWorkspaceObjects: function() {
        return [
            createWorkspaceObject({
                name: "server_sample_data",
                kind: "data.frame",
                detail: "Placeholder data frame from a server-managed R session",
                capabilities: [
                    "tabular.schema",
                    "tabular.read",
                    "tabular.columnNames",
                    "tabular.rowNames",
                    "tabular.variableMetadata"
                ]
            })
        ];
    },
    readTabularPreview: function(providerId: string, objectName: string) {
        if (objectName !== "server_sample_data") {
            return null;
        }

        return createTabularPreview({
            status: "ready",
            providerId,
            objectName,
            columns: [
                createColumn({ name: "case", type: "character" }),
                createColumn({ name: "score", type: "numeric" })
            ],
            rows: [
                { case: "A", score: 1 },
                { case: "B", score: 2 }
            ],
            rowNames: ["case-A", "case-B"],
            message: "Server R placeholder returned sample tabular preview."
        });
    }
};


export const createRuntimeProvider = function(
    options: RuntimeProviderOptions = {}
): RuntimeProvider {
    const transportController = createServerRTransport({
        providerId: manifest.id,
        endpoint: options.transportEndpoint,
        authPolicy: options.transportAuthPolicy,
        credential: options.transportCredential,
        connectProbe: options.transportConnectProbe
    });

    return {
        manifest,
        createSession: function(): RuntimeSessionSnapshot {
            return createRuntimeSession(transportController);
        },
        transportController,
        commandController: createServerRCommandController(transportController),
        queryController: createServerRQueryController(transportController),
        workspaceController: createServerRWorkspaceController(transportController),
        toolController: createServerRToolController(transportController),
        readOnlyAdapter
    };
};
