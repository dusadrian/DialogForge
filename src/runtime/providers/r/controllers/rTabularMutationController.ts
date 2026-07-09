import {
    createCellUpdateResult,
    createColumnInsertResult,
    createColumnRemoveResult,
    createColumnRenameResult,
    createRowInsertResult,
    createRowNameUpdateResult,
    createRowRemoveResult,
    createRowSortResult
} from "../../../tabular-data/tabularProtocol";
import type {
    CellUpdateRequest,
    CellUpdateResult,
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    RuntimeSessionSnapshot,
    RuntimeTabularController,
    TranscriptEvent
} from "../../../provider-contract/runtimeProvider";
import {
    createVisibleCellUpdateCommand,
    createVisibleColumnInsertCommand,
    createVisibleColumnRemoveCommand,
    createVisibleColumnRenameCommand,
    createVisibleRowInsertCommand,
    createVisibleRowNameUpdateCommand,
    createVisibleRowRemoveCommand,
    createVisibleRowSortCommand
} from "../commands/datasetVisibleCommands";
import { createRuntimeControlClient } from "../protocol/runtimeControlClient";
import { asRuntimeControlObject } from "../protocol/runtimeControlEvents";


type MutationTabularController = Pick<
    RuntimeTabularController,
    | "renameColumn"
    | "insertColumn"
    | "removeColumn"
    | "insertRow"
    | "removeRow"
    | "sortRows"
    | "updateRowName"
    | "writeCell"
>;


export interface RTabularMutationControllerOptions {
    getClient(): ReturnType<typeof createRuntimeControlClient> | null;
    createRequestId(prefix: string): string;
    executeVisibleCommand(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<TranscriptEvent[]>;
    transcriptHasFailure(transcriptEvents: TranscriptEvent[]): boolean;
}


export const createRTabularMutationController = function(
    options: RTabularMutationControllerOptions
): MutationTabularController {
    const executeMutation = async function(
        method: string,
        params: Record<string, unknown>
    ) {
        const client = options.getClient();

        if (!client) {
            return {
                ok: false,
                error: "R runtime-control session is not attached."
            };
        }

        return client.execute({
            id: options.createRequestId(method.replace(/\./g, "-")),
            method,
            params: {
                ...params,
                timeoutMs: 5000
            }
        });
    };

    const renameColumn = async function(
        request: ColumnRenameRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<ColumnRenameResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleColumnRenameCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.renameColumn",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createColumnRenameResult({
                status: failed ? "invalid-column" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                fromName: request.fromName,
                toName: request.toName,
                transcriptEvents,
                message: failed
                    ? "R visible column rename command failed."
                    : "R visible column rename command updated the column."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_update_column_name",
            {
                name: request.objectName,
                column: request.fromName,
                nextName: request.toName
            }
        );

        return createColumnRenameResult({
            status: result.ok ? "updated" : "invalid-column",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            fromName: request.fromName,
            toName: request.toName,
            message: result.ok
                ? "R runtime-control renamed the column."
                : String(result.error || "R column rename failed.")
        });
    };

    const insertColumn = async function(
        request: ColumnInsertRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<ColumnInsertResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleColumnInsertCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.insertColumn",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createColumnInsertResult({
                status: failed ? "invalid" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                columnName: request.newName,
                transcriptEvents,
                message: failed
                    ? "R visible column insert command failed."
                    : "R visible column insert command inserted the column."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_insert_column",
            {
                name: request.objectName,
                column: request.referenceName,
                nextName: request.newName,
                position: request.position
            }
        );
        const mutation = asRuntimeControlObject(
            "result" in result ? result.result : undefined
        );

