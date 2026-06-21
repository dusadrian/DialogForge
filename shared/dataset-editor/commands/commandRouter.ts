export type DatasetCommandAction =
    | "applyPaste"
    | "beginEdit"
    | "cancelEdit"
    | "commitEdit"
    | "copyPayload"
    | "copyPayloadWithLabels"
    | "copyToClipboard"
    | "copyValuesToClipboard"
    | "goToCase"
    | "goToVariable"
    | "insertColumn"
    | "insertRow"
    | "parsePaste"
    | "pasteFromClipboard"
    | "readClipboard"
    | "removeColumn"
    | "removeRow"
    | "renameColumn"
    | "renameRow"
    | "sortRows"
    | "toggleTab"
    | "updateDeclaredMissing"
    | "updateValueLabels"
    | "updateVariableMetadata"
    | "writeCell"
    | "";


export interface DatasetCommandRoute {
    status: string;
    action: DatasetCommandAction;
    position: "before" | "after" | "";
    direction: "ascending" | "descending" | "";
    message: string;
}


const route = function(
    action: DatasetCommandAction,
    position: "before" | "after" | "" = "",
    direction: "ascending" | "descending" | "" = ""
): DatasetCommandRoute {
    return {
        status: "ready",
        action,
        position,
        direction,
        message: "Dataset command routed."
    };
};


const unavailable = function(command: string): DatasetCommandRoute {
    return {
        status: "unavailable",
        action: "",
        position: "",
        direction: "",
        message: "Dataset command is not registered: " + command
    };
};


export const routeDatasetCommand = function(command: string): DatasetCommandRoute {
    if (command === "dataset.copyPayload") {
        return route("copyPayload");
    }
    if (command === "dataset.copyPayloadWithLabels") {
        return route("copyPayloadWithLabels");
    }
    if (command === "dataset.copy") {
        return route("copyToClipboard");
    }
    if (command === "dataset.copyValues") {
        return route("copyValuesToClipboard");
    }
    if (command === "dataset.readClipboard") {
        return route("readClipboard");
    }
    if (command === "dataset.parsePaste") {
        return route("parsePaste");
    }
    if (command === "dataset.applyPaste") {
        return route("applyPaste");
    }
    if (command === "dataset.beginEdit") {
        return route("beginEdit");
    }
    if (command === "dataset.commitEdit") {
        return route("commitEdit");
    }
    if (command === "dataset.cancelEdit") {
        return route("cancelEdit");
    }
    if (command === "dataset.writeCell") {
        return route("writeCell");
    }
    if (command === "dataset.goToCase") {
        return route("goToCase");
    }
    if (command === "dataset.goToVariable") {
        return route("goToVariable");
    }
    if (command === "dataset.pasteFromClipboard") {
        return route("pasteFromClipboard");
    }
    if (command === "dataset.toggleTab") {
        return route("toggleTab");
    }
    if (command === "dataset.insertColumn") {
        return route("insertColumn");
    }
    if (command === "dataset.insertColumn.before") {
        return route("insertColumn", "before");
    }
    if (command === "dataset.insertColumn.after") {
        return route("insertColumn", "after");
    }
    if (command === "dataset.removeColumn") {
        return route("removeColumn");
    }
    if (command === "dataset.renameColumn") {
        return route("renameColumn");
    }
    if (command === "dataset.insertRow") {
        return route("insertRow");
    }
    if (command === "dataset.insertRow.before") {
        return route("insertRow", "before");
    }
    if (command === "dataset.insertRow.after") {
        return route("insertRow", "after");
    }
    if (command === "dataset.removeRow") {
        return route("removeRow");
    }
    if (command === "dataset.renameRow") {
        return route("renameRow");
    }
    if (command === "dataset.sortRows.ascending") {
        return route("sortRows", "", "ascending");
    }
    if (command === "dataset.sortRows.descending") {
        return route("sortRows", "", "descending");
    }
    if (command === "dataset.updateVariableMetadata") {
        return route("updateVariableMetadata");
    }
    if (command === "dataset.updateValueLabels") {
        return route("updateValueLabels");
    }
    if (command === "dataset.updateDeclaredMissing") {
        return route("updateDeclaredMissing");
    }

    return unavailable(command);
};


export const commandRouterApi = {
    routeDatasetCommand
};
