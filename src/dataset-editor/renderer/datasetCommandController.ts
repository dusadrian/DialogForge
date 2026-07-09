import {
    routeDatasetCommand
} from "../commands/commandRouter";


export interface DatasetCommandControllerBindings {
    goToCase(): void;
    goToVariable(): void;
    openActive(): void;
    buildCopyPayload(options?: { includeValueLabels?: boolean }): void;
    copyToClipboard(options?: { includeValueLabels?: boolean }): void;
    readClipboard(): void;
    parsePaste(): void;
    applyPaste(): void;
    beginEdit(): void;
    commitEdit(): void;
    cancelEdit(): void;
    writeCell(): void;
    pasteFromClipboard(): void;
    toggleTab(): void;
    insertColumn(position?: string): void;
    removeColumn(): void;
    renameColumn(): void;
    insertRow(position?: string): void;
    removeRow(): void;
    renameRow(): void;
    sortRows(direction: string): void;
    updateVariableMetadata(): void;
    updateValueLabels(): void;
    updateDeclaredMissing(): void;
}


export const createDatasetCommandController = function(
    bindings: DatasetCommandControllerBindings
): (command: string) => void {
    return function(command: string): void {
        const route = routeDatasetCommand(command);

        if (route.action === "goToCase") {
            bindings.goToCase();
            return;
        }

        if (route.action === "goToVariable") {
            bindings.goToVariable();
            return;
        }

        if (route.action === "openActive") {
            bindings.openActive();
            return;
        }

        if (route.action === "copyPayload") {
            bindings.buildCopyPayload();
            return;
        }

        if (route.action === "copyPayloadWithLabels") {
            bindings.buildCopyPayload({ includeValueLabels: true });
            return;
        }

        if (route.action === "copyToClipboard") {
            bindings.copyToClipboard();
            return;
        }

        if (route.action === "copyValuesToClipboard") {
            bindings.copyToClipboard({ includeValueLabels: false });
            return;
        }

        if (route.action === "readClipboard") {
            bindings.readClipboard();
            return;
        }

        if (route.action === "parsePaste") {
            bindings.parsePaste();
            return;
        }

        if (route.action === "applyPaste") {
            bindings.applyPaste();
            return;
        }

        if (route.action === "beginEdit") {
            bindings.beginEdit();
            return;
        }

        if (route.action === "commitEdit") {
            bindings.commitEdit();
            return;
        }

        if (route.action === "cancelEdit") {
            bindings.cancelEdit();
            return;
        }

        if (route.action === "writeCell") {
            bindings.writeCell();
            return;
        }

        if (route.action === "pasteFromClipboard") {
            bindings.pasteFromClipboard();
            return;
        }

        if (route.action === "toggleTab") {
            bindings.toggleTab();
            return;
        }

        if (route.action === "insertColumn") {
            bindings.insertColumn(route.position || undefined);
            return;
        }

        if (route.action === "removeColumn") {
            bindings.removeColumn();
            return;
        }

        if (route.action === "renameColumn") {
            bindings.renameColumn();
            return;
        }

        if (route.action === "insertRow") {
            bindings.insertRow(route.position || undefined);
            return;
        }

        if (route.action === "removeRow") {
            bindings.removeRow();
            return;
        }

        if (route.action === "renameRow") {
            bindings.renameRow();
            return;
        }

        if (route.action === "sortRows") {
            bindings.sortRows(route.direction || "ascending");
            return;
        }

        if (route.action === "updateVariableMetadata") {
            bindings.updateVariableMetadata();
            return;
        }

        if (route.action === "updateValueLabels") {
            bindings.updateValueLabels();
            return;
        }

        if (route.action === "updateDeclaredMissing") {
            bindings.updateDeclaredMissing();
        }
    };
};
