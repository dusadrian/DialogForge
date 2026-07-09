import type {
    DatasetVariableColumnKey
} from "../clipboard/editorClipboardState";


export interface VariableGridDomController {
    getHost(): HTMLElement | null;
    getFieldElement(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): HTMLInputElement | HTMLSelectElement | null;
    scrollRowIntoView(rowIndex: number): void;
}


export const createVariableGridDomController = function(
    document: Document,
    window: Window
): VariableGridDomController {
    const getHost = function(): HTMLElement | null {
        return document.getElementById(
            "datasetEditorVariablesScroll"
        );
    };

    const getFieldElement = function(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): HTMLInputElement | HTMLSelectElement | null {
        return getHost()?.querySelector<
            HTMLInputElement | HTMLSelectElement
        >(
            `[data-variable-field="${key}"]`
            + `[data-variable-row="${rowIndex}"]`
        ) || null;
    };

    const scrollRowIntoView = function(rowIndex: number): void {
        const host = getHost();

        if (!host) {
            return;
        }

        window.requestAnimationFrame(() => {
            const row = host.querySelector<HTMLElement>(
                `tr[data-variable-row="${rowIndex}"]`
            );

            if (!row) {
                return;
            }

            row.scrollIntoView({
                block: "center",
                inline: "nearest"
            });
        });
    };

    return {
        getHost,
        getFieldElement,
        scrollRowIntoView
    };
};
