import type {
    DatasetViewerCell
} from "../../base-app/modules/datasetViewer.types";
import { bindInlineEdit } from "./inlineEditBindings";


export interface DataGridEditBindingsOptions {
    host: HTMLElement;
    getDatasetName(): string;
    clearColumnEdit(): void;
    clearRowNameEdit(): void;
    clearCellEdit(): void;
    renameColumn(
        datasetName: string,
        previousName: string,
        nextName: string
    ): Promise<unknown | null>;
    applyLocalColumnRename(
        previousName: string,
        nextName: string
    ): void;
    getLoadedRowStart(): number;
    getLoadedRowName(index: number): string;
    renameRow(
        datasetName: string,
        rowNumber: number,
        nextName: string
    ): Promise<unknown | null>;
    replaceLoadedRowName(index: number, nextName: string): void;
    updateCell(
        datasetName: string,
        rowNumber: number,
        columnName: string,
        value: string
    ): Promise<DatasetViewerCell | null>;
    replaceLoadedCell(
        rowNumber: number,
        columnName: string,
        cell: DatasetViewerCell
    ): void;
    render(): void;
    showNotice(message: string): void;
    translate(key: string): string;
}


export const bindDataGridEditActions = function(
    options: DataGridEditBindingsOptions
): void {
    options.host.querySelectorAll<HTMLInputElement>(
        '[data-header-editor="true"]'
    ).forEach((input) => {
        bindInlineEdit(input, {
            commit: async () => {
                const previousName = String(
                    input.getAttribute("data-data-column") || ""
                );
                const nextName = String(input.value || "").trim();

                options.clearColumnEdit();

                if (
                    !previousName
                    || !nextName
                    || nextName === previousName
                ) {
                    options.render();
                    return;
                }

                const updated = await options.renameColumn(
                    options.getDatasetName(),
                    previousName,
                    nextName
                );

                if (!updated) {
                    options.showNotice(
                        options.translate("Column rename failed")
                    );
                    options.render();
                    return;
                }

                options.applyLocalColumnRename(
                    previousName,
                    nextName
                );
                options.render();
            },
            cancel: () => {
                options.clearColumnEdit();
                options.render();
            }
        });
    });

    options.host.querySelectorAll<HTMLInputElement>(
        '[data-rowname-editor="true"]'
    ).forEach((input) => {
        bindInlineEdit(input, {
            commit: async () => {
                const rowNumber = Number(
                    input.getAttribute("data-data-row") || 0
                );
                const nextName = String(input.value || "").trim();

                options.clearRowNameEdit();

                if (!rowNumber || !nextName) {
                    options.render();
                    return;
                }

                const loadedIndex =
                    rowNumber - options.getLoadedRowStart();
                const currentName = options.getLoadedRowName(
                    loadedIndex
                );

                if (nextName === currentName) {
                    options.render();
                    return;
                }

                const updated = await options.renameRow(
                    options.getDatasetName(),
                    rowNumber,
                    nextName
                );

                if (!updated) {
                    options.showNotice(
                        options.translate("Row name update failed")
                    );
                    options.render();
                    return;
                }

                options.replaceLoadedRowName(
                    loadedIndex,
                    nextName
                );
                options.render();
            },
            cancel: () => {
                options.clearRowNameEdit();
                options.render();
            }
        });
    });

    options.host.querySelectorAll<HTMLInputElement>(
        '[data-data-editor="true"]'
    ).forEach((input) => {
        bindInlineEdit(input, {
            commit: async () => {
                const rowNumber = Number(
                    input.getAttribute("data-data-row") || 0
                );
                const columnName = String(
                    input.getAttribute("data-data-column") || ""
                );

                options.clearCellEdit();

                if (!rowNumber || !columnName) {
                    options.render();
                    return;
                }

                const updated = await options.updateCell(
                    options.getDatasetName(),
                    rowNumber,
                    columnName,
                    String(input.value || "")
                );

                if (!updated) {
                    options.showNotice(
                        options.translate("Cell update failed")
                    );
                    options.render();
                    return;
                }

                options.replaceLoadedCell(
                    rowNumber,
                    columnName,
                    updated
                );
                options.render();
            },
            cancel: () => {
                options.clearCellEdit();
                options.render();
            }
        });
    });
};
