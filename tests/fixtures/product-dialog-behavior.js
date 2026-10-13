"use strict";


const dialogRFrequencyBehavior = {
    dialogId: "frequencies",
    selections: [
        { name: "c_datasets", value: "test" },
        { name: "c_variables", value: "Gender" }
    ],
    command: [
        "using(",
        "  test,",
        "  wtable(Gender)",
        ")"
    ].join("\n")
};


const dialogQCATruthTableBehavior = {
    dialogId: "truthTable",
    selections: [
        { name: "c_datasets", value: "LF" },
        { name: "c_outcome", value: "SURV" },
        { name: "c_conditions", value: "DEV" },
        { name: "c_conditions", value: "URB" }
    ],
    command: [
        "truthTable(",
        "  LF,",
        "  outcome = \"SURV\",conditions = \"DEV, URB\"",
        ")"
    ].join("\n")
};


module.exports = {
    dialogQCATruthTableBehavior,
    dialogRFrequencyBehavior
};
