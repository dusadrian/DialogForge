import {
    createColumn,
    createTabularPreview,
    createTabularSchema
} from "../../../tabular-data/tabularProtocol";
import {
    createObjectInspectionResult,
    createWorkspaceObject
} from "../../../workspace/workspaceProtocol";
import {
    normalizeWorkspaceUpdateObject,
    workspaceUpdateHasChanges
} from "../../../workspace/workspaceUpdate";
import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceListOptions,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    VisibleCommandRequest,
    WorkspaceUpdate,
    WorkspaceObjectSnapshot
} from "../../../provider-contract/runtimeProvider";
import {
    createRWorkspaceUpdate
} from "./rWorkspaceUpdate";
import {
    rWorkspaceObjectCapabilities
} from "../rRuntimeCapabilities";
import {
    asRuntimeControlArray,
    asRuntimeControlObject,
    parseRuntimeControlResultObject
} from "../protocol/runtimeControlEvents";
import type {
    RRuntimeControlClient
} from "../protocol/runtimeControlClient";
import { coerceRuntimeCellValue } from "../tabular/runtimeTabularValues";
import {
    rCodeMayMutateWorkspace
} from "../commands/rCommandIntents";


export interface RWorkspaceControllerOptions {
    getClient(): RRuntimeControlClient | null;
    createRequestId(prefix: string): string;
    onVisibleWorkspaceRefresh?(): void;
}


