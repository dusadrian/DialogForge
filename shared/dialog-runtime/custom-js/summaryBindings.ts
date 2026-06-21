import type { DialogBindingState } from "./dialogBindings";
import {
    getFilterState,
    getSplitByState,
    getWeightByState
} from "./dialogBindings";
import type { DialogScriptControlSnapshot } from "./dialogScriptRunner";


interface SummaryControls {
    datasets: string;
    variables: string;
    summary: string;
    quantile: string;
    mode: string;
    mean: string;
    median: string;
    iqr: string;
    range: string;
    var: string;
    sd: string;
}


interface SummarySelection {
    controls: SummaryControls;
    dataset: string;
    variables: string[];
    summary: boolean;
    quantile: boolean;
    measures: string[];
}


export interface SummaryStatisticSyncResult {
    checked: Record<string, boolean>;
}


const summaryMeasureFunctions: Record<string, [string, boolean]> = {
    mode: ["wmode", true],
    mean: ["wmean", true],
    median: ["wmedian", true],
    iqr: ["wIQR", true],
    range: ["range", false],
    var: ["wvar", true],
    sd: ["wsd", true]
};


const summaryMeasureOrder = ["mode", "mean", "median", "iqr", "range", "var", "sd"];


const getObject = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


const getControlSnapshot = function(payload: Record<string, unknown>): DialogScriptControlSnapshot {
    const snapshot = payload.__controlSnapshot;

    return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? snapshot as DialogScriptControlSnapshot
        : {};
};


const getSummaryControls = function(payload: unknown): SummaryControls {
    const source = getObject(payload);
    const controlsSource = source.controls && typeof source.controls === "object" && !Array.isArray(source.controls)
        ? source.controls as Record<string, unknown>
        : source;
    const statistics = controlsSource.statistics && typeof controlsSource.statistics === "object" && !Array.isArray(controlsSource.statistics)
        ? controlsSource.statistics as Record<string, unknown>
        : {};

    return {
        datasets: String(controlsSource.datasets || "").trim(),
        variables: String(controlsSource.variables || "").trim(),
        summary: String(statistics.summary || "").trim(),
        quantile: String(statistics.quantile || "").trim(),
        mode: String(statistics.mode || "").trim(),
        mean: String(statistics.mean || "").trim(),
        median: String(statistics.median || "").trim(),
        iqr: String(statistics.iqr || "").trim(),
        range: String(statistics.range || "").trim(),
        var: String(statistics.var || "").trim(),
        sd: String(statistics.sd || "").trim()
    };
};


const getSelected = function(snapshot: DialogScriptControlSnapshot, name: string): string[] {
    if (!name || !snapshot[name]) {
        return [];
    }

    return snapshot[name].selected.map((item) => {
        return String(item || "").trim();
    }).filter(Boolean);
};


const isChecked = function(snapshot: DialogScriptControlSnapshot, name: string): boolean {
    return !!name && !!snapshot[name]?.checked;
};


const getSummarySelectedMeasures = function(snapshot: DialogScriptControlSnapshot, controls: SummaryControls): string[] {
    return summaryMeasureOrder.filter((name) => {
        return isChecked(snapshot, controls[name as keyof SummaryControls]);
    });
};


const getSummarySelection = function(payload: unknown): SummarySelection {
    const controls = getSummaryControls(payload);
    const source = getObject(payload);
    const snapshot = getControlSnapshot(source);

    return {
        controls,
        dataset: getSelected(snapshot, controls.datasets)[0] || "<dataset>",
        variables: getSelected(snapshot, controls.variables),
        summary: isChecked(snapshot, controls.summary),
        quantile: isChecked(snapshot, controls.quantile),
        measures: getSummarySelectedMeasures(snapshot, controls)
    };
};


const cleanNames = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((item) => {
            return String(item || "").trim();
        }).filter(Boolean)
        : [];
};


const indentNestedExpression = function(value: string): string {
    const lines = String(value || "").split("\n");

    if (lines.length <= 1) {
        return String(value || "");
    }

    return lines.map((line, index) => {
        return index === 0 ? line : "  " + line;
    }).join("\n");
};


