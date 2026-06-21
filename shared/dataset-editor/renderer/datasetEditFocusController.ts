import type {
    DataGridInteractionState
} from "../state/dataGridInteractionState";

export interface DatasetEditFocusControllerOptions {
    window: Window;
    getDataHost: () => HTMLElement | null;
    dataGridState: DataGridInteractionState;
    hideHeaderMenu: () => void;
    hideRowMenu: () => void;
    renderData: () => void;
}

export interface DatasetEditFocusController {
    beginColumnHeaderEdit: (column: string) => void;
    beginRowNameEdit: (row: number) => void;
}

export const createDatasetEditFocusController = function(
    options: DatasetEditFocusControllerOptions
): DatasetEditFocusController {
    const focusColumnHeaderEditor = function(): void {
        options.window.requestAnimationFrame(function(): void {
            const input = options.getDataHost()
                ?.querySelector<HTMLInputElement>(
                    '[data-header-editor="true"]'
                );

            if (!input) {
                return;
            }

            input.focus();
            input.select();
        });
    };

    const focusRowNameEditor = function(host: HTMLElement): void {
        options.window.requestAnimationFrame(function(): void {
            const input = host.querySelector<HTMLInputElement>(
                '[data-rowname-editor="true"]'
            );

            if (!input) {
                return;
            }

            input.focus();

            const length = String(input.value || "").length;

            try {
                input.setSelectionRange(length, length);
            }
            catch {}
        });
    };

    const beginColumnHeaderEdit = function(column: string): void {
        options.dataGridState.beginColumnEdit(column);
        options.hideHeaderMenu();
        options.renderData();
        focusColumnHeaderEditor();
    };

    const beginRowNameEdit = function(row: number): void {
        const rowNumber = Number(row);

        if (!Number.isFinite(rowNumber) || rowNumber < 1) {
            return;
        }

        const host = options.getDataHost();

        if (!host) {
            return;
        }

        options.dataGridState.beginRowNameEdit(rowNumber);
        options.hideRowMenu();
        options.renderData();
        focusRowNameEditor(host);
    };

    return {
        beginColumnHeaderEdit,
        beginRowNameEdit
    };
};
