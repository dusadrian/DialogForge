import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot,
    TabularSchemaSnapshot,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type { DialogDatasetDescriptor } from "./dialogBindings";
import {
    createProductDialogVariableFlagRecord
} from "../dialog-builder/productDialogWorkspaceData";
import { captureWorkspaceRuntimeScope } from "../../runtime/workspace/workspaceSnapshotDelivery";


const isTabularObject = function(object: WorkspaceObjectSnapshot): boolean {
    return object.capabilities.includes("tabular.schema") ||
        object.capabilities.includes("tabular.read");
};


const dialogColumnsFromWorkspaceObject = function(
    object: WorkspaceObjectSnapshot
): DialogDatasetDescriptor["columns"] | null {
    const names = Array.isArray(object.columns)
        ? object.columns.map(function(name): string {
            return String(name || "").trim();
        }).filter(Boolean)
        : [];
    const entries = Array.isArray(object.columnEntries)
        ? object.columnEntries
        : [];

    if (
        names.length === 0
        || entries.length !== names.length
        || entries.some(function(entry, index): boolean {
            return String(entry?.name || "").trim() !== names[index];
        })
    ) {
        return null;
    }

    return entries.map(createProductDialogVariableFlagRecord);
};


const workspaceObjectRevision = function(
    object: WorkspaceObjectSnapshot,
    workspace: WorkspaceSnapshot,
    session: RuntimeSessionSnapshot
): string {
    return JSON.stringify({
        providerId: session.providerId,
        lifecycleGeneration: session.lifecycleGeneration,
        workspaceRevision: workspace.workspaceRevision,
        columns: object.columns,
        columnEntries: object.columnEntries,
        provenance: object.provenance
    });
};


const readPreparedWorkspace = async function(
    runtimeSessionManager: RuntimeSessionManager
): Promise<WorkspaceSnapshot> {
    const prepared = runtimeSessionManager.getWorkspaceSnapshot();

    return prepared.status === "ready"
        ? prepared
        : runtimeSessionManager.listWorkspaceObjects();
};


export const createRuntimeDialogDatasetResolver = function(
    runtimeSessionManager: RuntimeSessionManager
) {
    const fallbackColumns = new Map<string, {
        revision: string;
        columns: DialogDatasetDescriptor["columns"];
    }>();

    return async function(): Promise<DialogDatasetDescriptor[]> {
        const scopeIsCurrent = captureWorkspaceRuntimeScope(() => runtimeSessionManager);
        const workspace = await readPreparedWorkspace(runtimeSessionManager);

        if (workspace.status !== "ready" || !scopeIsCurrent(workspace)) {
            return [];
        }
        const session = runtimeSessionManager.getSnapshot();

        const descriptors: DialogDatasetDescriptor[] = [];
        const availableDatasets = new Set<string>();

        for (const object of workspace.objects) {
            if (!isTabularObject(object)) {
                continue;
            }

            availableDatasets.add(object.name);

            const preparedColumns = dialogColumnsFromWorkspaceObject(object);

            if (preparedColumns) {
                descriptors.push({
                    name: object.name,
                    columns: preparedColumns
                });
                continue;
            }

            const revision = workspaceObjectRevision(object, workspace, session);
            const cached = fallbackColumns.get(object.name);

            if (cached?.revision === revision) {
                descriptors.push({
                    name: object.name,
                    columns: cached.columns
                });
                continue;
            }

            let schema: TabularSchemaSnapshot;
            try {
                schema = await runtimeSessionManager.readTabularSchema(object.name);
            }
            catch (error) {
                if (!scopeIsCurrent(workspace)) {
                    return [];
                }
                throw error;
            }
            if (!scopeIsCurrent(workspace)) {
                return [];
            }
            const columns = schema.status === "ready"
                ? schema.columns.map(function(column) {
                    return createProductDialogVariableFlagRecord({ ...column });
                })
                : (object.columns || []).map(function(name) {
                    return createProductDialogVariableFlagRecord({ name });
                });

            fallbackColumns.set(object.name, {
                revision,
                columns
            });
            descriptors.push({
                name: object.name,
                columns
            });
        }

        for (const name of fallbackColumns.keys()) {
            if (!availableDatasets.has(name)) {
                fallbackColumns.delete(name);
            }
        }

        return descriptors;
    };
};


export const createRuntimeDialogDatasetResolverOwner = function(
    getRuntime: () => RuntimeSessionManager | null | undefined
) {
    let currentRuntime: RuntimeSessionManager | null = null;
    let resolveDatasets: ReturnType<typeof createRuntimeDialogDatasetResolver> | null = null;

    return async function(): Promise<DialogDatasetDescriptor[]> {
        const runtime = getRuntime();
        if (!runtime) {
            currentRuntime = null;
            resolveDatasets = null;
            return [];
        }
        if (runtime !== currentRuntime || !resolveDatasets) {
            currentRuntime = runtime;
            resolveDatasets = createRuntimeDialogDatasetResolver(runtime);
        }
        return resolveDatasets();
    };
};
