import type { DatasetEditorContextAction } from "../../../dataset-editor/context-menus/contextMenuActions";
import type { DatasetEditorSelection, DatasetEditorState } from "../../../dataset-editor/state/datasetEditorState";
import {
    createActionDiagnostics,
    createSelectionDiagnosticFields
} from "../../../dataset-editor/view/selectionDiagnostics";
import {
    isDataPreviewCellSelected,
    isDataPreviewColumnSelected,
    isDataPreviewRowSelected,
    isVariableMetadataCellSelected,
    isVariableMetadataRowSelected
} from "../../../dataset-editor/view/selectionHighlights";


interface DatasetSelectionHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
}


const renderDatasetEditorSelection = function(
    documentRef: Document,
    status: HTMLElement,
    actionsHost: HTMLElement,
    state: DatasetEditorState,
    actions: DatasetEditorContextAction[],
    executeCommand: (command: string) => void,
    helpers: DatasetSelectionHelpers
): void {
    helpers.empty(status);
    helpers.empty(actionsHost);

    createSelectionDiagnosticFields(state).forEach((field) => {
        helpers.appendField(status, field.name, field.value);
    });

    createActionDiagnostics(actions).forEach((contextAction) => {
        const row = documentRef.createElement("div");
        const button = documentRef.createElement("button");
        const command = documentRef.createElement("span");

        row.className = "commandField";
        button.className = "commandButton";
        button.type = "button";
        button.textContent = contextAction.label;
        button.addEventListener("click", () => {
            executeCommand(contextAction.command);
        });
        command.className = "commandValue";
        command.textContent = contextAction.command;
        row.appendChild(button);
        row.appendChild(command);
        actionsHost.appendChild(row);
    });
};


const refreshDatasetSelectionHighlights = function(documentRef: Document, selection: DatasetEditorSelection): void {
    documentRef.querySelectorAll(".isDatasetSelection").forEach((element) => {
        element.classList.remove("isDatasetSelection");
    });

    if (selection.kind === "data-cell") {
        documentRef.querySelectorAll<HTMLElement>("[data-preview-cell-row][data-preview-cell-column]").forEach((cell) => {
            const rowIndex = Number(cell.dataset.previewCellRow || -1);
            const columnName = String(cell.dataset.previewCellColumn || "");

            cell.classList.toggle("isDatasetSelection", isDataPreviewCellSelected(selection, rowIndex, columnName));
        });
        return;
    }

    if (selection.kind === "data-row") {
        documentRef.querySelectorAll<HTMLElement>("[data-preview-row]").forEach((cell) => {
            cell.classList.toggle("isDatasetSelection", isDataPreviewRowSelected(selection, Number(cell.dataset.previewRow || -1)));
        });
        return;
    }

    if (selection.kind === "data-column") {
        documentRef.querySelectorAll<HTMLElement>("[data-preview-column]").forEach((cell) => {
            cell.classList.toggle("isDatasetSelection", isDataPreviewColumnSelected(selection, String(cell.dataset.previewColumn || "")));
        });
        return;
    }

    if (selection.kind === "variable-cell") {
        documentRef.querySelectorAll<HTMLElement>("[data-variable-metadata-row][data-variable-metadata-key]").forEach((cell) => {
            const rowIndex = Number(cell.dataset.variableMetadataRow || -1);
            const metadataKey = String(cell.dataset.variableMetadataKey || "");

            cell.classList.toggle("isDatasetSelection", isVariableMetadataCellSelected(selection, rowIndex, metadataKey));
        });
        return;
    }

    if (selection.kind === "variable-row") {
        documentRef.querySelectorAll<HTMLElement>("[data-variable-metadata-row-index]").forEach((cell) => {
            cell.classList.toggle("isDatasetSelection", isVariableMetadataRowSelected(selection, Number(cell.dataset.variableMetadataRowIndex || -1)));
        });
        return;
    }

    if (selection.kind === "metadata-range") {
        documentRef.querySelectorAll<HTMLElement>("[data-variable-metadata-row][data-variable-metadata-key]").forEach((cell) => {
            const rowIndex = Number(cell.dataset.variableMetadataRow || -1);
            const metadataKey = String(cell.dataset.variableMetadataKey || "");

            cell.classList.toggle("isDatasetSelection", isVariableMetadataCellSelected(selection, rowIndex, metadataKey));
        });
    }
};


const hideContextMenu = function(menu: HTMLElement, helpers: DatasetSelectionHelpers): void {
    menu.setAttribute("hidden", "true");
    helpers.empty(menu);
};


const showContextMenu = function(
    windowRef: Window,
    menu: HTMLElement,
    actions: DatasetEditorContextAction[],
    clientX: number,
    clientY: number,
    executeCommand: (command: string) => void,
    helpers: DatasetSelectionHelpers
): void {
    helpers.empty(menu);

    if (actions.length === 0) {
        hideContextMenu(menu, helpers);
        return;
    }

    actions.forEach((contextAction) => {
        const button = windowRef.document.createElement("button");

        button.type = "button";
        button.textContent = contextAction.label;
        button.addEventListener("click", () => {
            hideContextMenu(menu, helpers);
            executeCommand(contextAction.command);
        });
        menu.appendChild(button);
    });

    menu.removeAttribute("hidden");
    menu.style.left = Math.max(8, Math.min(windowRef.innerWidth - 200, clientX)) + "px";
    menu.style.top = Math.max(8, Math.min(windowRef.innerHeight - 40, clientY)) + "px";
};


export const datasetSelectionPanelApi = {
    hideContextMenu,
    refreshDatasetSelectionHighlights,
    renderDatasetEditorSelection,
    showContextMenu
};
