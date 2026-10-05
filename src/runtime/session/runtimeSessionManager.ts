import type {
    DialogDefinition,
    EvaluatedStartupTask
} from "../../core/contracts/applicationComposition";
import type { DialogExternalCallHost } from "../../core/contracts/dialogExternalCall";
import {
    createRuntimeCommandControllers
} from "../commands/runtimeCommandControllers";
import { createRuntimeVisibleCommandQueue } from "../commands/runtimeVisibleCommandQueue";
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
import type { WorkspaceMutationOwnership } from "../workspace/runtimeWorkspaceOperationController";
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
    RuntimeCommandExecutionResult,
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    WorkspaceReconciliation,
    WorkspaceSnapshot,
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";


export interface RuntimeSessionManagerOptions {
    rootDir?: string;
    dialogs?: DialogDefinition[];
    startupTasks?: EvaluatedStartupTask[];
    dialogExternalCallHost?: Pick<DialogExternalCallHost, "supports">;
    retireRuntimeResources?(): void;
}


interface ReconciledMutationResult {
    status: string;
    workspaceUpdate?: WorkspaceUpdate | null;
    workspaceReconciliation?: WorkspaceReconciliation;
    results?: Array<{
        workspaceUpdate?: WorkspaceUpdate | null;
        workspaceReconciliation?: WorkspaceReconciliation;
    }>;
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
    const isWorkspaceReadAvailable = function(): boolean {
        const freshness = runtimeWorkspaceState.createSnapshot(
            lifecycleState.getSnapshot()
        ).freshness;

        return freshness === "fresh" || freshness === "unread";
    };
    const fallbackTabularState = createRuntimeFallbackTabularState();
    const invisibleMutationState = createRuntimeInvisibleMutationState();
    const runtimeEventState = createRuntimeEventState(
        40, () => lifecycleState.getSnapshot().lifecycleGeneration
    );
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
            if (
                (!update.workspaceRevision && !workspaceUpdateHasChanges(update))
                || !runtimeWorkspaceState.canApplyUpdate(update)
            ) {
                return false;
            }

            const objects = runtimeWorkspaceState.applyUpdate(update);