export const syncSummaryStatisticSelection = function(payload: unknown): SummaryStatisticSyncResult {
    const source = getObject(payload);
    const controls = getSummaryControls(payload);
    const snapshot = getControlSnapshot(source);
    const active = String(source.active || "").trim();
    const checked: Record<string, boolean> = {};

    if (!active || !isChecked(snapshot, active)) {
        return { checked };
    }

    const exclusive = [controls.summary, controls.quantile].filter(Boolean);
    const measures = summaryMeasureOrder.map((name) => {
        return controls[name as keyof SummaryControls];
    }).filter(Boolean);
    const targets = exclusive.includes(active)
        ? exclusive.concat(measures).filter((item) => {
            return item !== active;
        })
        : exclusive;

    targets.forEach((target) => {
        if (isChecked(snapshot, target)) {
            checked[target] = false;
        }
    });

    return { checked };
};


export const hasSummaryStatisticSelection = function(payload: unknown): boolean {
    const state = getSummarySelection(payload);

    return state.summary || state.quantile || state.measures.length > 0;
};


export const buildSummaryCommand = function(input: {
    dataset: string;
    variables: string[];
    summary?: boolean;
    quantile?: boolean;
    measures?: string[];
    datasetExpression?: string;
    split?: string[];
    weight?: string;
}): string {
    const dataset = String(input.dataset || "").trim();
    const variables = cleanNames(input.variables);

    if (!dataset || dataset === "<dataset>" || variables.length === 0) {
        return "";
    }

    const datasetExpression = String(input.datasetExpression || dataset).trim() || dataset;
    const datasetReference = datasetExpression !== "<dataset>" ? indentNestedExpression(datasetExpression) : dataset;
    const analysisDataset = variables.length > 1
        ? "subset(" + datasetReference + ", select = c(" + variables.join(", ") + "))"
        : datasetReference;
    const analysisVariable = variables.length > 1 ? "." : variables[0];
    const weight = String(input.weight || "").trim();
    const split = cleanNames(input.split);
    const splitArgument = split.length === 1
        ? "split.by = " + split[0]
        : split.length > 1
            ? "split.by = c(" + split.join(", ") + ")"
            : "";

    const addWeight = function(command: string, useWeight = true): string {
        return useWeight && weight ? command + ", wt = " + weight : command;
    };

    const wrapUsing = function(analysis: string): string {
        let command = "using(\n  " + analysisDataset + ",\n  " + analysis;
        if (splitArgument) {
            command += ",\n  " + splitArgument;
        }
        return command + "\n)";
    };

    let analysis = "";
    if (input.summary === true) {
        analysis = addWeight("wsummary(" + analysisVariable) + ")";
    } else if (input.quantile === true) {
        analysis = addWeight("wquantile(" + analysisVariable) + ")";
    } else {
        const requestedMeasures = cleanNames(input.measures).filter((item) => {
            return Object.prototype.hasOwnProperty.call(summaryMeasureFunctions, item);
        });
        const measures = summaryMeasureOrder.filter((item) => {
            return requestedMeasures.includes(item);
        });

        if (!measures.length) {
            return "";
        }

        if (variables.length === 1 && measures.length === 1) {
            const fn = summaryMeasureFunctions[measures[0]];
            analysis = addWeight(fn[0] + "(" + analysisVariable, fn[1]) + ")";
        } else {
            analysis = "wmeasures(" + analysisVariable + ", what = c(\"" + measures.join("\", \"") + "\")";
            if (weight) {
                analysis += ", wt = " + weight;
            }
            analysis += ")";
        }
    }

    return wrapUsing(analysis) + "\n";
};


export const refreshSummarySyntax = function(state: DialogBindingState, payload: unknown): string {
    const selection = getSummarySelection(payload);
    let datasetExpression = selection.dataset;
    let split: string[] = [];
    let weight = "";

    if (selection.dataset !== "<dataset>") {
        const splitState = getSplitByState(state, selection.dataset);
        const weightState = getWeightByState(state, selection.dataset);
        const filterState = getFilterState(state, selection.dataset);

        split = splitState?.grouping || [];
        weight = weightState?.weighting || "";
        datasetExpression = filterState?.command || selection.dataset;
    }

    return buildSummaryCommand({
        dataset: selection.dataset,
        variables: selection.variables,
        summary: selection.summary,
        quantile: selection.quantile,
        measures: selection.measures,
        datasetExpression,
        split,
        weight
    });
};
