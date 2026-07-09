import type {
    ActiveDatasetSnapshot,
    ObjectInspectionResult,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createMainWorkspacePaneCoordinator
} from "../workspace-pane/mainWorkspacePaneCoordinator";
import {
    createMainWorkspaceController
} from "../workspace-pane/mainWorkspaceController";
import {
    createWorkspaceRuntimeEventController
} from "../workspace-pane/workspaceRuntimeEventController";


export interface MainWorkspaceServicesOptions {
    document: Document;
    translate(key: string): string;
    getWorkspaceSnapshot(): WorkspaceSnapshot | null;
    setWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void;
    getActiveDataset(): ActiveDatasetSnapshot | null;
    setActiveDatasetSnapshot(snapshot: ActiveDatasetSnapshot): void;
    getRuntimeProviderId(): string;
    ingestCompletionNames(names: string[]): void;
    hasConsoleSurface(): boolean;
    setConsoleText(value: string): void;
    focusConsole(): void;
    openDatasetEditor(objectName: string): Promise<unknown>;
    applyPaneVisibility(visible: boolean): void;
    renderConsoleToolbar(): void;
    renderObjectInspection(result: ObjectInspectionResult): void;
    refreshRuntimeEvents(): void;
    readDatasetDetails(objectName: string): void;
    confirmRemove(objectName: string): boolean;
    confirmClear(): boolean;
}


export const createMainWorkspaceServices = function(
    options: MainWorkspaceServicesOptions
) {
    const paneCoordinator = createMainWorkspacePaneCoordinator({
        document: options.document,
        translate: options.translate,
        getWorkspaceSnapshot: options.getWorkspaceSnapshot,
        setWorkspaceSnapshot: options.setWorkspaceSnapshot,
        getActiveDataset: options.getActiveDataset,
        setActiveDatasetSnapshot: options.setActiveDatasetSnapshot,
        ingestCompletionNames: options.ingestCompletionNames,
        hasConsoleSurface: options.hasConsoleSurface,
        setConsoleText: options.setConsoleText,
        focusConsole: options.focusConsole,
        openDatasetEditor: options.openDatasetEditor,
        makeActiveDataset: function(objectName): Promise<void> {
            return workspaceController.setActiveDataset(objectName);
        },
        removeWorkspaceObject: function(objectName): Promise<void> {
            return workspaceController.removeObject(objectName);
        },
        clearWorkspace: function(): Promise<void> {
            return workspaceController.clear();
        },
        applyPaneVisibility: options.applyPaneVisibility,
        renderConsoleToolbar: options.renderConsoleToolbar
    });
    const workspaceController = createMainWorkspaceController({
        renderWorkspace: paneCoordinator.renderWorkspace,
        renderObjectInspection: options.renderObjectInspection,
        renderActiveDataset: paneCoordinator.renderActiveDataset,
        confirmRemove: options.confirmRemove,
        confirmClear: options.confirmClear,
        refreshRuntimeEvents: options.refreshRuntimeEvents,
        readDatasetDetails: options.readDatasetDetails
    });
    const runtimeEventController = createWorkspaceRuntimeEventController({
        getWorkspaceSnapshot: options.getWorkspaceSnapshot,
        getRuntimeProviderId: options.getRuntimeProviderId,
        renderWorkspace: paneCoordinator.renderWorkspace,
        setActiveDataset: workspaceController.setActiveDataset
    });

    return {
        initializeWorkspacePane: paneCoordinator.initialize,
        renderWorkspace: paneCoordinator.renderWorkspace,
        renderActiveDataset: paneCoordinator.renderActiveDataset,
        refreshWorkspace: workspaceController.refresh,
        inspectWorkspaceObject: workspaceController.inspectObject,
        removeWorkspaceObject: workspaceController.removeObject,
        clearWorkspace: workspaceController.clear,
        setActiveDataset: workspaceController.setActiveDataset,
        applyWorkspaceRuntimeEvents: runtimeEventController.applySnapshot
    };
};
