import type {
    RuntimeProvider,
    RuntimeProviderManifest,
    RuntimeProviderOptions,
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import {
    createRRuntimeLaunchPlan,
    listMissingRuntimeSourceFiles,
    resolveProductRuntimeControlPath
} from "./session/runtimeLaunchPlan";
import {
    findConfiguredRBinary,
    findLatestInstalledRBinary,
    type RBinaryKind
} from "./session/rBinaryDiscovery";
import { createRRuntimeProcessController } from "./session/runtimeProcessController";
import {
    createColumn,
    createDeclaredMissingSet,
    createDeclaredMissingSnapshot,
    createTabularPreview,
    createValueLabelSet,
    createValueLabelSnapshot,
    createVariableMetadata,
    createVariableMetadataSnapshot
} from "../../tabular-data/tabularProtocol";
import { createWorkspaceObject } from "../../workspace/workspaceProtocol";


const manifest: RuntimeProviderManifest = {
    id: "r",
    label: "R",
    language: "r",
    status: "implemented",
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


const createRuntimeSession = function(): RuntimeSessionSnapshot {
    return {
        providerId: manifest.id,
        status: "not-started",
        connection: "registered",
        message: "R runtime provider is registered, but no R process is started yet."
    };
};


const readConfiguredRuntimeLocation = function(
    options: RuntimeProviderOptions
): string {
    if (options.readRuntimeLocation) {
        return String(options.readRuntimeLocation() || "").trim();
    }

    return String(options.runtimeLocation || "").trim();
};


const detectsRuntimeAtStartup = function(
    options: RuntimeProviderOptions
): boolean {
    if (options.readRuntimeDetectionAtStartup) {
        return options.readRuntimeDetectionAtStartup() !== false;
    }

    return options.runtimeDetectionAtStartup !== false;
};


const resolveRBinary = async function(
    kind: RBinaryKind,
    options: RuntimeProviderOptions
): Promise<{
    configuredPath: string;
    resolvedPath: string;
    source: "configured" | "discovered" | "invalid" | "unavailable";
}> {
    const configuredPath = readConfiguredRuntimeLocation(options);
    const automatic = detectsRuntimeAtStartup(options);

    if (!automatic && configuredPath) {
        const resolvedPath = await findConfiguredRBinary(
            kind,
            configuredPath
        );

        return {
            configuredPath,
            resolvedPath: resolvedPath || "",
            source: resolvedPath ? "configured" : "invalid"
        };
    }

    if (!automatic) {
        return {
            configuredPath: "",
            resolvedPath: "",
            source: "invalid"
        };
    }

    const resolvedPath = await findLatestInstalledRBinary(kind);

    return {
        configuredPath: "",
        resolvedPath: resolvedPath || "",
        source: resolvedPath ? "discovered" : "unavailable"
    };
};


const readOnlyAdapter: RuntimeReadOnlyAdapter = {
    listWorkspaceObjects: function() {
        return [
            createWorkspaceObject({
                name: "sample_data",
                kind: "data.frame",
                detail: "Sample R data frame",
                capabilities: [
                    "tabular.schema",
                    "tabular.read",
                    "tabular.writeCells",
                    "tabular.writeColumns",
                    "tabular.writeRows",
                    "tabular.columnNames",
                    "tabular.rowNames",
                    "tabular.variableMetadata"
                ]
            }),
            createWorkspaceObject({
                name: "sample_model",
                kind: "object",
                detail: "Sample runtime object",
                capabilities: []
            })
        ];
    },
    readTabularPreview: function(providerId: string, objectName: string) {
        if (objectName !== "sample_data") {
            return null;
        }

        return createTabularPreview({
            status: "ready",
            providerId,
            objectName,
            columns: [
                createColumn({ name: "case", type: "character" }),
                createColumn({ name: "condition", type: "numeric" }),
                createColumn({ name: "outcome", type: "numeric" })
            ],
            rows: [
                { case: "A", condition: 1, outcome: 1 },
                { case: "B", condition: 0, outcome: 0 },
                { case: "C", condition: 1, outcome: 0 }
            ],
            rowNames: ["case-A", "case-B", "case-C"],
            message: "R read-only adapter returned sample tabular preview."
        });
    },
    readVariableMetadata: function(providerId: string, objectName: string) {
        if (objectName !== "sample_data") {
            return null;
        }

        return createVariableMetadataSnapshot({
            status: "ready",
            providerId,
            objectName,
            variables: [
                createVariableMetadata({
                    name: "case",
                    type: "character",
                    role: "id",
                    label: "Case identifier"
                }),
                createVariableMetadata({
                    name: "condition",
                    type: "numeric",
                    role: "condition",
                    label: "Example condition"
                }),
                createVariableMetadata({
                    name: "outcome",
                    type: "numeric",
                    role: "outcome",
                    label: "Example outcome"
                })
            ],
            message: "R read-only adapter returned sample variable metadata."
        });
    },
    readValueLabels: function(providerId: string, objectName: string) {
        if (objectName !== "sample_data") {
            return null;
        }

        return createValueLabelSnapshot({
            status: "ready",
            providerId,
            objectName,
            valueLabels: [
                createValueLabelSet({
                    variable: "condition",
                    labels: [
                        { value: 0, label: "Absent" },
                        { value: 1, label: "Present" }
                    ]
                }),
                createValueLabelSet({
                    variable: "outcome",
                    labels: [
                        { value: 0, label: "No" },
                        { value: 1, label: "Yes" }
                    ]
                })
            ],
            message: "R read-only adapter returned sample value labels."
        });
    },
    readDeclaredMissing: function(providerId: string, objectName: string) {
        if (objectName !== "sample_data") {
            return null;
        }

        return createDeclaredMissingSnapshot({
            status: "ready",
            providerId,
            objectName,
            declaredMissing: [
                createDeclaredMissingSet({
                    variable: "condition",
                    values: [{ value: -9, label: "Not asked" }]
                }),
                createDeclaredMissingSet({
                    variable: "outcome",
                    values: [{ value: -8, label: "Unknown" }]
                })
            ],
            message: "R read-only adapter returned sample declared-missing values."
        });
    }
};


const shouldUseProcessLifecycle = function(
    options: RuntimeProviderOptions
): boolean {
    if (options.processLifecycle !== undefined) {
        return options.processLifecycle;
    }

    return process.env.DIALOGFORGE_R_PROCESS === "1";
};


export const createRuntimeProvider = function(options: RuntimeProviderOptions = {}): RuntimeProvider {
    const provider: RuntimeProvider = {
        manifest,
        createSession: createRuntimeSession,
        locationController: {
            resolve: async function() {
                const location = await resolveRBinary("R", options);
                const message = location.source === "configured"
                    ? "Using the configured R location."
                    : location.source === "discovered"
                        ? "Detected automatically."
                        : location.source === "invalid"
                            ? "The configured location does not contain a usable R executable."
                            : "No R installation was found.";

                return {
                    providerId: manifest.id,
                    configurable: true,
                    configuredPath: location.configuredPath,
                    resolvedPath: location.resolvedPath,
                    source: location.source,
                    message
                };
            }
        },
        readOnlyAdapter
    };

    if (shouldUseProcessLifecycle(options)) {
        const runtimeController = createRRuntimeProcessController({
            createLaunchPlan: async function() {
                const location = await resolveRBinary("R", options);
                const command = location.resolvedPath;

                if (!command) {
                    if (location.source === "invalid") {
                        throw new Error(
                            `The configured R location "${location.configuredPath}" `
                            + "does not contain a usable R executable."
                        );
                    }

                    const locations = process.platform === "linux"
                        ? "configured paths, R_HOME, PATH, /opt/R, or "
                            + "standard installation directories"
                        : "configured paths, R_HOME, PATH, or standard "
                            + "installation directories";

                    throw new Error(
                        `Unable to find R in ${locations}.`
                    );
                }

                const plan = createRRuntimeLaunchPlan({
                    rootDir: options.rootDir || process.cwd(),
                    command,
                    profileRuntimeControlPath: resolveProductRuntimeControlPath(
                        options.rootDir || process.cwd(),
                        options.productId || ""
                    ),
                    sessionKind: "dedicated"
                });
                const missingFiles = listMissingRuntimeSourceFiles(plan.runtimeSourceDir);

                if (missingFiles.length > 0) {
                    throw new Error(`Missing R runtime-control sources: ${missingFiles.join(", ")}`);
                }

                return plan;
            },
            startupTimeoutMs: 7000,
            onTranscriptEvents: options.onTranscriptEvents,
            onUnexpectedExit: options.onUnexpectedExit
        });
        provider.lifecycleController = runtimeController.lifecycleController;
        provider.commandController = runtimeController.commandController;
        provider.workspaceController = runtimeController.workspaceController;
        provider.tabularController = runtimeController.tabularController;
        provider.importController = runtimeController.importController;
        provider.toolController = runtimeController.toolController;
        provider.queryController = runtimeController.queryController;
        provider.productCommandController = runtimeController.productCommandController;
        provider.extensionController = runtimeController.extensionController;
        provider.eventController = runtimeController.eventController;
    }

    return provider;
};
