import type {
    DatasetCellClipboardTarget
} from "./datasetCellClipboardActions";
import type {
    DatasetEditorContextMenuView
} from "./datasetEditorContextMenuView";

type DataTarget = Extract<
    DatasetCellClipboardTarget,
    { kind: "data" }
>;
type VariableTarget = Extract<
    DatasetCellClipboardTarget,
    { kind: "variable" }
>;

export interface DatasetCellContextMenuControllerOptions {
    contextMenus: DatasetEditorContextMenuView<DatasetCellClipboardTarget>;
    isVariableRange: (target: VariableTarget) => boolean;
}

export interface DatasetCellContextMenuController {
    showTarget: (
        target: DatasetCellClipboardTarget | null,
        clientX: number,
        clientY: number
    ) => void;
    showDataCell: (
        cell: { row: number; column: string },
        clientX: number,
        clientY: number
    ) => void;
    showVariableCell: (
        rowIndex: number,
        key: VariableTarget["key"],
        selectionRows: number[] | undefined,
        clientX: number,
        clientY: number
    ) => void;
}

export const createDatasetCellContextMenuController = function(
    options: DatasetCellContextMenuControllerOptions
): DatasetCellContextMenuController {
    const showTarget = function(
        target: DatasetCellClipboardTarget | null,
        clientX: number,
        clientY: number
    ): void {
        if (!target) {
            return;
        }

        options.contextMenus.showCell(
            target,
            clientX,
            clientY,
            target.kind === "variable"
                && options.isVariableRange(target)
        );
    };

    const showDataCell = function(
        cell: { row: number; column: string },
        clientX: number,
        clientY: number
    ): void {
        showTarget(
            {
                kind: "data",
                row: cell.row,
                column: cell.column
            } as DataTarget,
            clientX,
            clientY
        );
    };

    const showVariableCell = function(
        rowIndex: number,
        key: VariableTarget["key"],
        selectionRows: number[] | undefined,
        clientX: number,
        clientY: number
    ): void {
        showTarget(
            {
                kind: "variable",
                rowIndex,
                key,
                selectionRows
            },
            clientX,
            clientY
        );
    };

    return {
        showTarget,
        showDataCell,
        showVariableCell
    };
};
