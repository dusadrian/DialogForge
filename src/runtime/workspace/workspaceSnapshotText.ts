import type {
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeWorkspaceColumnTextSnapshot {
    name: string;
    [key: string]: unknown;
}

export interface RuntimeWorkspaceObjectTextSnapshot {
    name: string;
    kind: string;
    rows: number;
    columns: string[];
    columnEntries: RuntimeWorkspaceColumnTextSnapshot[];
    [key: string]: unknown;
}

export type RuntimeWorkspaceTextSnapshot = Record<
    string,
    RuntimeWorkspaceObjectTextSnapshot
>;


export type RuntimeWorkspaceTextObjectSnapshot =
    WorkspaceObjectSnapshot &
    RuntimeWorkspaceObjectTextSnapshot;


export type RuntimeWorkspaceSnapshotWithTextObjects =
    Omit<WorkspaceSnapshot, "objects"> & {
        objects: RuntimeWorkspaceTextObjectSnapshot[];
    };


export const readWorkspaceObjectTextDetail = function(
    object: Partial<RuntimeWorkspaceObjectTextSnapshot>
): string {
    const columns = Array.isArray(object.columns) ? object.columns.length : 0;

    if (
        object.kind === "data.frame"
        || object.kind === "matrix"
        || object.kind === "array"
    ) {
        return `${Number(object.rows || 0) || 0} x ${columns}`;
    }

    if (object.rows) {
        return String(object.rows);
    }

    return "";
};


const readColumnFlags = function(value: unknown): Record<string, true> {
    const flags: Record<string, true> = {};

    for (const flag of String(value || "").split("/")) {
        const key = flag.trim();

        if (key) {
            flags[key] = true;
        }
    }

    return flags;
};


export const parseWorkspaceTextSnapshot = function(
    text: unknown
): RuntimeWorkspaceTextSnapshot {
    const entries: RuntimeWorkspaceTextSnapshot = {};

    for (const line of String(text || "").split("\n")) {
        const parts = line.split("\t");
        const name = String(parts[0] || "").trim();

        if (!name) {
            continue;
        }

        const columns = String(parts[3] || "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
        const columnFlags = String(parts[4] || "")
            .split(",")
            .map(readColumnFlags);

        entries[name] = {
            name,
            kind: String(parts[1] || "object").trim() || "object",
            rows: Number(parts[2] || 0) || 0,
            columns,
            columnEntries: columns.map((columnName, index) => ({
                name: columnName,
                ...(columnFlags[index] || {})
            }))
        };
    }

    return entries;
};


export const parseFastWorkspaceTextSnapshot = function(
    text: unknown,
    existingEntries: RuntimeWorkspaceTextSnapshot = {}
): RuntimeWorkspaceTextSnapshot {
    const entries: RuntimeWorkspaceTextSnapshot = {};

    for (const line of String(text || "").split("\n")) {
        const parts = line.split("\t");
        const name = String(parts[0] || "").trim();

        if (!name) {
            continue;
        }

        const kind = String(parts[1] || "object").trim() || "object";
        const rows = Number(parts[2] || 0) || 0;
        const columnCount = Number(parts[3] || 0) || 0;
        const existing = existingEntries[name];
        const existingColumns = Array.isArray(existing?.columns)
            ? existing.columns
            : [];
        const columns = columnCount > 0
            ? Array.from({ length: columnCount }, (_value, index) => {
                return existingColumns[index] || `V${index + 1}`;
            })
            : [];

        entries[name] = {
            ...(existing || {}),
            name,
            kind,
            rows,
            columns,
            columnEntries:
                Array.isArray(existing?.columnEntries)
                && existing.columnEntries.length === columnCount
                    ? existing.columnEntries
                    : columns.map((columnName) => ({ name: columnName }))
        };
    }

    return entries;
};


export const workspaceTextEntriesFromSnapshot = function(
    snapshot: Partial<WorkspaceSnapshot> | null | undefined
): RuntimeWorkspaceTextSnapshot {
    const entries: RuntimeWorkspaceTextSnapshot = {};
    const objects = Array.isArray(snapshot?.objects) ? snapshot.objects : [];

    for (const object of objects) {
        const record = object as unknown as Partial<RuntimeWorkspaceObjectTextSnapshot>;
        const name = String(record.name || "").trim();

        if (!name) {
            continue;
        }

        entries[name] = {
            name,
            kind: String(record.kind || "object").trim() || "object",
            rows: Number(record.rows || 0) || 0,
            columns: Array.isArray(record.columns) ? record.columns : [],
            columnEntries: Array.isArray(record.columnEntries)
                ? record.columnEntries
                : []
        };
    }

    return entries;
};


export const createWorkspaceSnapshotFromTextEntries = function(
    entries: RuntimeWorkspaceTextSnapshot,
    options: {
        providerId?: string;
        status?: string;
        message?: string;
        refreshedAt?: string;
    } = {}
): RuntimeWorkspaceSnapshotWithTextObjects {
    const refreshedAt = String(options.refreshedAt || "").trim()
        || new Date().toISOString();

    return {
        status: String(options.status || "ready"),
        providerId: String(options.providerId || ""),
        objects: Object.values(entries || {}).map(function(entry): RuntimeWorkspaceTextObjectSnapshot {
            return {
                ...entry,
                name: String(entry.name || "").trim(),
                kind: String(entry.kind || "object").trim() || "object",
                detail: readWorkspaceObjectTextDetail(entry),
                rows: Number(entry.rows || 0) || 0,
                columns: Array.isArray(entry.columns) ? entry.columns : [],
                columnEntries: Array.isArray(entry.columnEntries)
                    ? entry.columnEntries
                    : [],
                hasViewer: entry.kind === "data.frame",
                provenance: {
                    source: refreshedAt,
                    format: "webr-workspace-text"
                },
                capabilities: entry.kind === "data.frame"
                    ? ["tabular.schema", "tabular.read"]
                    : []
            };
        }).sort(function(left, right): number {
            return left.name.localeCompare(right.name);
        }),
        message: String(options.message || ""),
        refreshedAt
    };
};
