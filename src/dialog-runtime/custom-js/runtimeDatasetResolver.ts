import type {
    RuntimeSessionManager,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type { DialogDatasetDescriptor } from "./dialogBindings";
import {
    createProductDialogVariableFlagRecord
} from "../dialog-builder/productDialogWorkspaceData";


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
    object: WorkspaceObjectSnapshot
): string {
    return JSON.stringify({
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
        const workspace = await readPreparedWorkspace(runtimeSessionManager);

        if (workspace.status !== "ready") {
            return [];
        }

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

            const revision = workspaceObjectRevision(object);
            const cached = fallbackColumns.get(object.name);

            if (cached?.revision === revision) {
                descriptors.push({
                    name: object.name,
                    columns: cached.columns
                });
                continue;
            }

            const schema = await runtimeSessionManager.readTabularSchema(object.name);
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
