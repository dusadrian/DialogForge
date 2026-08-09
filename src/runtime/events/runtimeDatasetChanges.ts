import type {
    RuntimeEventRecord
} from "../provider-contract/runtimeProvider";


const recordFromPayload = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const stringArrayFromPayload = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
};


const datasetChangeFromPayload = function(
    value: unknown
): Record<string, unknown> | null {
    const record = recordFromPayload(value);
    const name = String(record.name || "").trim();
    const kind = String(record.kind || "").trim();

    if (!name || !kind) {
        return null;
    }

    return {
        name,
        kind,
        columns: stringArrayFromPayload(record.columns),
        rows: Array.isArray(record.rows) ? record.rows : [],
        rowCount: record.rowCount,
        columnCount: record.columnCount,
        columnIndex: record.columnIndex,
        schemaChanged: record.schemaChanged === true
    };
};


const datasetChangesFromWorkspaceEvent = function(
    event: RuntimeEventRecord
): Array<Record<string, unknown>> {
    if (event.type !== "workspace.update") {
        return [];
    }

    const payload = recordFromPayload(event.payload);
    const datasets = recordFromPayload(payload.datasets);
    const changes: Array<Record<string, unknown>> = [];

    stringArrayFromPayload(datasets.added).forEach((name) => {
        changes.push({ name, kind: "dataset_added" });
    });
    stringArrayFromPayload(datasets.removed).forEach((name) => {
        changes.push({ name, kind: "dataset_removed" });
    });
    if (Array.isArray(datasets.changed)) {
        datasets.changed.forEach((entry) => {
            const change = datasetChangeFromPayload(entry);

            if (change) {
                changes.push(change);
            }
        });
    }

    return changes;
};


const datasetChangeFromTabularEvent = function(
    event: RuntimeEventRecord
): Record<string, unknown> | null {
    const name = String(event.objectName || "").trim();
    const type = String(event.type || "");
    const payload = recordFromPayload(event.payload);

    if (!name || !type.startsWith("tabular.")) {
        return null;
    }

    if (type.includes("column.renamed")) {
        return {
            name,
            kind: "dataset_column_renamed",
            columns: [
                String(payload.fromName || "").trim(),
                String(payload.toName || "").trim()
            ].filter(Boolean),
            columnIndex: payload.columnIndex
        };
    }

    if (type.includes("column.removed")) {
        return {
            name,
            kind: "dataset_column_removed",
            columns: stringArrayFromPayload([payload.columnName])
        };
    }

    if (type.includes("column")) {
        return {
            name,
            kind: "dataset_columns_changed",
            columns: stringArrayFromPayload([payload.columnName]),
            columnIndex: payload.columnIndex,
            schemaChanged: true
        };
    }

    if (type.includes("row")) {
        return {
            name,
            kind: "dataset_rows_changed",
            rows: Array.isArray(payload.rows) ? payload.rows : [payload.rowIndex]
        };
    }

    if (type.includes("cell")) {
        return {
            name,
            kind: "dataset_cells_changed",
            columns: stringArrayFromPayload([payload.columnName]),
            rows: Array.isArray(payload.rows) ? payload.rows : [payload.rowIndex]
        };
    }

    if (
        type.includes("variableMetadata")
        || type.includes("valueLabels")
        || type.includes("declaredMissing")
    ) {
        return {
            name,
            kind: "dataset_variable_meta_changed",
            columns: stringArrayFromPayload([payload.variableName])
        };
    }

    return null;
};


export const datasetChangesFromRuntimeEvent = function(
    event: RuntimeEventRecord
): Array<Record<string, unknown>> {
    const workspaceChanges = datasetChangesFromWorkspaceEvent(event);

    if (workspaceChanges.length > 0) {
        return workspaceChanges;
    }

    const tabularChange = datasetChangeFromTabularEvent(event);

    return tabularChange ? [tabularChange] : [];
};


export const runtimeEventKey = function(event: RuntimeEventRecord): string {
    return [
        event.providerId,
        event.type,
        event.objectName,
        event.createdAt,
        JSON.stringify(event.payload || {})
    ].join("\u001f");
};


export const createRuntimeDatasetChangeProjector = function() {
    const seen = new Set<string>();

    return {
        project(events: RuntimeEventRecord[]): Array<Record<string, unknown>> {
            const changes: Array<Record<string, unknown>> = [];

            events.slice().reverse().forEach((event) => {
                const key = runtimeEventKey(event);

                if (seen.has(key)) {
                    return;
                }

                seen.add(key);
                changes.push(...datasetChangesFromRuntimeEvent(event));
            });

            return changes;
        }
    };
};
