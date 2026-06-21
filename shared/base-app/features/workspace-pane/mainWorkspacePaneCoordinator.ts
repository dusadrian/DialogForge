import type {
    ActiveDatasetSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createWorkspacePane
} from "./workspacePane";
import type {
    WorkspaceVariableViewItem
} from "./workspacePane.types";


export interface MainWorkspacePaneBindings {
    document: Document;
    translate(key: string): string;
    getWorkspaceSnapshot(): WorkspaceSnapshot | null;
    setWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void;
    getActiveDataset(): ActiveDatasetSnapshot | null;
    setActiveDatasetSnapshot(snapshot: ActiveDatasetSnapshot): void;
    ingestCompletionNames(names: string[]): void;
    hasConsoleSurface(): boolean;
    setConsoleText(value: string): void;
    focusConsole(): void;
    openDatasetEditor(objectName: string): Promise<unknown>;
    makeActiveDataset(objectName: string): Promise<void>;
    removeWorkspaceObject(objectName: string): Promise<void>;
    clearWorkspace(): Promise<void>;
    applyPaneVisibility(visible: boolean): void;
    renderConsoleToolbar(): void;
}


export const createMainWorkspacePaneCoordinator = function(
    bindings: MainWorkspacePaneBindings
) {
    let pane: ReturnType<typeof createWorkspacePane> | null = null;

    const objectNameFromItem = function(
        item: WorkspaceVariableViewItem
    ): string {
        return String(item.access_key || item.display_name || "").trim();
    };

    const insertVariableName = function(name: string): void {
        const value = String(name || "").trim();

        if (!value || !bindings.hasConsoleSurface()) {
            return;
        }

        bindings.setConsoleText(value);
        bindings.focusConsole();
    };

    const initialize = function(): void {
        const host = bindings.document.getElementById("workspacePane");

        if (!host || pane) {
            return;
        }

        pane = createWorkspacePane({
            container: host,
            t: bindings.translate,
            onInsertVariable: insertVariableName,
            onOpenVariable: async function(item): Promise<void> {
                const objectName = objectNameFromItem(item);

                if (objectName) {
                    await bindings.openDatasetEditor(objectName);
                }
            },
            onMakeActiveDataset: async function(item): Promise<void> {
                const objectName = objectNameFromItem(item);

                if (objectName) {
                    await bindings.makeActiveDataset(objectName);
                }
            },
            onDeleteVariable: bindings.removeWorkspaceObject,
            onClearWorkspace: bindings.clearWorkspace
        });

        const workspace = bindings.getWorkspaceSnapshot();
        const activeDataset = bindings.getActiveDataset();

        if (workspace) {
            pane.setSnapshot(workspace);
        }

        if (activeDataset) {
            pane.setActiveDataset(activeDataset.objectName);
        }

        bindings.applyPaneVisibility(false);
    };

    const renderWorkspace = function(snapshot: WorkspaceSnapshot): void {
        bindings.setWorkspaceSnapshot(snapshot);
        pane?.setSnapshot(snapshot);
        bindings.ingestCompletionNames(
            Array.isArray(snapshot.objects)
                ? snapshot.objects
                    .map((entry) => String(entry.name || ""))
                    .filter(Boolean)
                : []
        );
    };

    const renderActiveDataset = function(
        snapshot: ActiveDatasetSnapshot
    ): void {
        bindings.setActiveDatasetSnapshot(snapshot);
        pane?.setActiveDataset(snapshot.objectName);
        bindings.renderConsoleToolbar();

        const workspace = bindings.getWorkspaceSnapshot();

        if (workspace) {
            renderWorkspace(workspace);
        }
    };

    return {
        initialize,
        renderWorkspace,
        renderActiveDataset
    };
};
