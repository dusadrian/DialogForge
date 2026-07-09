export interface VariableGridAffordanceBindings {
    host: HTMLElement;
    columnWidths: Record<string, number>;
    openValueLabels: (rowIndex: number) => void;
    selectRow: (rowIndex: number) => void;
    openDataColumn: (rowIndex: number) => void;
    persistColumnWidths: () => void;
}


const bindValueLabelButtons = function(
    bindings: VariableGridAffordanceBindings
): void {
    bindings.host
        .querySelectorAll<HTMLButtonElement>(
            "[data-variable-values-editor]"
        )
        .forEach((button) => {
            button.addEventListener("click", (event) => {
                if (event.shiftKey) {
                    event.preventDefault();
                    return;
                }

                bindings.openValueLabels(Number(
                    button.getAttribute("data-variable-values-editor") || -1
                ));
            });
        });
};


const bindRowIndices = function(
    bindings: VariableGridAffordanceBindings
): void {
    bindings.host
        .querySelectorAll<HTMLElement>("[data-variable-row-index]")
        .forEach((cell) => {
            const rowIndex = function(): number {
                return Number(
                    cell.getAttribute("data-variable-row-index") || -1
                );
            };

            cell.addEventListener("click", () => {
                bindings.selectRow(rowIndex());
            });
            cell.addEventListener("contextmenu", () => {
                bindings.selectRow(rowIndex());
            });
            cell.addEventListener("dblclick", (event) => {
                event.preventDefault();
                const index = rowIndex();

                if (index >= 0) {
                    bindings.openDataColumn(index);
                }
            });
        });
};


const bindColumnResizers = function(
    bindings: VariableGridAffordanceBindings
): void {
    bindings.host
        .querySelectorAll<HTMLElement>("[data-variable-resizer]")
        .forEach((handle) => {
            handle.addEventListener("mousedown", (event) => {
                event.preventDefault();
                const key = String(
                    handle.getAttribute("data-variable-resizer") || ""
                );

                if (!key) {
                    return;
                }

                const startX = event.clientX;
                const startWidth = Number(
                    bindings.columnWidths[key] || 100
                );
                const onMove = function(moveEvent: MouseEvent): void {
                    const next = Math.max(
                        56,
                        startWidth + moveEvent.clientX - startX
                    );
                    bindings.columnWidths[key] = next;
                    bindings.host
                        .querySelectorAll<HTMLElement>(
                            `col[data-variable-col="${key}"]`
                        )
                        .forEach((column) => {
                            column.style.width = `${Math.round(next)}px`;
                        });
                };
                const onUp = function(): void {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    bindings.persistColumnWidths();
                };

                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
            });
        });
};


export const bindVariableGridAffordances = function(
    bindings: VariableGridAffordanceBindings
): void {
    bindValueLabelButtons(bindings);
    bindRowIndices(bindings);
    bindColumnResizers(bindings);
};
