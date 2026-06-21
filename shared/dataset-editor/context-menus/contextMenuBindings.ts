export interface DatasetEditorContextMenuBindings {
    headerMenu: HTMLElement | null;
    rowMenu: HTMLElement | null;
    variableRowMenu: HTMLElement | null;
    cellMenu: HTMLElement | null;
    getHeaderColumn: () => string;
    getRowNumber: () => number;
    getVariableRowColumn: () => string;
    hideHeaderMenu: () => void;
    hideRowMenu: () => void;
    hideVariableRowMenu: () => void;
    hideCellMenu: () => void;
    copyColumn: (
        columnName: string,
        options?: {
            includeLabels?: boolean;
        }
    ) => void;
    pasteColumn: (columnName: string) => void;
    sortColumn: (columnName: string, decreasing: boolean) => void;
    renameColumn: (columnName: string) => void;
    insertColumn: (
        columnName: string,
        position: "before" | "after"
    ) => void;
    removeColumn: (columnName: string) => void;
    insertRow: (
        rowNumber: number,
        position: "before" | "after"
    ) => void;
    renameRow: (rowNumber: number) => void;
    removeRow: (rowNumber: number) => void;
    copyCell: () => void;
    pasteCell: () => void;
}


const actionTarget = function(
    event: Event,
    selector: string
): HTMLElement | null {
    return (event.target as HTMLElement | null)?.closest<HTMLElement>(
        selector
    ) || null;
};


const actionName = function(
    target: HTMLElement | null,
    attribute: string
): string {
    return String(target?.getAttribute(attribute) || "");
};


const bindHeaderMenu = function(
    bindings: DatasetEditorContextMenuBindings
): void {
    bindings.headerMenu?.addEventListener("click", (event) => {
        const target = actionTarget(event, "[data-header-menu-action]");
        const action = actionName(target, "data-header-menu-action");
        const columnName = bindings.getHeaderColumn();

        if (!action || !columnName) {
            bindings.hideHeaderMenu();
            return;
        }

        if (action === "copy-values") {
            bindings.copyColumn(columnName);
            return;
        }

        if (action === "copy-labels") {
            bindings.copyColumn(columnName, {
                includeLabels: true
            });
            return;
        }

        if (action === "paste") {
            if ((target as HTMLButtonElement | null)?.disabled) {
                return;
            }

            bindings.pasteColumn(columnName);
            return;
        }

        if (action === "sort-asc") {
            bindings.sortColumn(columnName, false);
            return;
        }

        if (action === "sort-desc") {
            bindings.sortColumn(columnName, true);
            return;
        }

        if (action === "rename") {
            bindings.renameColumn(columnName);
            return;
        }

        if (action === "add-before" || action === "add-after") {
            bindings.insertColumn(
                columnName,
                action === "add-before" ? "before" : "after"
            );
            return;
        }

        if (action === "remove") {
            bindings.removeColumn(columnName);
            return;
        }

        bindings.hideHeaderMenu();
    });
};


const bindRowMenu = function(
    bindings: DatasetEditorContextMenuBindings
): void {
    bindings.rowMenu?.addEventListener("click", (event) => {
        const target = actionTarget(event, "[data-row-menu-action]");
        const action = actionName(target, "data-row-menu-action");
        const rowNumber = bindings.getRowNumber();

        if (!action || rowNumber < 1) {
            bindings.hideRowMenu();
            return;
        }

        if (action === "add-before" || action === "add-after") {
            bindings.insertRow(
                rowNumber,
                action === "add-before" ? "before" : "after"
            );
            return;
        }

        if (action === "rename") {
            bindings.renameRow(rowNumber);
            return;
        }

        if (action === "remove") {
            bindings.removeRow(rowNumber);
            return;
        }

        bindings.hideRowMenu();
    });
};


const bindVariableRowMenu = function(
    bindings: DatasetEditorContextMenuBindings
): void {
    bindings.variableRowMenu?.addEventListener("click", (event) => {
        const target = actionTarget(
            event,
            "[data-variable-row-menu-action]"
        );
        const action = actionName(
            target,
            "data-variable-row-menu-action"
        );
        const columnName = bindings.getVariableRowColumn();

        if (!action || !columnName) {
            bindings.hideVariableRowMenu();
            return;
        }

        if (action === "add-before" || action === "add-after") {
            bindings.insertColumn(
                columnName,
                action === "add-before" ? "before" : "after"
            );
            bindings.hideVariableRowMenu();
            return;
        }

        if (action === "remove") {
            bindings.removeColumn(columnName);
            bindings.hideVariableRowMenu();
            return;
        }

        bindings.hideVariableRowMenu();
    });
};


const bindCellMenu = function(
    bindings: DatasetEditorContextMenuBindings
): void {
    bindings.cellMenu?.addEventListener("click", (event) => {
        const target = actionTarget(event, "[data-cell-menu-action]");
        const action = actionName(target, "data-cell-menu-action");

        if (action === "copy") {
            bindings.copyCell();
            return;
        }

        if (action === "paste") {
            bindings.pasteCell();
            return;
        }

        bindings.hideCellMenu();
    });
};


export const bindDatasetEditorContextMenus = function(
    bindings: DatasetEditorContextMenuBindings
): void {
    bindHeaderMenu(bindings);
    bindRowMenu(bindings);
    bindVariableRowMenu(bindings);
    bindCellMenu(bindings);
};