            activeDatasetController.reconcileAfterWorkspaceRefresh(
                objects,
                "workspace-update"
            );
            return true;
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
        getWorkspaceGeneration: runtimeWorkspaceState.getGeneration,
        getWorkspaceReadEpoch: runtimeWorkspaceState.getReadEpoch,
        isWorkspaceReadAvailable,
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
        getWorkspaceReadEpoch: runtimeWorkspaceState.getReadEpoch,
        isWorkspaceReadAvailable,
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
            retireRuntimeResources: options.retireRuntimeResources,
            lifecycleController: provider.lifecycleController,
            lifecycleState,
            invalidateWorkspace: function() {
                visibleCommandQueue.retire();
                runtimePromptState.invalidate();
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

    const performVisibleCommandWithEffects:
        RuntimeSessionManager["executeVisibleCommandWithEffects"] =
        async function(request) {
            const generation = runtimeWorkspaceState.getGeneration();
            const reconciliationToken = getSnapshot().status === "ready"
                ? runtimeWorkspaceState.beginCommandReconciliation()
                : null;
            let result: RuntimeCommandExecutionResult;

            try {
                result = await commandOperationController.executeVisibleCommand(request);
            }
            catch (error) {
                if (generation === runtimeWorkspaceState.getGeneration()) {
                    runtimeWorkspaceState.markStale();
                }

                throw error;
            }
            finally {
                if (reconciliationToken !== null) {
                    runtimeWorkspaceState.endCommandReconciliation(reconciliationToken);
                }
            }

            if (generation !== runtimeWorkspaceState.getGeneration()) {
                return {
                    ...result,
                    executionDisposition: "session_lost",
                    workspaceUpdate: null,
                    workspaceReconciliation: "not_checked"
                };
            }

            if (
                result.executionDisposition === "session_lost"
                || result.executionDisposition === "not_started"
            ) {
                return { ...result, workspaceUpdate: null };
            }

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
                            executionDisposition: "completed",
                            workspaceUpdate: createWorkspaceRecoveryUpdate(previous, recovered)
                        };
                    }
                }
                catch {
                    // Preserve the command result and stale baseline. Never
                    // replay a command to recover a missing workspace snapshot.
                }
            }

            if (generation !== runtimeWorkspaceState.getGeneration()) {
                return {
                    ...result,
                    executionDisposition: "session_lost",
                    workspaceUpdate: null,
                    workspaceReconciliation: "not_checked"
                };
            }

            return {
                ...result,
                executionDisposition: result.executionDisposition || "completed"
            };
        };

    const visibleCommandQueue = createRuntimeVisibleCommandQueue(
        performVisibleCommandWithEffects
    );
    const executeVisibleCommandWithEffects:
        RuntimeSessionManager["executeVisibleCommandWithEffects"] =
        function(request) {
            if (getSnapshot().status !== "ready") {
                return performVisibleCommandWithEffects(request);
            }

            return visibleCommandQueue.enqueue({ ...request });
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

    const reconcileMutationResult = async function<T extends ReconciledMutationResult>(
        result: T,
        generation: number
    ): Promise<T> {
        const discardRetiredMutationUpdates = function(): T {
            return {
                ...result,
                workspaceUpdate: null,
                workspaceReconciliation: "not_checked",
                ...(result.results ? {
                    results: result.results.map((entry) => ({
                        ...entry,
                        workspaceUpdate: null,
                        workspaceReconciliation: "not_checked"
                    }))
                } : {})
            };
        };

        if (generation !== runtimeWorkspaceState.getGeneration()) {
            return discardRetiredMutationUpdates();
        }
        let appliedUpdate = false;
        const applyMutationUpdate = function(
            update: WorkspaceUpdate | null | undefined
        ): WorkspaceUpdate | null | undefined {
            if (!update || (!update.workspaceRevision && !workspaceUpdateHasChanges(update))) {
                return update;
            }
            if (!runtimeWorkspaceState.canApplyUpdate(update)) {
                return null;
            }

            const objects = runtimeWorkspaceState.applyUpdate(update);
            activeDatasetController.reconcileAfterWorkspaceRefresh(
                objects,
                "tabular-mutation-workspace-update"
            );
            appliedUpdate = true;
            return update;
        };
        const acceptedResult = {
            ...result,
            workspaceUpdate: applyMutationUpdate(result.workspaceUpdate),
            ...(result.results ? {
                results: result.results.map((entry) => ({
                    ...entry,
                    workspaceUpdate: applyMutationUpdate(entry.workspaceUpdate)
                }))
            } : {})
        };

        // Each returned mutation needs its own commit receipt. A receipt for
        // one member must not suppress reconciliation of an uncommitted member.
        // Use original receipts here: rejection is not permission to recommit.
        const mutations = result.results?.length ? result.results : [result];
        const failedReconciliation = mutations.some((entry) => {
            return entry.workspaceReconciliation === "failed";
        });

        if (failedReconciliation) {
            runtimeWorkspaceState.markStale(true);
            return { ...acceptedResult, workspaceReconciliation: "failed" };
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
                return discardRetiredMutationUpdates();
            }

            if (update && (update.workspaceRevision || workspaceUpdateHasChanges(update))) {
                applyMutationUpdate(update);
            }
            else {
                // A later delta may be empty if the written value returns to
                // the old baseline. Recovery must also invalidate warm views.
                runtimeWorkspaceState.markStale(true);
                return { ...acceptedResult, workspaceReconciliation: "failed" };
            }
        }
        else if (!alreadyCommitted && !appliedUpdate) {
            await listWorkspaceObjects();
        }

        if (generation !== runtimeWorkspaceState.getGeneration()) {
            return discardRetiredMutationUpdates();
        }

        return acceptedResult;
    };

    const refreshWorkspaceAfterMutation = async function<T extends ReconciledMutationResult>(
        execute: (beginMutation: () => void) => Promise<T>,
        validateBeforeMutation = false
    ): Promise<T> {
        const generation = runtimeWorkspaceState.getGeneration();
        let token: number | null = null;
        const beginMutation = function(): void {
            if (
                token === null && generation === runtimeWorkspaceState.getGeneration()
                && getSnapshot().status === "ready"
            ) {
                token = runtimeWorkspaceState.beginCommandReconciliation();
            }
        };

        try {
            if (!validateBeforeMutation) {
                beginMutation();
            }

            const result = await execute(beginMutation);

            if (token === null && generation === runtimeWorkspaceState.getGeneration()) {
                // Validation rejected the request before any write boundary.
                return result;
            }

            return await reconcileMutationResult(result, generation);
        }
        catch (error) {
            if (token !== null && generation === runtimeWorkspaceState.getGeneration()) {
                runtimeWorkspaceState.markStale(true);
            }

            throw error;
        }
        finally {
            if (token !== null) {
                runtimeWorkspaceState.endCommandReconciliation(token);
            }
        }
    };

    const getWorkspaceSnapshot: RuntimeSessionManager["getWorkspaceSnapshot"] = function() {
        return runtimeWorkspaceState.createSnapshot(getSnapshot());
    };

    const executeOwnedWorkspaceMutation = async function(
        execute: (ownership: WorkspaceMutationOwnership) => Promise<WorkspaceSnapshot>
    ): Promise<WorkspaceSnapshot> {
        const generation = runtimeWorkspaceState.getGeneration();
        let token: number | undefined;

        try {
            return await execute({
                begin: function() {
                    if (
                        token === undefined && generation === runtimeWorkspaceState.getGeneration()
                        && getSnapshot().status === "ready"
                    ) {
                        token = runtimeWorkspaceState.beginCommandReconciliation();
                    }
                },
                readWorkspace: function() {
                    return runtimeWorkspaceState.createSnapshot(getSnapshot(), token);
                }
            });
        }
        catch (error) {
            if (token !== undefined && generation === runtimeWorkspaceState.getGeneration()) {
                runtimeWorkspaceState.markStale(true);
            }

            throw error;
        }
        finally {
            if (token !== undefined) {
                runtimeWorkspaceState.endCommandReconciliation(token);
            }
        }
    };

    const removeWorkspaceObjects: RuntimeSessionManager["removeWorkspaceObjects"] = async function(objectNames) {
        return executeOwnedWorkspaceMutation((ownership) => {
            return workspaceOperationController.removeWorkspaceObjects(objectNames, ownership);
        });
    };

    const renameWorkspaceObject: RuntimeSessionManager["renameWorkspaceObject"] = async function(request) {
        return executeOwnedWorkspaceMutation((ownership) => {
            return workspaceOperationController.renameWorkspaceObject(request, ownership);
        });
    };

    const clearWorkspace: RuntimeSessionManager["clearWorkspace"] = async function() {
        return executeOwnedWorkspaceMutation((ownership) => {
            return workspaceOperationController.clearWorkspace(ownership);
        });
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

    let activeDatasetRequestSequence = 0;

    const setActiveDataset: RuntimeSessionManager["setActiveDataset"] = async function(objectName) {
        const requestSequence = ++activeDatasetRequestSequence;
        const generation = runtimeWorkspaceState.getGeneration();

        if (runtimeWorkspaceState.getObjects() === null) {
            try {
                await listWorkspaceObjects();
            }
            catch (error) {
                if (
                    requestSequence !== activeDatasetRequestSequence
                    || generation !== runtimeWorkspaceState.getGeneration()
                ) {
                    return activeDatasetController.getActiveDataset();
                }

                throw error;
            }
        }

        if (
            requestSequence !== activeDatasetRequestSequence
            || generation !== runtimeWorkspaceState.getGeneration()
            || (snapshot.status === "ready"
                && runtimeWorkspaceState.getObjects() === null)
        ) {
            return activeDatasetController.getActiveDataset();
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
            () => cellMutationExecutionController.writeCell(request)
        );
    };

    const writeCells: RuntimeSessionManager["writeCells"] = async function(requests) {
        return refreshWorkspaceAfterMutation(
            () => cellMutationExecutionController.writeCells(requests)
        );
    };

    const renameColumn: RuntimeSessionManager["renameColumn"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => columnMutationOperationController.renameColumn(request)
        );
    };

    const insertColumn: RuntimeSessionManager["insertColumn"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => columnMutationOperationController.insertColumn(request)
        );
    };

    const removeColumn: RuntimeSessionManager["removeColumn"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => columnMutationOperationController.removeColumn(request)
        );
    };

    const insertRow: RuntimeSessionManager["insertRow"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => rowMutationOperationController.insertRow(request)
        );
    };

    const removeRow: RuntimeSessionManager["removeRow"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => rowMutationOperationController.removeRow(request)
        );
    };

    const sortRows: RuntimeSessionManager["sortRows"] = async function(request: RowSortRequest) {
        return refreshWorkspaceAfterMutation(
            () => rowMutationOperationController.sortRows(request)
        );
    };

    const updateRowName: RuntimeSessionManager["updateRowName"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => rowMutationOperationController.updateRowName(request)
        );
    };

    const readVariableMetadata: RuntimeSessionManager["readVariableMetadata"] = async function(objectName) {
        return variableMetadataOperationController.readVariableMetadata(objectName);
    };

    const writeVariableMetadata: RuntimeSessionManager["writeVariableMetadata"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            (beginMutation) => variableMetadataOperationController.writeVariableMetadata(
                request, beginMutation
            ),
            true
        );
    };

    const readValueLabels: RuntimeSessionManager["readValueLabels"] = async function(objectName) {
        return labelStateOperationController.readValueLabels(objectName);
    };

    const writeValueLabels: RuntimeSessionManager["writeValueLabels"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            (beginMutation) => labelStateOperationController.writeValueLabels(request, beginMutation),
            true
        );
    };

    const readDeclaredMissing: RuntimeSessionManager["readDeclaredMissing"] = async function(objectName) {
        return labelStateOperationController.readDeclaredMissing(objectName);
    };

    const writeDeclaredMissing: RuntimeSessionManager["writeDeclaredMissing"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            (beginMutation) => labelStateOperationController.writeDeclaredMissing(request, beginMutation),
            true
        );
    };

    const importData: RuntimeSessionManager["importData"] = async function(request) {
        return refreshWorkspaceAfterMutation(
            () => importOperationController.importData(request)
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
            () => capabilityRequestController.executeInvisibleMutation(request)
        );
    };

    const executeDialog: RuntimeSessionManager["executeDialog"] = async function(request) {
        return compositionOperationController.executeDialog(request);
    };

    const executeRuntimeMethod = async function(
        request: RuntimeExtensionMethodRequest
    ): Promise<RuntimeExtensionMethodResult> {
        if (request.workspaceEffect === "mutation") {
            const result = await refreshWorkspaceAfterMutation(() => {
                return runtimeExtensionExecutionController.execute(
                    request,
                    getSnapshot()
                );
            });

            return {
                ...result,
                workspaceUpdate: result.workspaceUpdate || undefined
            };
        }

        const generation = runtimeWorkspaceState.getGeneration();
        const result = await runtimeExtensionExecutionController.execute(
            request,
            getSnapshot()
        );

        if (generation !== runtimeWorkspaceState.getGeneration()) {
            return {
                ...result,
                workspaceUpdate: undefined,
                ...(result.workspaceReconciliation
                    ? { workspaceReconciliation: "not_checked" as const }
                    : {})
            };
        }

        if (result.workspaceReconciliation === "failed") {
            runtimeWorkspaceState.markStale(true);
            return { ...result, workspaceUpdate: undefined };
        }

        if (result.workspaceUpdate && (
            result.workspaceUpdate.workspaceRevision
            || workspaceUpdateHasChanges(result.workspaceUpdate)
        )) {
            if (!runtimeWorkspaceState.canApplyUpdate(result.workspaceUpdate)) {
                return { ...result, workspaceUpdate: undefined };
            }
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
