import type {
    RuntimeCapability,
    WorkspaceDatasetChange,
    WorkspaceObjectSnapshot,
    WorkspaceUpdate
} from "../provider-contract/runtimeProvider";
import {
    createWorkspaceObject
} from "./workspaceProtocol";


const recordFromValue = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const stringArray = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map(function(entry) {
            return String(entry || "").trim();
        }).filter(Boolean)
        : [];
};


const numberArray = function(value: unknown): number[] {
    return Array.isArray(value)
        ? value.map(Number).filter(Number.isFinite)
        : [];
};


const optionalNumber = function(value: unknown): number | undefined {
    const number = Number(value);

    return Number.isFinite(number) ? number : undefined;
};


const workspaceObjectName = function(value: Record<string, unknown>): string {
    return String(
        value.name
        || value.access_key
        || value.display_name
        || ""
    ).trim();
};


const workspaceObjectKind = function(value: Record<string, unknown>): string {
    return String(
        value.kind
        || value.display_type
        || value.type_info
        || "object"
    ).trim() || "object";
};


const workspaceObjectCapabilities = function(
    value: Record<string, unknown>,
    kind: string,
    hasViewer: boolean
): RuntimeCapability[] {
    const supplied = Array.isArray(value.capabilities)
        ? value.capabilities.filter(function(
            capability
        ): capability is RuntimeCapability {
            return typeof capability === "string";
        })
        : [];

    if (supplied.length > 0) {
        return supplied;
    }

    if (
        hasViewer
        || kind === "table"
        || kind === "data.frame"
        || kind === "tibble"
    ) {
        return [
            "tabular.schema",
            "tabular.read"
        ];
    }

    return [];
};


const workspaceColumnEntries = function(
    dataframe: Record<string, unknown>
): Array<Record<string, unknown> & { name: string }> {
    const columns = stringArray(dataframe.colnames);
    const flagNames = [
        "numeric",
        "factor",
        "calibrated",
        "binary",
        "character",
        "categorical",
        "date"
    ];

    return columns.map(function(name, index) {
        const entry: Record<string, unknown> & { name: string } = { name };

        flagNames.forEach(function(flagName) {
            const flags = Array.isArray(dataframe[flagName])
                ? dataframe[flagName] as unknown[]
                : [];

            entry[flagName] = flags[index] === true;
        });

        return entry;
    });
};


export const normalizeWorkspaceUpdateObject = function(
    value: unknown
): WorkspaceObjectSnapshot | null {
    const record = recordFromValue(value);
    const name = workspaceObjectName(record);

    if (!name) {
        return null;
    }

    const kind = workspaceObjectKind(record);
    const hasViewer = record.hasViewer === true || record.has_viewer === true;
    const dataframe = recordFromValue(record.dataframe);
    const dataframeColumns = stringArray(dataframe.colnames);
    const suppliedColumns = stringArray(record.columns);
    const suppliedColumnEntries = Array.isArray(record.columnEntries)
        ? record.columnEntries as Array<Record<string, unknown> & { name: string }>
        : [];

    return createWorkspaceObject({
        name,
        kind,
        detail: String(
            record.detail
            || record.display_value
            || record.display_type
            || kind
        ).trim(),
        rows: optionalNumber(dataframe.rowCount)
            ?? optionalNumber(record.rows),
        columns: dataframeColumns.length > 0
            ? dataframeColumns
            : suppliedColumns,
        columnEntries: suppliedColumnEntries.length > 0
            ? suppliedColumnEntries
            : workspaceColumnEntries(dataframe),
        hasViewer,
        provenance: record.provenance && typeof record.provenance === "object"
            ? record.provenance as WorkspaceObjectSnapshot["provenance"]
            : null,
        capabilities: workspaceObjectCapabilities(record, kind, hasViewer)
    });
};


const normalizeDatasetChange = function(
    value: unknown
): WorkspaceDatasetChange | null {
    const record = recordFromValue(value);
    const name = String(record.name || "").trim();
    const kind = String(record.kind || "").trim();

    if (!name || !kind) {
        return null;
    }

    return {
        name,
        kind,
        columns: stringArray(record.columns),
        rows: numberArray(record.rows),
        rowCount: optionalNumber(record.rowCount),
        columnCount: optionalNumber(record.columnCount),
        columnIndex: optionalNumber(record.columnIndex),
        schemaChanged: record.schemaChanged === true
    };
};


export const createWorkspaceUpdate = function(value: unknown): WorkspaceUpdate {
    const record = recordFromValue(value);
    const datasets = recordFromValue(record.datasets);
    const added = Array.isArray(record.added)
        ? record.added.map(normalizeWorkspaceUpdateObject).filter(
            (entry): entry is WorkspaceObjectSnapshot => Boolean(entry)
        )
        : [];
    const updated = Array.isArray(record.updated)
        ? record.updated.map(normalizeWorkspaceUpdateObject).filter(
            (entry): entry is WorkspaceObjectSnapshot => Boolean(entry)
        )
        : [];
    const changed = Array.isArray(datasets.changed)
        ? datasets.changed.map(normalizeDatasetChange).filter(
            (entry): entry is WorkspaceDatasetChange => Boolean(entry)
        )
        : [];

    return {
        added,
        updated,
        removed: stringArray(record.removed),
        datasets: {
            added: stringArray(datasets.added),
            removed: stringArray(datasets.removed),
            changed
        },
        objectCount: Number(record.objectCount || 0) || 0,
        updatedAt: Number(record.updatedAt || 0) || 0
    };
};


export const workspaceUpdateHasChanges = function(
    update: WorkspaceUpdate | null | undefined
): update is WorkspaceUpdate {
    return Boolean(
        update
        && (
            update.added.length > 0
            || update.updated.length > 0
            || update.removed.length > 0
            || update.datasets.added.length > 0
            || update.datasets.removed.length > 0
            || update.datasets.changed.length > 0
        )
    );
};


const mergeWorkspaceObject = function(
    previous: WorkspaceObjectSnapshot | undefined,
    next: WorkspaceObjectSnapshot
): WorkspaceObjectSnapshot {
    if (!previous) {
        return next;
    }

    return createWorkspaceObject({
        ...previous,
        ...next,
        rows: next.rows === undefined ? previous.rows : next.rows,
        columns: next.columns && next.columns.length > 0
            ? next.columns
            : previous.columns,
        columnEntries: next.columnEntries && next.columnEntries.length > 0
            ? next.columnEntries
            : previous.columnEntries,
        provenance: next.provenance || previous.provenance,
        capabilities: next.capabilities.length > 0
            ? next.capabilities
            : previous.capabilities
    });
};


export const applyWorkspaceUpdateToObjects = function(
    current: WorkspaceObjectSnapshot[],
    update: WorkspaceUpdate
): WorkspaceObjectSnapshot[] {
    const objects = new Map<string, WorkspaceObjectSnapshot>();

    current.forEach(function(object) {
        objects.set(object.name, object);
    });

    update.added.concat(update.updated).forEach(function(object) {
        objects.set(
            object.name,
            mergeWorkspaceObject(objects.get(object.name), object)
        );
    });

    update.removed.forEach(function(name) {
        objects.delete(name);
    });

    return Array.from(objects.values()).sort(function(left, right) {
        return left.name.localeCompare(right.name);
    });
};
