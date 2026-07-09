import type {
    DataColumnClipboardPayload
} from "../clipboard/editorClipboardState";
import type {
    DatasetEditorContextMenuView
} from "./datasetEditorContextMenuView";

export interface DatasetHeaderContextSchema {
    rowCount?: number | string;
    columns?: Array<{
        name?: unknown;
    }>;
}

export interface DatasetHeaderContextMenuControllerOptions<TCellTarget> {
    document: Document;
    contextMenus: DatasetEditorContextMenuView<TCellTarget>;
    getDatasetName: () => string;
    getSchema: () => DatasetHeaderContextSchema | null;
    readClipboardText: () => Promise<string>;
    readColumnPayload: (
        text: string
    ) => DataColumnClipboardPayload | null;
}

export interface DatasetHeaderContextMenuController {
    hide: () => void;
    show: (
        column: string,
        clientX: number,
        clientY: number
    ) => void;
    updatePasteState: () => Promise<void>;
}

export const createDatasetHeaderContextMenuController = function<
    TCellTarget
>(
    options: DatasetHeaderContextMenuControllerOptions<TCellTarget>
): DatasetHeaderContextMenuController {
    const pasteButton = function(): HTMLButtonElement | null {
        return options.document
            .getElementById("datasetEditorHeaderMenu")
            ?.querySelector<HTMLButtonElement>(
                '[data-header-menu-action="paste"]'
            ) || null;
    };

    const canPasteColumn = function(
        payload: DataColumnClipboardPayload | null
    ): boolean {
        const schema = options.getSchema();
        const datasetName = options.getDatasetName();
        const rowCount = Math.max(
            0,
            Number(schema?.rowCount || 0)
        );
        const schemaColumns = Array.isArray(schema?.columns)
            ? schema.columns
            : [];
        const hasSourceColumn = !!payload && schemaColumns.some(
            (entry) => String(entry?.name || "") === payload.columnName
        );

        return !!payload
            && payload.datasetName === datasetName
            && payload.rowCount === rowCount
            && hasSourceColumn;
    };

    const updatePasteState = async function(): Promise<void> {
        const button = pasteButton();

        if (!button) {
            return;
        }

        button.disabled = true;

        const text = await options.readClipboardText();
        const payload = options.readColumnPayload(text);
        button.disabled = !canPasteColumn(payload);
    };

    const show = function(
        column: string,
        clientX: number,
        clientY: number
    ): void {
        if (options.contextMenus.showHeader(column, clientX, clientY)) {
            void updatePasteState();
        }
    };

    return {
        hide: options.contextMenus.hideHeader,
        show,
        updatePasteState
    };
};