        return createColumnInsertResult({
            status: result.ok ? "updated" : "invalid",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            columnName: String(mutation.nextName || request.newName),
            columnIndex: Number(mutation.columnIndex),
            columnCount: Number(mutation.columnCount),
            message: result.ok
                ? "R runtime-control inserted the column."
                : String(result.error || "R column insert failed.")
        });
    };

    const removeColumn = async function(
        request: ColumnRemoveRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<ColumnRemoveResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleColumnRemoveCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.removeColumn",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createColumnRemoveResult({
                status: failed ? "invalid-column" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                columnName: request.columnName,
                transcriptEvents,
                message: failed
                    ? "R visible column remove command failed."
                    : "R visible column remove command removed the column."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_remove_column",
            {
                name: request.objectName,
                column: request.columnName
            }
        );
        const mutation = asRuntimeControlObject(
            "result" in result ? result.result : undefined
        );

        return createColumnRemoveResult({
            status: result.ok ? "updated" : "invalid-column",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            columnName: request.columnName,
            columnCount: Number(mutation.columnCount),
            message: result.ok
                ? "R runtime-control removed the column."
                : String(result.error || "R column remove failed.")
        });
    };

    const insertRow = async function(
        request: RowInsertRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RowInsertResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleRowInsertCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.insertRow",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createRowInsertResult({
                status: failed ? "invalid-row" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                rowIndex: request.position === "after"
                    ? request.rowIndex + 1
                    : request.rowIndex,
                transcriptEvents,
                message: failed
                    ? "R visible row insert command failed."
                    : "R visible row insert command inserted the row."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_insert_row",
            {
                name: request.objectName,
                row: request.rowIndex + 1,
                nextName: request.name,
                position: request.position
            }
        );
        const mutation = asRuntimeControlObject(
            "result" in result ? result.result : undefined
        );

        return createRowInsertResult({
            status: result.ok ? "updated" : "invalid-row",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            rowIndex: Number.isFinite(Number(mutation.row))
                ? Number(mutation.row) - 1
                : (
                    request.position === "after"
                        ? request.rowIndex + 1
                        : request.rowIndex
                ),
            name: String(mutation.nextName || request.name),
            rowCount: Number(mutation.rowCount),
            message: result.ok
                ? "R runtime-control inserted the row."
                : String(result.error || "R row insert failed.")
        });
    };

    const removeRow = async function(
        request: RowRemoveRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RowRemoveResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleRowRemoveCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.removeRow",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createRowRemoveResult({
                status: failed ? "invalid-row" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                rowIndex: request.rowIndex,
                transcriptEvents,
                message: failed
                    ? "R visible row remove command failed."
                    : "R visible row remove command removed the row."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_remove_row",
            {
                name: request.objectName,
                row: request.rowIndex + 1
            }
        );
        const mutation = asRuntimeControlObject(
            "result" in result ? result.result : undefined
        );

        return createRowRemoveResult({
            status: result.ok ? "updated" : "invalid-row",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            rowIndex: request.rowIndex,
            rowCount: Number(mutation.rowCount),
            message: result.ok
                ? "R runtime-control removed the row."
                : String(result.error || "R row remove failed.")
        });
    };

    const sortRows = async function(
        request: RowSortRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RowSortResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleRowSortCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.sortRows",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createRowSortResult({
                status: failed ? "invalid-column" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                columnName: request.columnName,
                direction: request.direction,
                transcriptEvents,
                message: failed
                    ? "R visible row sort command failed."
                    : "R visible row sort command sorted the rows."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_sort_rows",
            {
                name: request.objectName,
                column: request.columnName,
                decreasing: request.direction === "descending",
                naLast: request.naLast === undefined
                    ? true
                    : request.naLast,
                emptyLast: request.emptyLast === undefined
                    ? true
                    : request.emptyLast
            }
        );
        const mutation = asRuntimeControlObject(
            "result" in result ? result.result : undefined
        );

        return createRowSortResult({
            status: result.ok ? "updated" : "invalid-column",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            columnName: request.columnName,
            direction: request.direction,
            rowCount: Number(mutation.rowCount),
            command: String(mutation.command || ""),
            message: result.ok
                ? "R runtime-control sorted the rows."
                : String(result.error || "R row sort failed.")
        });
    };

    const updateRowName = async function(
        request: RowNameUpdateRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RowNameUpdateResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleRowNameUpdateCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.updateRowName",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createRowNameUpdateResult({
                status: failed ? "invalid-row" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                rowIndex: request.rowIndex,
                name: request.name,
                transcriptEvents,
                message: failed
                    ? "R visible row-name update command failed."
                    : "R visible row-name update command updated the row name."
            });
        }

        const result = await executeMutation(
            "workspace.dataset_update_row_name",
            {
                name: request.objectName,
                row: request.rowIndex + 1,
                nextName: request.name
            }
        );

        return createRowNameUpdateResult({
            status: result.ok ? "updated" : "invalid-row",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            rowIndex: request.rowIndex,
            name: request.name,
            message: result.ok
                ? "R runtime-control updated the row name."
                : String(result.error || "R row-name update failed.")
        });
    };

    const writeCell = async function(
        request: CellUpdateRequest,
        snapshot: RuntimeSessionSnapshot
    ): Promise<CellUpdateResult> {
        if (request.uiCommandVisibility === "visible") {
            const commandText = String(
                request.visibleCommandText || ""
            ).trim() || createVisibleCellUpdateCommand(request);
            const transcriptEvents = await options.executeVisibleCommand(
                commandText,
                "ui.dataset.writeCell",
                snapshot
            );
            const failed = options.transcriptHasFailure(transcriptEvents);

            return createCellUpdateResult({
                status: failed ? "invalid-cell" : "updated",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                rowIndex: request.rowIndex,
                columnName: request.columnName,
                value: request.value,
                transcriptEvents,
                message: failed
                    ? "R visible cell update command failed."
                    : "R visible cell update command updated the cell."
            });
        }

        const client = options.getClient();

        if (!client) {
            return createCellUpdateResult({
                status: "unavailable",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                rowIndex: request.rowIndex,
                columnName: request.columnName,
                value: request.value,
                message: "R runtime-control session is not attached."
            });
        }

        const result = await client.execute({
            id: options.createRequestId("dataset-update-cell"),
            method: "workspace.dataset_update_cell",
            params: {
                name: request.objectName,
                row: request.rowIndex + 1,
                column: request.columnName,
                value: request.value,
                timeoutMs: 5000
            }
        });

        if (!result.ok) {
            return createCellUpdateResult({
                status: "invalid-cell",
                providerId: snapshot.providerId,
                objectName: request.objectName,
                rowIndex: request.rowIndex,
                columnName: request.columnName,
                value: request.value,
                message: String(result.error || "R cell update failed.")
            });
        }

        const runtimeCell = result.result
            && typeof result.result === "object"
            ? result.result as Record<string, unknown>
            : null;

        return createCellUpdateResult({
            status: "updated",
            providerId: snapshot.providerId,
            objectName: request.objectName,
            rowIndex: request.rowIndex,
            columnName: request.columnName,
            value: request.value,
            cell: runtimeCell
                ? {
                    display: String(runtimeCell.display || ""),
                    raw: String(runtimeCell.raw || ""),
                    declaredMissing: runtimeCell.declaredMissing === true
                }
                : undefined,
            message: "R runtime-control updated the cell."
        });
    };

    return {
        renameColumn,
        insertColumn,
        removeColumn,
        insertRow,
        removeRow,
        sortRows,
        updateRowName,
        writeCell
    };
};
