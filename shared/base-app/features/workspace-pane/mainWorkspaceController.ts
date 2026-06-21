import type {
    ActiveDatasetSnapshot,
    ObjectInspectionResult,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";


export interface MainWorkspaceControllerBindings {
    renderWorkspace(snapshot: WorkspaceSnapshot): void;
    renderObjectInspection(result: ObjectInspectionResult): void;
    renderActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    confirmRemove(objectName: string): boolean;
    confirmClear(): boolean;
    refreshRuntimeEvents(): void;
    readDatasetDetails(objectName: string): void;
}


export interface MainWorkspaceController {
    refresh(): Promise<void>;
    inspectObject(objectName: string): Promise<void>;
    removeObject(objectName: string): Promise<void>;
    clear(): Promise<void>;
    setActiveDataset(objectName: string): Promise<void>;
}


export const createMainWorkspaceController = function(
    bindings: MainWorkspaceControllerBindings
): MainWorkspaceController {
    const refresh = async function(): Promise<void> {
        const snapshot = await window.dialogForge.refreshWorkspace();

        bindings.renderWorkspace(snapshot);
    };

    const inspectObject = async function(objectName: string): Promise<void> {
        const result = await window.dialogForge.inspectObject(objectName);

        bindings.renderObjectInspection(result);
    };

    const refreshWorkspaceState = async function(): Promise<void> {
        const activeDataset = await window.dialogForge.getActiveDataset();

        bindings.renderActiveDataset(activeDataset);
        bindings.refreshRuntimeEvents();
    };

    const removeObject = async function(objectName: string): Promise<void> {
        if (!bindings.confirmRemove(objectName)) {
            return;
        }

        const snapshot = await window.dialogForge.removeWorkspaceObjects([
            objectName
        ]);

        bindings.renderWorkspace(snapshot);
        await refreshWorkspaceState();
    };

    const clear = async function(): Promise<void> {
        if (!bindings.confirmClear()) {
            return;
        }

        const snapshot = await window.dialogForge.clearWorkspace();

        bindings.renderWorkspace(snapshot);
        await refreshWorkspaceState();
    };

    const setActiveDataset = async function(
        objectName: string
    ): Promise<void> {
        const snapshot = await window.dialogForge.setActiveDataset(objectName);

        bindings.renderActiveDataset(snapshot);

        if (snapshot.status === "selected") {
            bindings.readDatasetDetails(snapshot.objectName);
            bindings.refreshRuntimeEvents();
        }
    };

    return {
        refresh,
        inspectObject,
        removeObject,
        clear,
        setActiveDataset
    };
};
