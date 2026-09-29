import type {
    DialogDefinition,
    EvaluatedStartupTask
} from "../../core/contracts/applicationComposition";
import type { DialogExternalCallHost } from "../../core/contracts/dialogExternalCall";
import {
    createRuntimeCommandControllers
} from "../commands/runtimeCommandControllers";
import {
    createRuntimeTabularControllers
} from "../tabular-data/runtimeTabularControllers";
import {
    createRuntimeExtensionExecutionController
} from "../extensions/runtimeExtensionExecutionController";
import {
    createRuntimeDialogExecutionController
} from "../dialogs/runtimeDialogExecutionController";
import {
    createRuntimeFallbackTabularState
} from "./runtimeFallbackTabularState";
import { createRuntimeEventState } from "./runtimeEventState";
import {
    createRuntimeEventListController
} from "./runtimeEventListController";
import { createRuntimePromptState } from "./runtimePromptState";
import {
    createRuntimePromptExecutionController
} from "./runtimePromptExecutionController";
import { createRuntimeWorkspaceState } from "./runtimeWorkspaceState";
import {
    createRuntimeSessionLifecycleState
} from "./runtimeSessionLifecycleState";
import {
    createRuntimeLifecycleExecutionController
} from "./runtimeLifecycleExecutionController";
import {
    createRuntimeCompositionRegistry
} from "./runtimeCompositionRegistry";
import {
    createRuntimeCompositionExecutionController
} from "./runtimeCompositionExecutionController";
import {
    createRuntimeCompositionOperationController
} from "./runtimeCompositionOperationController";
import {
    createRuntimeCapabilityControllers
} from "./runtimeCapabilityControllers";
import {
    createRuntimeInvisibleMutationState
} from "./runtimeInvisibleMutationState";
import {
    createRuntimeWorkspaceControllers
} from "../workspace/runtimeWorkspaceControllers";
import {
    workspaceUpdateHasChanges,
    createWorkspaceRecoveryUpdate
} from "../workspace/workspaceUpdate";
import {
    createRuntimeStartupTaskExecutionController
} from "../startup/runtimeStartupTaskExecutionController";
import type {
    RowSortRequest,
    RuntimeCapability,
    RuntimeExtensionMethodRequest,
    RuntimeExtensionMethodResult,
    RuntimeProvider,
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    WorkspaceReconciliation,
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";


export interface RuntimeSessionManagerOptions {
    rootDir?: string;
    dialogs?: DialogDefinition[];
    startupTasks?: EvaluatedStartupTask[];
    dialogExternalCallHost?: Pick<DialogExternalCallHost, "supports">;
}


export const createRuntimeSessionManager = function(
    provider: RuntimeProvider,
    options: RuntimeSessionManagerOptions = {}
): RuntimeSessionManager {
    const initialSnapshot = provider.createSession();
    const rootDir = options.rootDir || "";
    const compositionRegistry = createRuntimeCompositionRegistry({
        dialogs: options.dialogs,
        startupTasks: options.startupTasks
    });
    const dialogExecutionController = createRuntimeDialogExecutionController({
        rootDir,
        externalCallHost: options.dialogExternalCallHost
    });
    const lifecycleState = createRuntimeSessionLifecycleState(initialSnapshot);
    const snapshot = lifecycleState.snapshot;
    const runtimeWorkspaceState = createRuntimeWorkspaceState(snapshot.providerId);
    const fallbackTabularState = createRuntimeFallbackTabularState();
    const invisibleMutationState = createRuntimeInvisibleMutationState();
    const runtimeEventState = createRuntimeEventState();
    const runtimePromptState = createRuntimePromptState();
    const runtimeExtensionExecutionController =
        createRuntimeExtensionExecutionController(provider.extensionController);

    const hasRuntimeCapability = function(capability: RuntimeCapability): boolean {
        return provider.manifest.capabilities.includes(capability);
    };

    const recordRuntimeEvent = function(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void {
        runtimeEventState.record(
            snapshot.providerId,
            type,
            objectName,
            detail,
            payload
        );
    };
    const commandControllers = createRuntimeCommandControllers({
        providerCommandController: provider.commandController,
        providerProductCommandController: provider.productCommandController,
        getSnapshot: function() {
            return lifecycleState.getSnapshot();
        },
        hasDependencyCapability: function(): boolean {
            return hasRuntimeCapability("dependencies.packages");
        },
        checkDependencies: function(request) {
            return checkDependencies(request);
        },
        recordRuntimeEvent,
        completeVisibleCommand:
            provider.workspaceController?.completeVisibleCommand
                ? function(request) {
                    return provider.workspaceController!
                        .completeVisibleCommand!(
                            request,
                            lifecycleState.getSnapshot()
                        );
                }
                : undefined,
        invalidateWorkspace: function() {
            runtimeWorkspaceState.markStale();
        },
        getWorkspaceGeneration: runtimeWorkspaceState.getGeneration,
        applyWorkspaceUpdate: function(update) {
            if (!update.workspaceRevision && !workspaceUpdateHasChanges(update)) {
                return;
            }

            const objects = runtimeWorkspaceState.applyUpdate(update);

            activeDatasetController.reconcileAfterWorkspaceRefresh(
                objects,
                "workspace-update"
            );
        }
    });
    const commandOperationController = commandControllers.operationController;

    const startupTaskExecutionController =
        createRuntimeStartupTaskExecutionController({
            checkDependencies: function(request) {
                return checkDependencies(request);
            },
            listWorkspaceObjects: function() {
                return listWorkspaceObjects();
            },
            executeVisibleCommand: function(request) {
                return executeVisibleCommand(request);
            },
            executeInvisibleQuery: function(request) {
                return executeInvisibleQuery(request);
            },
            recordRuntimeEvent
        });
    const compositionExecutionController =
        createRuntimeCompositionExecutionController({
            compositionRegistry,
            dialogExecutionController,
            startupTaskExecutionController,
            recordRuntimeEvent
        });
    const compositionOperationController =
        createRuntimeCompositionOperationController({
            compositionExecutionController,
            getSnapshot: function() {
                return lifecycleState.getSnapshot();
            },
            hasRuntimeCapability
        });

    const tabularControllers = createRuntimeTabularControllers({
        providerId: function() {
            return snapshot.providerId;
        },
        providerManifestId: provider.manifest.id,
        providerWorkspaceController: provider.workspaceController,
        providerTabularController: provider.tabularController,
        providerImportController: provider.importController,
        readOnlyAdapter: provider.readOnlyAdapter,
        fallbackState: fallbackTabularState,
        getSnapshot: function() {
            return lifecycleState.getSnapshot();
        },
        getActiveObjectName: function() {
            return runtimeWorkspaceState.getActiveObjectName();
        },
        hasRuntimeCapability,
        recordRuntimeEvent,
        rememberWorkspaceObjects: function(objects) {
            return activeDatasetController.rememberWorkspaceObjects(objects);
        },
        selectKnown: function(objectName, reason) {
            activeDatasetController.selectKnown(objectName, reason);
        },
        selectFromWorkspace: function(objects, objectName, reason) {
            activeDatasetController.selectFromWorkspace(
                objects,
                objectName,
                reason
            );
        }
    });
    const listImportedTables = tabularControllers.listImportedTables;
    const listProviderWorkspaceObjects =
        tabularControllers.listProviderWorkspaceObjects;
    const fallbackWorkspaceController =
        tabularControllers.fallbackWorkspaceController;
    const tabularReadOperationController =
        tabularControllers.readOperationController;
    const cellMutationExecutionController =
        tabularControllers.cellMutationExecutionController;
    const columnMutationOperationController =
        tabularControllers.columnMutationOperationController;
    const rowMutationOperationController =
        tabularControllers.rowMutationOperationController;
    const variableMetadataOperationController =
        tabularControllers.variableMetadataOperationController;
    const labelStateOperationController =
        tabularControllers.labelStateOperationController;
    const importOperationController = tabularControllers.importOperationController;

    const capabilityControllers = createRuntimeCapabilityControllers({
        providerToolController: provider.toolController,
        providerQueryController: provider.queryController,
        mutationState: invisibleMutationState,
        getWorkspaceObjectCount: function(): number {
            return listProviderWorkspaceObjects().concat(
                listImportedTables()
            ).length;
        },
        getSnapshot: function() {
            return lifecycleState.getSnapshot();
        },
        hasRuntimeCapability
    });
    const capabilityRequestController = capabilityControllers.requestController;

    const getSnapshot = function(): RuntimeSessionSnapshot {
        return lifecycleState.getSnapshot();
    };
    const workspaceControllers = createRuntimeWorkspaceControllers({
        workspaceState: runtimeWorkspaceState,
        providerWorkspaceController: provider.workspaceController,
        fallbackWorkspaceController,
        fallbackTabularState,
        listImportedTables,
        listProviderWorkspaceObjects,
        getSnapshot,
        recordRuntimeEvent
    });
    const activeDatasetController = workspaceControllers.activeDatasetController;
    const objectInspectionOperationController =
        workspaceControllers.objectInspectionOperationController;
    const workspaceOperationController =
        workspaceControllers.workspaceOperationController;
    const lifecycleExecutionController =
        createRuntimeLifecycleExecutionController({
            initialMessage: initialSnapshot.message,
            lifecycleController: provider.lifecycleController,
            lifecycleState,
            invalidateWorkspace: function() {
                runtimeWorkspaceState.invalidate();
            },
            getSnapshot
        });
    const eventListController = createRuntimeEventListController({
        providerEventController: provider.eventController,
        runtimeEventState,
        getSnapshot
    });
    const promptExecutionController = createRuntimePromptExecutionController({
        promptState: runtimePromptState,
        getSnapshot
    });

    const start = async function(): Promise<RuntimeSessionSnapshot> {
        return lifecycleExecutionController.start();
    };

    const stop = async function(): Promise<RuntimeSessionSnapshot> {
        return lifecycleExecutionController.stop();
    };

    const executeVisibleCommandWithEffects:
        RuntimeSessionManager["executeVisibleCommandWithEffects"] =
        async function(request) {
            const generation = runtimeWorkspaceState.getGeneration();
            const result = await commandOperationController.executeVisibleCommand(request);

            if (
                generation === runtimeWorkspaceState.getGeneration()
                && runtimeWorkspaceState.needsFullSnapshot()
                && result.workspaceReconciliation !== "failed"
            ) {
                try {
                    const previous = runtimeWorkspaceState.createSnapshot(getSnapshot());
                    const recovered = await listWorkspaceObjects();

                    if (
                        generation === runtimeWorkspaceState.getGeneration()
                        && recovered.status === "ready"
                    ) {
                        return {
                            ...result,
                            workspaceUpdate: createWorkspaceRecoveryUpdate(previous, recovered)
                        };
                    }
                }
                catch {
                    // Preserve the command result and stale baseline. Never
                    // replay a command to recover a missing workspace snapshot.
                }
            }

            return result;
        };

    const executeVisibleCommand:
        RuntimeSessionManager["executeVisibleCommand"] =
        async function(request) {
            const result = await executeVisibleCommandWithEffects(request);

            return result.transcriptEvents;
        };

    const executeProductCommand: RuntimeSessionManager["executeProductCommand"] = async function(request) {
        return commandOperationController.executeProductCommand(request);
    };

    const listWorkspaceObjects: RuntimeSessionManager["listWorkspaceObjects"] = async function(options) {
        return workspaceOperationController.listWorkspaceObjects(options);
    };

    const refreshWorkspaceAfterMutation = async function<T extends {
        status: string;
        workspaceUpdate?: WorkspaceUpdate | null;
        workspaceReconciliation?: WorkspaceReconciliation;
        results?: Array<{
            workspaceUpdate?: WorkspaceUpdate | null;
            workspaceReconciliation?: WorkspaceReconciliation;
        }>;
    }>(
        pendingResult: Promise<T>
    ): Promise<T> {
        const generation = runtimeWorkspaceState.getGeneration();
        const result = await pendingResult;

        if (generation !== runtimeWorkspaceState.getGeneration()) {
            return { ...result, workspaceUpdate: null, workspaceReconciliation: "not_checked" };
        }
        let appliedUpdate = false;
        const updates = [
            result.workspaceUpdate,
            ...(result.results || []).map((entry) => entry.workspaceUpdate)
        ];

        updates.forEach(function(update) {
            if (!update || (!update.workspaceRevision && !workspaceUpdateHasChanges(update))) {
                return;
            }

            const objects = runtimeWorkspaceState.applyUpdate(update);
            activeDatasetController.reconcileAfterWorkspaceRefresh(
                objects,
                "tabular-mutation-workspace-update"
            );
            appliedUpdate = true;
        });

        // Each returned mutation needs its own commit receipt. A receipt for
        // one member must not suppress reconciliation of an uncommitted member.
        const mutations = result.results?.length ? result.results : [result];
        const failedReconciliation = mutations.some((entry) => {
            return entry.workspaceReconciliation === "failed";
        });

        if (failedReconciliation) {
            runtimeWorkspaceState.markStale();
            return { ...result, workspaceReconciliation: "failed" };
        }

        const alreadyCommitted = mutations.every((entry) => {
            return Boolean(entry.workspaceUpdate?.workspaceRevision)
                || entry.workspaceReconciliation === "unchanged";
        });

        if (!alreadyCommitted && provider.workspaceController?.commitWorkspaceMutation) {
            let update: WorkspaceUpdate | null = null;

            try {
                update = await provider.workspaceController
                    .commitWorkspaceMutation(getSnapshot());
            }
            catch {
                // The mutation already ran. A failed refresh must not change
                // its execution result or encourage callers to repeat it.
            }

            if (generation !== runtimeWorkspaceState.getGeneration()) {
                return { ...result, workspaceUpdate: null, workspaceReconciliation: "not_checked" };
            }

            if (update && (update.workspaceRevision || workspaceUpdateHasChanges(update))) {
                const objects = runtimeWorkspaceState.applyUpdate(update);
                activeDatasetController.reconcileAfterWorkspaceRefresh(
                    objects,
                    "tabular-mutation-workspace-commit"
                );
                appliedUpdate = true;
            }
            else {
                runtimeWorkspaceState.markStale();
                return { ...result, workspaceReconciliation: "failed" };
            }
        }
        else if (!alreadyCommitted && !appliedUpdate) {
            await listWorkspaceObjects();
        }

        return result;
    };

    const getWorkspaceSnapshot: RuntimeSessionManager["getWorkspaceSnapshot"] = function() {
        return runtimeWorkspaceState.createSnapshot(getSnapshot());
    };

    const removeWorkspaceObjects: RuntimeSessionManager["removeWorkspaceObjects"] = async function(objectNames) {
        return workspaceOperationController.removeWorkspaceObjects(objectNames);
    };

    const renameWorkspaceObject: RuntimeSessionManager["renameWorkspaceObject"] = async function(request) {
        return workspaceOperationController.renameWorkspaceObject(request);
    };

    const clearWorkspace: RuntimeSessionManager["clearWorkspace"] = async function() {
        return workspaceOperationController.clearWorkspace();
    };

    const listRuntimeEvents: RuntimeSessionManager["listRuntimeEvents"] = async function() {
        return eventListController.listRuntimeEvents();
    };

    const listPrompts: RuntimeSessionManager["listPrompts"] = async function() {
        return promptExecutionController.listPrompts();
    };

    const requestPrompt: RuntimeSessionManager["requestPrompt"] = async function(request) {
        return promptExecutionController.requestPrompt(request);
    };

    const answerPrompt: RuntimeSessionManager["answerPrompt"] = async function(request) {
        return promptExecutionController.answerPrompt(request);
    };

    const inspectObject: RuntimeSessionManager["inspectObject"] = async function(objectName) {
        return objectInspectionOperationController.inspectObject(objectName);
    };

    const getActiveDataset = function() {
        return activeDatasetController.getActiveDataset();
    };

    const setActiveDataset: RuntimeSessionManager["setActiveDataset"] = async function(objectName) {
        if (runtimeWorkspaceState.getObjects() === null) {
            await listWorkspaceObjects();
        }

        return activeDatasetController.setActiveDataset(objectName);
    };

    const readTabularSchema: RuntimeSessionManager["readTabularSchema"] = async function(objectName) {
        return tabularReadOperationController.readSchema(objectName);
    };

    const readTabularPreview: RuntimeSessionManager["readTabularPreview"] = async function(input) {
        return tabularReadOperationController.readPreview(input);
    };

    const writeCell: RuntimeSessionManager["writeCell"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            cellMutationExecutionController.writeCell(request)
        );
    };

    const writeCells: RuntimeSessionManager["writeCells"] = async function(requests) {
        return refreshWorkspaceAfterMutation(
            cellMutationExecutionController.writeCells(requests)
        );
    };

    const renameColumn: RuntimeSessionManager["renameColumn"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            columnMutationOperationController.renameColumn(request)
        );
    };

    const insertColumn: RuntimeSessionManager["insertColumn"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            columnMutationOperationController.insertColumn(request)
        );
    };

    const removeColumn: RuntimeSessionManager["removeColumn"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            columnMutationOperationController.removeColumn(request)
        );
    };

    const insertRow: RuntimeSessionManager["insertRow"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            rowMutationOperationController.insertRow(request)
        );
    };

    const removeRow: RuntimeSessionManager["removeRow"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            rowMutationOperationController.removeRow(request)
        );
    };

    const sortRows: RuntimeSessionManager["sortRows"] = async function(request: RowSortRequest) {
        return refreshWorkspaceAfterMutation(
            rowMutationOperationController.sortRows(request)
        );
    };

    const updateRowName: RuntimeSessionManager["updateRowName"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            rowMutationOperationController.updateRowName(request)
        );
    };

    const readVariableMetadata: RuntimeSessionManager["readVariableMetadata"] = async function(objectName) {
        return variableMetadataOperationController.readVariableMetadata(objectName);
    };

    const writeVariableMetadata: RuntimeSessionManager["writeVariableMetadata"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            variableMetadataOperationController.writeVariableMetadata(request)
        );
    };

    const readValueLabels: RuntimeSessionManager["readValueLabels"] = async function(objectName) {
        return labelStateOperationController.readValueLabels(objectName);
    };

    const writeValueLabels: RuntimeSessionManager["writeValueLabels"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            labelStateOperationController.writeValueLabels(request)
        );
    };

    const readDeclaredMissing: RuntimeSessionManager["readDeclaredMissing"] = async function(objectName) {
        return labelStateOperationController.readDeclaredMissing(objectName);
    };

    const writeDeclaredMissing: RuntimeSessionManager["writeDeclaredMissing"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            labelStateOperationController.writeDeclaredMissing(request)
        );
    };

    const importData: RuntimeSessionManager["importData"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            importOperationController.importData(request)
        );
    };

    const readHelpTopic: RuntimeSessionManager["readHelpTopic"] = async function(request) {
        return capabilityRequestController.readHelpTopic(request);
    };

    const readCompletions: RuntimeSessionManager["readCompletions"] = async function(request) {
        return capabilityRequestController.readCompletions(request);
    };

    const checkDependencies: RuntimeSessionManager["checkDependencies"] = async function(request) {
        return capabilityRequestController.checkDependencies(request);
    };

    const executeInvisibleQuery: RuntimeSessionManager["executeInvisibleQuery"] = async function(request) {
        return capabilityRequestController.executeInvisibleQuery(request);
    };

    const executeInvisibleMutation: RuntimeSessionManager["executeInvisibleMutation"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            capabilityRequestController.executeInvisibleMutation(request)
        );
    };

    const executeDialog: RuntimeSessionManager["executeDialog"] = async function(request) {
        return compositionOperationController.executeDialog(request);
    };

    const executeRuntimeMethod = async function(
        request: RuntimeExtensionMethodRequest
    ): Promise<RuntimeExtensionMethodResult> {
        const result = await runtimeExtensionExecutionController.execute(
            request,
            getSnapshot()
        );

        if (workspaceUpdateHasChanges(result.workspaceUpdate)) {
            const objects = runtimeWorkspaceState.applyUpdate(
                result.workspaceUpdate
            );

            activeDatasetController.reconcileAfterWorkspaceRefresh(
                objects,
                "runtime-extension-workspace-update"
            );
        }

        return result;
    };

    const executeStartupTask: RuntimeSessionManager["executeStartupTask"] = async function(request) {
        return compositionOperationController.executeStartupTask(request);
    };

    return {
        getSnapshot,
        start,
        stop,
        executeVisibleCommand,
        executeVisibleCommandWithEffects,
        executeProductCommand,
        getWorkspaceSnapshot,
        listWorkspaceObjects,
        removeWorkspaceObjects,
        renameWorkspaceObject,
        clearWorkspace,
        listRuntimeEvents,
        inspectObject,
        getActiveDataset,
        setActiveDataset,
        readTabularSchema,
        readTabularPreview,
        writeCell,
        writeCells,
        renameColumn,
        insertColumn,
        removeColumn,
        insertRow,
        removeRow,
        sortRows,
        updateRowName,
        readVariableMetadata,
        writeVariableMetadata,
        readValueLabels,
        writeValueLabels,
        readDeclaredMissing,
        writeDeclaredMissing,
        importData,
        readHelpTopic,
        readCompletions,
        checkDependencies,
        executeInvisibleQuery,
        executeInvisibleMutation,
        executeRuntimeMethod,
        executeDialog,
        requestPrompt,
        answerPrompt,
        listPrompts,
        executeStartupTask
    };
};
