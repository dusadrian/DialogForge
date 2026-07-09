import type {
    DatasetVariableColumnKey
} from "../clipboard/editorClipboardState";
import type {
    DatasetCellClipboardTarget
} from "./datasetCellClipboardActions";


export interface ActiveVariableCell {
    rowIndex: number;
    key: DatasetVariableColumnKey;
}


export interface ActiveDataCell {
    row: number;
    column: string;
}


export interface ActiveCellClipboardControllerOptions {
    getActiveTab(): "data" | "variables";
    getActiveVariableCell(): ActiveVariableCell | null;
    getActiveDataCell(): ActiveDataCell | null;
    isVariableRange(target: Extract<
        DatasetCellClipboardTarget,
        { kind: "variable" }
    >): boolean;
    setTarget(target: DatasetCellClipboardTarget): void;
    copyTarget(): Promise<void>;
    pasteTarget(): Promise<void>;
}


export interface ActiveCellClipboardController {
    copy(): Promise<boolean>;
    paste(): Promise<boolean>;
}


export const createActiveCellClipboardController = function(
    options: ActiveCellClipboardControllerOptions
): ActiveCellClipboardController {
    const variableTarget = function(): Extract<
        DatasetCellClipboardTarget,
        { kind: "variable" }
    > | null {
        const cell = options.getActiveVariableCell();

        if (options.getActiveTab() !== "variables" || !cell) {
            return null;
        }

        return {
            kind: "variable",
            rowIndex: cell.rowIndex,
            key: cell.key
        };
    };

    const dataTarget = function(): Extract<
        DatasetCellClipboardTarget,
        { kind: "data" }
    > | null {
        const cell = options.getActiveDataCell();

        if (options.getActiveTab() !== "data" || !cell) {
            return null;
        }

        return {
            kind: "data",
            row: cell.row,
            column: cell.column
        };
    };

    return {
        copy: async () => {
            const variable = variableTarget();

            if (variable) {
                if (options.isVariableRange(variable)) {
                    return false;
                }

                options.setTarget(variable);
                await options.copyTarget();
                return true;
            }

            const data = dataTarget();

            if (!data) {
                return false;
            }

            options.setTarget(data);
            await options.copyTarget();
            return true;
        },
        paste: async () => {
            const target = variableTarget() || dataTarget();

            if (!target) {
                return false;
            }

            options.setTarget(target);
            await options.pasteTarget();
            return true;
        }
    };
};
