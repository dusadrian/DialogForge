export interface DatasetEditorContextMenuView<TCellTarget> {
    readonly headerColumn: string;
    readonly rowNumber: number;
    readonly variableRowColumn: string;
    readonly cellTarget: TCellTarget | null;
    setCellTarget: (target: TCellTarget | null) => void;
    hideHeader: () => void;
    hideRow: () => void;
    hideVariableRow: () => void;
    hideCell: () => void;
    showHeader: (
        column: string,
        clientX: number,
        clientY: number
    ) => boolean;
    showRow: (
        row: number,
        clientX: number,
        clientY: number
    ) => boolean;
    showVariableRow: (
        column: string,
        clientX: number,
        clientY: number
    ) => boolean;
    showCell: (
        target: TCellTarget,
        clientX: number,
        clientY: number,
        pasteOnly: boolean
    ) => boolean;
}

interface MenuSize {
    minimumWidth: number;
    minimumHeight: number;
}

export const createDatasetEditorContextMenuView = function<
    TCellTarget
>(
    document: Document,
    window: Window
): DatasetEditorContextMenuView<TCellTarget> {
    let headerColumn = "";
    let rowNumber = 0;
    let variableRowColumn = "";
    let cellTarget: TCellTarget | null = null;

    const menu = function(id: string): HTMLElement | null {
        return document.getElementById(id);
    };
    const hideMenu = function(
        id: string
    ): void {
        const element = menu(id);

        if (!element) {
            return;
        }

        element.hidden = true;
        element.classList.remove("is-open");
    };
    const positionMenu = function(
        element: HTMLElement,
        clientX: number,
        clientY: number,
        size: MenuSize
    ): void {
        element.hidden = false;
        element.classList.add("is-open");
        element.style.left = "0px";
        element.style.top = "0px";

        const width = Math.max(
            size.minimumWidth,
            element.offsetWidth || size.minimumWidth
        );
        const height = Math.max(
            size.minimumHeight,
            element.offsetHeight || size.minimumHeight
        );
        const left = Math.max(
            8,
            Math.min(
                window.innerWidth - width - 8,
                clientX
            )
        );
        const top = Math.max(
            8,
            Math.min(
                window.innerHeight - height - 8,
                clientY
            )
        );

        element.style.left = Math.round(left) + "px";
        element.style.top = Math.round(top) + "px";
    };

    const hideHeader = function(): void {
        headerColumn = "";
        hideMenu("datasetEditorHeaderMenu");
    };
    const hideRow = function(): void {
        rowNumber = 0;
        hideMenu("datasetEditorRowMenu");
    };
    const hideVariableRow = function(): void {
        variableRowColumn = "";
        hideMenu("datasetEditorVariableRowMenu");
    };
    const hideCell = function(): void {
        cellTarget = null;
        hideMenu("datasetEditorCellMenu");
    };
    const hideOtherMenus = function(
        keep:
            | "header"
            | "row"
            | "variable-row"
            | "cell"
    ): void {
        if (keep !== "header") {
            hideHeader();
        }
        if (keep !== "row") {
            hideRow();
        }
        if (keep !== "variable-row") {
            hideVariableRow();
        }
        if (keep !== "cell") {
            hideCell();
        }
    };

    return {
        get headerColumn(): string {
            return headerColumn;
        },
        get rowNumber(): number {
            return rowNumber;
        },
        get variableRowColumn(): string {
            return variableRowColumn;
        },
        get cellTarget(): TCellTarget | null {
            return cellTarget;
        },
        setCellTarget: function(
            target: TCellTarget | null
        ): void {
            cellTarget = target;
        },
        hideHeader,
        hideRow,
        hideVariableRow,
        hideCell,
        showHeader: function(
            column: string,
            clientX: number,
            clientY: number
        ): boolean {
            const element = menu("datasetEditorHeaderMenu");
            const nextColumn = String(column || "").trim();

            if (!element || !nextColumn) {
                hideHeader();
                return false;
            }

            hideOtherMenus("header");
            headerColumn = nextColumn;
            positionMenu(element, clientX, clientY, {
                minimumWidth: 172,
                minimumHeight: 96
            });

            return true;
        },
        showRow: function(
            row: number,
            clientX: number,
            clientY: number
        ): boolean {
            const element = menu("datasetEditorRowMenu");
            const nextRow = Number.isFinite(Number(row))
                ? Number(row)
                : 0;

            if (!element || nextRow < 1) {
                hideRow();
                return false;
            }

            hideOtherMenus("row");
            rowNumber = nextRow;
            positionMenu(element, clientX, clientY, {
                minimumWidth: 168,
                minimumHeight: 64
            });

            return true;
        },
        showVariableRow: function(
            column: string,
            clientX: number,
            clientY: number
        ): boolean {
            const element = menu(
                "datasetEditorVariableRowMenu"
            );
            const nextColumn = String(column || "").trim();

            if (!element || !nextColumn) {
                hideVariableRow();
                return false;
            }

            hideOtherMenus("variable-row");
            variableRowColumn = nextColumn;
            positionMenu(element, clientX, clientY, {
                minimumWidth: 172,
                minimumHeight: 96
            });

            return true;
        },
        showCell: function(
            target: TCellTarget,
            clientX: number,
            clientY: number,
            pasteOnly: boolean
        ): boolean {
            const element = menu("datasetEditorCellMenu");

            if (!element || !target) {
                hideCell();
                return false;
            }

            hideOtherMenus("cell");
            cellTarget = target;
            element.querySelectorAll<HTMLElement>(
                "[data-cell-menu-action]"
            ).forEach(function(button): void {
                const action = String(
                    button.getAttribute(
                        "data-cell-menu-action"
                    ) || ""
                );
                const visible =
                    !pasteOnly || action === "paste";

                button.hidden = !visible;
                button.style.display = visible ? "" : "none";
            });
            positionMenu(element, clientX, clientY, {
                minimumWidth: 112,
                minimumHeight: 56
            });

            return true;
        }
    };
};