export const createRWorkspaceController = function(
    options: RWorkspaceControllerOptions
): RuntimeWorkspaceController {
    const completeVisibleCommand = async function(
        request: VisibleCommandRequest
    ): Promise<WorkspaceUpdate | null> {
        if (!rCodeMayMutateWorkspace(request.text)) {
            return null;
        }

        options.onVisibleWorkspaceRefresh?.();

        const client = options.getClient();

        if (!client) {
            return null;
        }

        const result = await client.execute({
            id: options.createRequestId("workspace-command-complete"),
            method: "workspace.complete_visible_command",
            params: {
                code: request.text,
                timeoutMs: 10000
            }
        });

        if (!result.ok) {
            return null;
        }

        const update = createRWorkspaceUpdate(result.result);

        return workspaceUpdateHasChanges(update) ? update : null;
    };

    const readWorkspaceObjects = async function(
        listOptions?: WorkspaceListOptions
    ): Promise<WorkspaceObjectSnapshot[]> {
        const client = options.getClient();

        if (!client) {
            return [];
        }

        if (
            listOptions?.detectChanges === true
            && listOptions.forceRefresh !== true
        ) {
            await client.execute({
                id: options.createRequestId("workspace-update"),
                method: "workspace.update",
                params: {
                    timeoutMs: 10000
                }
            });
        }

        const result = await client.execute({
            id: options.createRequestId("workspace"),
            method: "workspace.snapshot",
            params: {
                forceRefresh: listOptions?.forceRefresh === true,
                timeoutMs: 5000
            }
        });

        if (!result.ok) {
            return [];
        }

        const payload = parseRuntimeControlResultObject(result.result);
        const dataframes = asRuntimeControlObject(payload.dataframe);

        return asRuntimeControlArray(payload.variables).map((entry) => {
            const variable = asRuntimeControlObject(entry);
            const name = String(
                variable.access_key
                || variable.display_name
                || ""
            );
            const object = normalizeWorkspaceUpdateObject({
                ...variable,
                dataframe: variable.dataframe
                    || dataframes[name]
                    || null
            });

            if (!object) {
                return null;
            }

            return createWorkspaceObject({
                ...object,
                capabilities: rWorkspaceObjectCapabilities(
                    object.hasViewer || object.kind === "table"
                )
            });
        }).filter(
            (object): object is WorkspaceObjectSnapshot => Boolean(object)
        );
    };

    const readTabularSchema = async function(
        objectName: string,
        snapshot: RuntimeSessionSnapshot
    ) {
        const client = options.getClient();

        if (!client) {
            return null;
        }

        const result = await client.execute({
            id: options.createRequestId("dataset-schema"),
            method: "workspace.dataset_schema",
            params: {
                name: objectName,
                timeoutMs: 5000
            }
        });

        if (!result.ok) {
            return null;
        }

        const payload = parseRuntimeControlResultObject(result.result);
        const columns = asRuntimeControlArray(payload.columns).map((entry) => {
            const column = asRuntimeControlObject(entry);

            return createColumn({
                name: String(column.name || ""),
                type: String(column.type || "unknown"),
                numeric: column.numeric === true,
                character: column.character === true,
                logical: column.logical === true,
                factor: column.factor === true,
                calibrated: column.calibrated === true,
                binary: column.binary === true,
                categorical: column.categorical === true,
                date: column.date === true
            });
        }).filter((column) => {
            return column.name.length > 0;
        });

        return createTabularSchema({
            status: "ready",
            providerId: snapshot.providerId,
            objectName,
            columns,
            rowCount: Number(payload.rowCount || 0),
            columnCount: Number(payload.columnCount || columns.length),
            message: "R runtime-control returned tabular schema."
        });
    };

    const readTabularPreview = async function(
        objectName: string,
        snapshot: RuntimeSessionSnapshot,
        request?: Partial<TabularPreviewRequest>
    ): Promise<TabularPreviewSnapshot | null> {
        const client = options.getClient();

        if (!client) {
            return null;
        }

        const requestedColumns = Array.isArray(request?.columns)
            ? request.columns.map((column) => {
                return String(column || "").trim();
            }).filter((column) => {
                return column.length > 0;
            })
            : [];
        const rowStart = Number.isFinite(Number(request?.rowStart))
            ? Math.max(1, Math.floor(Number(request?.rowStart)))
            : 1;
        const rowCount = Number.isFinite(Number(request?.rowCount))
            ? Math.max(1, Math.floor(Number(request?.rowCount)))
            : 50;
        const columnCount = Number.isFinite(Number(request?.columnCount))
            ? Math.max(1, Math.floor(Number(request?.columnCount)))
            : undefined;
        const result = await client.execute({
            id: options.createRequestId("dataset-content"),
            method: "workspace.dataset_content",
            params: {
                name: objectName,
                rowStart,
                rowCount,
                columns: requestedColumns,
                columnCount,
                timeoutMs: 5000
            }
        });

        if (!result.ok) {
            return null;
        }

        const payload = parseRuntimeControlResultObject(result.result);
        const columns = asRuntimeControlArray(payload.columns).map((entry) => {
            const column = asRuntimeControlObject(entry);

            return createColumn({
                name: String(column.name || ""),
                type: String(column.type || "unknown")
            });
        }).filter((column) => {
            return column.name.length > 0;
        });
        const rows = asRuntimeControlArray(payload.rows).map((row) => {
            const values = asRuntimeControlArray(row);
            const output: Record<string, unknown> = {};

            columns.forEach((column, index) => {
                const cell = asRuntimeControlObject(values[index]);
                const display = String(cell.display ?? "");

                output[column.name] = {
                    display,
                    raw: coerceRuntimeCellValue(
                        cell.raw ?? display,
                        column.type
                    ),
                    declaredMissing: cell.declaredMissing === true
                };
            });

            return output;
        });
        const rowNames = asRuntimeControlArray(payload.rowNames).map((entry) => {
            return String(entry || "");
        });
        const payloadRowStart = Number(payload.rowStart);
        const payloadTotalRows = Number(payload.totalRowCount);
        const payloadTotalColumns = Number(payload.totalColumnCount);
        const totalColumnCount = (
            Number.isFinite(payloadTotalColumns)
            && payloadTotalColumns >= columns.length
        )
            ? payloadTotalColumns
            : columns.length;

        return createTabularPreview({
            status: "ready",
            providerId: snapshot.providerId,
            objectName,
            columns,
            rows,
            rowNames,
            rowOffset: (
                Number.isFinite(payloadRowStart)
                && payloadRowStart > 0
            )
                ? payloadRowStart - 1
                : rowStart - 1,
            columnOffset: 0,
            totalRowCount: Number.isFinite(payloadTotalRows)
                ? payloadTotalRows
                : rows.length,
            totalColumnCount,
            message: "R runtime-control returned tabular preview."
        });
    };

    return {
        listWorkspaceObjects: async function(_snapshot, listOptions) {
            return readWorkspaceObjects(listOptions);
        },
        readTabularSchema,
        readTabularPreview,
        inspectObject: async function(
            objectName: string,
            snapshot: RuntimeSessionSnapshot
        ) {
            const client = options.getClient();

            if (!client) {
                return null;
            }

            const result = await client.execute({
                id: options.createRequestId("workspace-inspect"),
                method: "workspace.inspect",
                params: {
                    name: objectName,
                    timeoutMs: 5000
                }
            });

            if (!result.ok) {
                return createObjectInspectionResult({
                    status: "not-found",
                    providerId: snapshot.providerId,
                    objectName,
                    message: String(
                        result.error
                        || "Workspace object was not found."
                    )
                });
            }

            const payload = parseRuntimeControlResultObject(result.result);
            const kind = String(payload.kind || "object");
            const hasViewer = payload.hasViewer === true;
            const summary = [
                {
                    name: "class",
                    value: asRuntimeControlArray(payload.class).join("/")
                },
                { name: "type", value: String(payload.type || "") },
                { name: "length", value: String(payload.length || "") },
                { name: "size", value: String(payload.size || "") },
                {
                    name: "dim",
                    value: asRuntimeControlArray(payload.dim).join(" x ")
                },
                {
                    name: "names",
                    value: asRuntimeControlArray(payload.names).join(", ")
                },
                { name: "preview", value: String(payload.preview || "") }
            ].filter((entry) => {
                return entry.value.length > 0;
            });

            return createObjectInspectionResult({
                status: "ready",
                providerId: snapshot.providerId,
                objectName: String(payload.name || objectName),
                kind,
                detail: String(payload.preview || payload.type || kind),
                capabilities: rWorkspaceObjectCapabilities(
                    hasViewer || kind === "table"
                ),
                summary,
                message: "R runtime-control returned object inspection."
            });
        },
        removeWorkspaceObjects: async function(objectNames: string[]) {
            const client = options.getClient();

            if (!client) {
                return [];
            }

            await client.execute({
                id: options.createRequestId("workspace-remove"),
                method: "workspace.remove",
                params: {
                    names: objectNames,
                    timeoutMs: 5000
                }
            });

            return readWorkspaceObjects();
        },
        renameWorkspaceObject: async function(request) {
            const client = options.getClient();

            if (!client) {
                return [];
            }

            const result = await client.execute({
                id: options.createRequestId("workspace-rename"),
                method: "workspace.rename",
                params: {
                    oldName: request.oldName,
                    newName: request.newName,
                    timeoutMs: 5000
                }
            });

            if (!result.ok) {
                throw new Error(
                    String(result.error || "workspace-rename-failed")
                );
            }

            return readWorkspaceObjects();
        },
        clearWorkspace: async function() {
            const client = options.getClient();

            if (!client) {
                return [];
            }

            await client.execute({
                id: options.createRequestId("workspace-clear"),
                method: "workspace.clear",
                params: {
                    timeoutMs: 5000
                }
            });

            return readWorkspaceObjects();
        },
        completeVisibleCommand,
        commitWorkspaceMutation: async function() {
            const client = options.getClient();

            if (!client) {
                return null;
            }

            const result = await client.execute({
                id: options.createRequestId("workspace-mutation-update"),
                method: "workspace.update",
                params: {
                    timeoutMs: 5000
                }
            });

            return result.ok
                ? createRWorkspaceUpdate(result.result)
                : null;
        }
    };
};
