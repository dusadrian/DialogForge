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
import {
    createWorkspaceActiveDatasetPresenter
} from "./workspaceActiveDatasetPresentation";
import {
    readSelectedWorkspaceDatasetName
} from "../../../runtime/workspace/workspaceActiveDatasetDelivery";


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
    const retiredSessions = new Set<string>();
    const presentActiveDataset = createWorkspaceActiveDatasetPresenter();

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
            pane.setActiveDataset(readSelectedWorkspaceDatasetName(activeDataset));
        }

        bindings.applyPaneVisibility(false);
    };

    const renderWorkspace = function(snapshot: WorkspaceSnapshot): void {
        const current = bindings.getWorkspaceSnapshot();
        const previousRevision = current?.workspaceRevision;
        const revision = snapshot.workspaceRevision;

        if (revision && retiredSessions.has(revision.session)) {
            return;
        }

        if (previousRevision && current) {
            if (!revision) {
                if (![
                    "uncertain", "unavailable", "failed", "error"
                ].includes(snapshot.status)) {
                    return;
                }
                // Lifecycle/failure messages may have no receipt. Preserve the
                // known baseline so an old response cannot establish it again.
                snapshot = {
                    ...snapshot,
                    objects: current.objects,
                    workspaceRevision: previousRevision
                };
            }
            else if (revision.session === previousRevision.session) {
                if (
                    revision.sequence < previousRevision.sequence
                    || (revision.sequence === previousRevision.sequence
                        && snapshot.status === "ready")
                ) {
                    return;
                }
                if (revision.sequence === previousRevision.sequence) {
                    snapshot = { ...snapshot, objects: current.objects };
                }
            }
            else {
                // A full ready snapshot may establish the replacement runtime;
                // history deltas cannot. Never return to the retired runtime.
                if (snapshot.status !== "ready") {
                    return;
                }
                retiredSessions.add(previousRevision.session);
            }
        }

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
    ): boolean {
        return presentActiveDataset(snapshot, {
            remember: bindings.setActiveDatasetSnapshot,
            renderActiveName: (name) => pane?.setActiveDataset(name),
            renderToolbar: bindings.renderConsoleToolbar,
            updated: function() {
                const workspace = bindings.getWorkspaceSnapshot();

                if (workspace) {
                    renderWorkspace(workspace);
                }
            }
        });
    };

    return {
        initialize,
        renderWorkspace,
        renderActiveDataset,
        refreshTranslations: function(): void {
            pane?.setTranslator(bindings.translate);
        }
    };
};
