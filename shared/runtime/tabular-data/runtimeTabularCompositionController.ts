import type {
    RuntimeCapability,
    RuntimeReadOnlyAdapter,
    TabularColumnSnapshot,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createColumn
} from "./tabularProtocol";
import {
    createWorkspaceObject
} from "../workspace/workspaceProtocol";
import type {
    RuntimeFallbackTabularRow,
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";


export interface RuntimeTabularCompositionControllerOptions {
    providerId(): string;
    readOnlyAdapter?: RuntimeReadOnlyAdapter;
    fallbackState: RuntimeFallbackTabularState;
    hasCapability(capability: RuntimeCapability): boolean;
}


export interface RuntimeTabularCompositionController {
    createColumns(rows: RuntimeFallbackTabularRow[]): TabularColumnSnapshot[];
    listProviderObjects(): WorkspaceObjectSnapshot[];
    listImportedTables(): WorkspaceObjectSnapshot[];
    listObjects(): WorkspaceObjectSnapshot[];
    readProviderRows(objectName: string): RuntimeFallbackTabularRow[];
    materializeRows(objectName: string): boolean;
    hasObject(objectName: string): boolean;
}


const cloneRows = function(
    rows: RuntimeFallbackTabularRow[]
): RuntimeFallbackTabularRow[] {
    return rows.map((row) => {
        return Object.assign({}, row);
    });
};


export const createRuntimeTabularCompositionController = function(
    options: RuntimeTabularCompositionControllerOptions
): RuntimeTabularCompositionController {
    const state = options.fallbackState;

    const createColumns = function(
        rows: RuntimeFallbackTabularRow[]
    ): TabularColumnSnapshot[] {
        const first = rows[0] || {};

        return Object.keys(first).map((name) => {
            return createColumn({
                name,
                type: typeof first[name] === "number" ? "numeric" : "character"
            });
        });
    };

    const listProviderObjects = function(): WorkspaceObjectSnapshot[] {
        if (!options.readOnlyAdapter) {
            return [];
        }

        return options.readOnlyAdapter
            .listWorkspaceObjects(options.providerId())
            .filter((object) => {
                return !state.provenance[object.name];
            });
    };

    const providerObjectNames = function(): Set<string> {
        if (!options.readOnlyAdapter) {
            return new Set();
        }

        return new Set(
            options.readOnlyAdapter
                .listWorkspaceObjects(options.providerId())
                .map((object) => {
                    return object.name;
                })
        );
    };

    const createImportedTable = function(name: string): WorkspaceObjectSnapshot {
        const capabilities: RuntimeCapability[] = [
            "tabular.schema",
            "tabular.read",
            "tabular.writeCells"
        ];

        if (options.hasCapability("tabular.writeColumns")) {
            capabilities.push("tabular.writeColumns");
        }
        if (options.hasCapability("tabular.writeRows")) {
            capabilities.push("tabular.writeRows");
        }
        if (options.hasCapability("tabular.columnNames")) {
            capabilities.push("tabular.columnNames");
        }
        if (options.hasCapability("tabular.rowNames")) {
            capabilities.push("tabular.rowNames");
        }
        if (options.hasCapability("tabular.variableMetadata")) {
            capabilities.push("tabular.variableMetadata");
        }
        if (state.provenance[name]) {
            capabilities.push("workspace.remove");
        }
        if (options.hasCapability("workspace.rename")) {
            capabilities.push("workspace.rename");
        }

        return createWorkspaceObject({
            name,
            kind: "table",
            detail: "Placeholder imported table",
            provenance: state.provenance[name] || null,
            capabilities
        });
    };

    const listImportedTables = function(): WorkspaceObjectSnapshot[] {
        const providerNames = providerObjectNames();

        return Object.keys(state.rows)
            .filter((name) => {
                return !providerNames.has(name) || Boolean(state.provenance[name]);
            })
            .map(createImportedTable);
    };

    const readProviderRows = function(
        objectName: string
    ): RuntimeFallbackTabularRow[] {
        if (!options.readOnlyAdapter) {
            return [];
        }

        const preview = options.readOnlyAdapter.readTabularPreview(
            options.providerId(),
            objectName
        );

        return preview && preview.status === "ready"
            ? cloneRows(preview.rows)
            : [];
    };

    return {
        createColumns,
        listProviderObjects,
        listImportedTables,
        listObjects: function(): WorkspaceObjectSnapshot[] {
            return listProviderObjects().concat(listImportedTables());
        },
        readProviderRows,
        materializeRows: function(objectName): boolean {
            if (state.rows[objectName]) {
                return true;
            }

            const rows = readProviderRows(objectName);

            if (rows.length === 0) {
                return false;
            }

            state.rows[objectName] = rows;
            return true;
        },
        hasObject: function(objectName): boolean {
            return state.has(objectName) || providerObjectNames().has(objectName);
        }
    };
};
