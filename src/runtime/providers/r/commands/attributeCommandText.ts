import type { DatasetVariableMetadata } from "../../../tabular-data/datasetViewerTypes";
import { collectAttributeChanges } from "../../../tabular-data/datasetAttributeChanges";


// Commands are remembered for reproduction; submitted values use the typed
// runtime protocol and are never evaluated as source code.
export const buildAttributeCommand = function(
    datasetName: string,
    original: DatasetVariableMetadata,
    updated: DatasetVariableMetadata
): string {
    const target = `get(${JSON.stringify(datasetName)}, envir = .GlobalEnv)[[${JSON.stringify(original.name)}]]`;
    const changes = collectAttributeChanges(original, updated);
    const statements = changes.map((change) => {
        const name = JSON.stringify(change.name);
        let value = change.value;
        if (change.remove) {
            value = "NULL";
        }
        else if (change.type === "text") {
            value = JSON.stringify(change.value);
        }
        else if (change.type === "integer") {
            value = `${change.value}L`;
        }
        const attribute = change.source === "spss" ? "spss.attributes" : "stata.characteristics";
        if (change.source === "r") {
            return `attr(.column, ${name}) <- ${value}`;
        }
        return [
            `.attributes <- attr(.column, "${attribute}")`,
            `.attributes[[${name}]] <- ${value}`,
            `attr(.column, "${attribute}") <- if (length(.attributes)) .attributes else NULL`
        ].join("; ");
    });
    if (!statements.length) {
        return "";
    }
    const dataset = JSON.stringify(datasetName);
    const variable = JSON.stringify(original.name);
    return [
        `local({ .column <- ${target}`,
        ...statements,
        `.data <- get(${dataset}, envir = .GlobalEnv)`,
        `.data[[${variable}]] <- .column`,
        `assign(${dataset}, .data, envir = .GlobalEnv) })`
    ].join("; ");
};
