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
import { createWebRCommandController } from "./webRCommandController";
import { normalizeWebRBootstrapPlan } from "./webRBootstrap";
import { createWebRLifecycleController } from "./webRLifecycleController";
import { createWebRQueryController } from "./webRQueryController";
import { createWebRTransport } from "./webRTransport";
import { createWebRToolController } from "./webRToolController";
import { createWebRWorkspaceController } from "./webRWorkspaceController";


const manifest: RuntimeProviderManifest = {
    id: "webr",
    label: "WebR",
    language: "r",
    status: "experimental",
    capabilities: [
        "commands.visible",
        "commands.invisible",
        "workspace.objects",
        "workspace.activeDataset",
        "tabular.schema",
        "tabular.read",
        "tabular.rowNames",
        "tabular.columnNames",
        "tabular.variableMetadata",
        "help.topics",
        "completions.symbols",
        "dependencies.packages"
    ],
    policies: {
        packages: {
            availability: "worker-runtime",
            installation: "unsupported",
            message: "WebR package availability is checked inside the worker; package installation is not a DialogForge operation in the browser host."
        },
        filesystem: {
            access: "browser-virtual",
            persistence: "host-managed",
            message: "WebR file access is limited to browser-managed virtual files; durable persistence must be provided by the browser host or product workflow."
        }
    }
};


const createRuntimeSession = function(
    transport: ReturnType<typeof createWebRTransport>
): RuntimeSessionSnapshot {
    return {
        providerId: manifest.id,
        status: "not-started",
        connection: transport.getSnapshot().state,
        message: "WebR runtime provider is waiting for an in-browser worker session.",
        transport: transport.getSnapshot()
    };
};


const readOnlyAdapter: RuntimeReadOnlyAdapter = {
    listWorkspaceObjects: function() {
        return [
            createWorkspaceObject({
                name: "webr_sample_data",
                kind: "data.frame",
                detail: "Placeholder data frame from a future WebR session",
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
        if (objectName !== "webr_sample_data") {
            return null;
        }

        return createTabularPreview({
            status: "ready",
            providerId,
            objectName,
            columns: [
                createColumn({ name: "case", type: "character" }),
                createColumn({ name: "value", type: "numeric" })
            ],
            rows: [
                { case: "A", value: 10 },
                { case: "B", value: 20 }
            ],
            rowNames: ["case-A", "case-B"],
            message: "WebR placeholder returned sample tabular preview."
        });
    }
};


export const createRuntimeProvider = function(options: RuntimeProviderOptions = {}): RuntimeProvider {
    const transportController = createWebRTransport({
        providerId: manifest.id,
        assetBaseUrl: options.transportEndpoint,
        bootstrap: normalizeWebRBootstrapPlan(options.runtimeBootstrap),
        connectProbe: options.transportConnectProbe
    });

    return {
        manifest,
        createSession: function(): RuntimeSessionSnapshot {
            return createRuntimeSession(transportController);
        },
        lifecycleController: createWebRLifecycleController(transportController),
        transportController,
        commandController: createWebRCommandController(transportController),
        queryController: createWebRQueryController(transportController),
        workspaceController: createWebRWorkspaceController(transportController),
        toolController: createWebRToolController(transportController),
        readOnlyAdapter
    };
};
