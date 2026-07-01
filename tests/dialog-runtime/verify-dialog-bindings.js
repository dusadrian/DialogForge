"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { addSortByVariables, bindSelectExpression, buildSortByCommand, clearFilterState, createDialogBindingState, getRememberedVariableDependents, getDatasetVariablesForDialog, getFilterState, getSortByAvailableVariables, getSortByButtonDirection, getSortByChoiceItems, getSortByTargetDataset, getSplitByState, getWeightByState, hasSummaryStatisticSelection, inheritSubsetDatasetState, keepSortByVariables, rememberVariableSelections, removeSortByVariables, refreshSelectExpression, setDialogButtonDirection, setFilterState, setSplitByState, setWeightByState } = require("../../shared/dialog-runtime/custom-js/dialogBindings");
const { createDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/externalCallHost");
const { createRuntimeDialogDatasetResolver } = require("../../shared/dialog-runtime/custom-js/runtimeDatasetResolver");
const datasets = [
    { name: "survey", columns: ["id", "group", "score"] }
];
const state = createDialogBindingState();
assert.deepStrictEqual(getDatasetVariablesForDialog(datasets, "survey"), ["id", "group", "score"]);
assert.deepStrictEqual(getDatasetVariablesForDialog(datasets, "missing"), []);
setFilterState(state, {
    dataset: "survey",
    command: "subset(survey, score > 10)"
});
assert.deepStrictEqual(getFilterState(state, "survey"), {
    dataset: "survey",
    command: "subset(survey, score > 10)"
});
clearFilterState(state, "survey");
assert.strictEqual(getFilterState(state, "survey"), null);
setSplitByState(state, {
    dataset: "survey",
    grouping: ["group"],
    sortdataset: true
});
assert.deepStrictEqual(getSplitByState(state, "survey"), {
    dataset: "survey",
    grouping: ["group"],
    sortdataset: true
});
setWeightByState(state, {
    dataset: "survey",
    weighting: "score"
});
assert.strictEqual(getWeightByState(state, "survey").weighting, "score");
assert.deepStrictEqual(inheritSubsetDatasetState(state, {
    source: "survey",
    target: "filtered_survey",
    variables: ["group"]
}), {
    filter: null,
    split: {
        dataset: "filtered_survey",
        grouping: ["group"],
        sortdataset: true
    },
    weight: null
});
assert.strictEqual(setDialogButtonDirection(state, "splitBy", "left"), "left");
assert.strictEqual(state.buttonDirections.splitBy, "left");
assert.strictEqual(hasSummaryStatisticSelection({
    selectedStatistics: ["mean"]
}), true);
assert.strictEqual(hasSummaryStatisticSelection({
    statistics: {
        mean: false,
        median: true
    }
}), true);
assert.strictEqual(hasSummaryStatisticSelection({
    statistics: {
        mean: false
    }
}), false);
assert.deepStrictEqual(rememberVariableSelections(state, {
    source: "c_datasets",
    dependents: ["c_variables", "c_group"]
}), {
    source: "c_datasets",
    dependents: ["c_variables", "c_group"]
});
assert.deepStrictEqual(getRememberedVariableDependents(state, "c_datasets"), ["c_variables", "c_group"]);
assert.deepStrictEqual(bindSelectExpression(state, {
    input: "expression",
    dataset: "c_datasets"
}), {
    input: "expression",
    dataset: "c_datasets"
});
assert.deepStrictEqual(refreshSelectExpression(state), {
    input: "expression",
    dataset: "c_datasets"
});
assert.deepStrictEqual(refreshSelectExpression(state, {
    input: "expression"
}), {
    input: "expression",
    dataset: "c_datasets"
});
assert.strictEqual(refreshSelectExpression(state, {
    input: "missing"
}), null);
assert.deepStrictEqual(keepSortByVariables({
    sorting: ["score", "gone"],
    variables: ["id", "score"]
}), ["score"]);
assert.deepStrictEqual(addSortByVariables({
    sorting: ["score"],
    selected: ["id", "score"]
}), ["score", "id"]);
assert.deepStrictEqual(removeSortByVariables({
    sorting: ["score", "id"],
    selected: ["score"]
}), ["id"]);
assert.deepStrictEqual(getSortByAvailableVariables({
    variables: ["id", "group", "score"],
    sorting: ["score"]
}), ["id", "group"]);
assert.deepStrictEqual(getSortByChoiceItems({
    sorting: ["score", "id"]
}), ["score", "id"]);
assert.strictEqual(getSortByButtonDirection({
    choiceSelected: ["score"],
    variableSelected: []
}), "left");
assert.strictEqual(getSortByTargetDataset({
    dataset: "survey",
    createNew: true,
    datasetName: "sorted_survey"
}), "sorted_survey");
assert.strictEqual(buildSortByCommand({
    dataset: "survey",
    sorting: ["score", "id"],
    createNew: true,
    datasetName: "sorted_survey",
    variables: ["id", "group", "score"]
}), "sorted_survey <- survey[order(survey$score, survey$id), ]\n");
assert.strictEqual(buildSortByCommand({
    dataset: "mydata",
    sorting: ["onecolumn"],
    createNew: false,
    datasetName: "",
    variables: ["onecolumn"]
}), "mydata <- mydata[order(mydata$onecolumn), , drop = FALSE]\n");
const verifyHost = async function () {
    const host = createDialogExternalCallHost({
        datasets
    });
    assert.deepStrictEqual(await host.call("getDatasetVariablesForDialog", {
        dataset: "survey"
    }), {
        status: "ready",
        name: "getDatasetVariablesForDialog",
        value: ["id", "group", "score"],
        message: "Dialog external call resolved."
    });
    assert.deepStrictEqual((await host.call("rememberVariableSelections", {
        source: "c_datasets",
        dependents: ["c_variables", "c_group"]
    })).value, {
        source: "c_datasets",
        dependents: ["c_variables", "c_group"]
    });
    assert.deepStrictEqual((await host.call("bindSelectExpressionMonaco", {
        input: "expression",
        dataset: "c_datasets"
    })).value, {
        selectExpression: {
            input: "expression",
            dataset: "c_datasets"
        }
    });
    assert.deepStrictEqual((await host.call("refreshSelectExpressionMonaco", {})).value, {
        selectExpression: {
            input: "expression",
            dataset: "c_datasets"
        }
    });
    assert.deepStrictEqual((await host.call("bindFrequenciesWorkspace", {
        datasets: "c_datasets",
        variables: "c_variables",
        __controlSnapshot: {
            c_datasets: {
                selected: ["survey"]
            },
            c_variables: {
                selected: ["score", "missing"]
            },
            c_group: {
                selected: ["group"]
            }
        }
    })).value, {
        controlValues: {
            c_datasets: ["survey"],
            c_variables: ["id", "group", "score"]
        },
        controlSelections: {
            c_variables: ["score"]
        },
    });
    assert.deepStrictEqual((await host.call("bindCrosstabsWorkspace", {
        datasets: "c_datasets",
        rows: "c_rows",
        cols: "c_cols",
        __controlSnapshot: {}
    })).value, {
        controlValues: {
            c_datasets: ["survey"],
            c_rows: [],
            c_cols: []
        },
        controlSelections: {
            c_rows: [],
            c_cols: []
        }
    });
    assert.deepStrictEqual((await host.call("bindSummaryWorkspaceUpdates", {
        controls: {
            datasets: "c_datasets",
            variables: "c_variables"
        },
        __controlSnapshot: {
            c_datasets: {
                selected: ["survey"]
            }
        }
    })).value, {
        controlValues: {
            c_datasets: ["survey"],
            c_variables: ["id", "group", "score"]
        },
        controlSelections: {}
    });
    assert.deepStrictEqual((await host.call("refreshDatasetEditor", {
        datasetName: "survey"
    })).value, {
        refreshDatasetName: "survey"
    });
    assert.strictEqual((await host.call("setSplitByButtonDirection", {
        direction: "left"
    })).value, "left");
    assert.deepStrictEqual((await host.call("setSplitByState", {
        dataset: "survey",
        grouping: ["group"],
        sortdataset: true
    })).value, {
        dataset: "survey",
        grouping: ["group"],
        sortdataset: true
    });
    assert.strictEqual((await host.call("hasSummaryStatisticSelection", {
        __controlSnapshot: {
            cb_sd: {
                name: "cb_sd",
                value: null,
                selected: [],
                checked: true,
                visible: true,
                enabled: true
            }
        },
        statistics: {
            sd: "cb_sd"
        }
    })).value, true);
    assert.deepStrictEqual((await host.call("syncSummaryStatisticSelection", {
        active: "cb_mean",
        __controlSnapshot: {
            cb_mean: {
                name: "cb_mean",
                value: null,
                selected: [],
                checked: true,
                visible: true,
                enabled: true
            },
            cb_summary: {
                name: "cb_summary",
                value: null,
                selected: [],
                checked: true,
                visible: true,
                enabled: true
            }
        },
        controls: {
            statistics: {
                summary: "cb_summary",
                mean: "cb_mean"
            }
        }
    })).value, {
        checked: {
            cb_summary: false
        }
    });
    setSplitByState(host.state, {
        dataset: "survey",
        grouping: ["group"]
    });
    setWeightByState(host.state, {
        dataset: "survey",
        weighting: "weight"
    });
    setFilterState(host.state, {
        dataset: "survey",
        command: "subset(survey, score > 10)"
    });
    assert.strictEqual((await host.call("refreshSummarySyntax", {
        __controlSnapshot: {
            c_datasets: {
                name: "c_datasets",
                value: null,
                selected: ["survey"],
                checked: false,
                visible: true,
                enabled: true
            },
            c_variables: {
                name: "c_variables",
                value: null,
                selected: ["score"],
                checked: false,
                visible: true,
                enabled: true
            },
            cb_mean: {
                name: "cb_mean",
                value: null,
                selected: [],
                checked: true,
                visible: true,
                enabled: true
            }
        },
        datasets: "c_datasets",
        variables: "c_variables",
        statistics: {
            mean: "cb_mean"
        }
    })).value, [
        "using(",
        "  subset(survey, score > 10),",
        "  wmean(score, wt = weight),",
        "  split.by = group",
        ")",
        ""
    ].join("\n"));
    assert.strictEqual((await host.call("missingBinding", {})).status, "unsupported");
    const resolvedHost = createDialogExternalCallHost({
        resolveDatasets: async function () {
            return [
                { name: "runtime_data", columns: ["case", "condition", "outcome"] }
            ];
        }
    });
    assert.deepStrictEqual((await resolvedHost.call("getDatasetVariablesForDialog", {
        dataset: "runtime_data"
    })).value, ["case", "condition", "outcome"]);
    const runtimeResolver = createRuntimeDialogDatasetResolver({
        listWorkspaceObjects: async function () {
            return {
                status: "ready",
                providerId: "test",
                objects: [
                    {
                        name: "metadata_data",
                        kind: "table",
                        detail: "",
                        provenance: null,
                        capabilities: ["tabular.schema", "tabular.read"]
                    },
                    {
                        name: "preview_data",
                        kind: "table",
                        detail: "",
                        provenance: null,
                        capabilities: ["tabular.read"]
                    },
                    {
                        name: "model",
                        kind: "object",
                        detail: "",
                        provenance: null,
                        capabilities: []
                    }
                ],
                message: "",
                refreshedAt: ""
            };
        },
        readVariableMetadata: async function (objectName) {
            if (objectName === "metadata_data") {
                return {
                    status: "ready",
                    providerId: "test",
                    objectName,
                    variables: [
                        { name: "case", type: "string", role: "id", label: "" },
                        { name: "score", type: "number", role: "data", label: "" }
                    ],
                    message: "",
                    readAt: ""
                };
            }
            return {
                status: "unsupported",
                providerId: "test",
                objectName,
                variables: [],
                message: "",
                readAt: ""
            };
        },
        readTabularPreview: async function (objectName) {
            return {
                status: objectName === "preview_data" ? "ready" : "not-tabular",
                providerId: "test",
                objectName,
                columns: objectName === "preview_data"
                    ? [
                        { name: "x", type: "number", role: "data" },
                        { name: "y", type: "number", role: "data" }
                    ]
                    : [],
                rows: [],
                message: "",
                readAt: ""
            };
        }
    });
    assert.deepStrictEqual(await runtimeResolver(), [
        { name: "metadata_data", columns: ["case", "score"] },
        { name: "preview_data", columns: ["x", "y"] }
    ]);
};
verifyHost()
    .then(() => {
    console.log("Dialog customJS binding helpers verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
