import { RuntimeCapability } from "../provider-contract/runtimeProvider";


export interface FeatureRequirement {
    feature: string;
    label: string;
    required: RuntimeCapability[];
}


export const baseFeatureRequirements: FeatureRequirement[] = [
    {
        feature: "console",
        label: "Console",
        required: ["commands.visible"]
    },
    {
        feature: "workspace-pane",
        label: "Workspace pane",
        required: ["workspace.objects"]
    },
    {
        feature: "dataset-editor.grid",
        label: "Dataset grid",
        required: ["tabular.schema", "tabular.read"]
    },
    {
        feature: "dataset-editor.cell-editing",
        label: "Cell editing",
        required: ["tabular.schema", "tabular.read", "tabular.writeCells"]
    },
    {
        feature: "dataset-editor.column-editing",
        label: "Column editing",
        required: ["tabular.schema", "tabular.read", "tabular.writeColumns"]
    },
    {
        feature: "dataset-editor.row-editing",
        label: "Row editing",
        required: ["tabular.schema", "tabular.read", "tabular.writeRows"]
    },
    {
        feature: "dataset-editor.variable-view",
        label: "Variable metadata",
        required: ["tabular.variableMetadata"]
    },
    {
        feature: "dataset-editor.variable-editing",
        label: "Variable metadata editing",
        required: ["tabular.variableMetadata", "tabular.variableMetadata.write"]
    },
    {
        feature: "dataset-editor.value-labels",
        label: "Value labels",
        required: ["tabular.valueLabels"]
    },
    {
        feature: "dataset-editor.value-label-editing",
        label: "Value label editing",
        required: ["tabular.valueLabels", "tabular.valueLabels.write"]
    },
    {
        feature: "dataset-editor.declared-missing",
        label: "Declared missing values",
        required: ["tabular.declaredMissing"]
    },
    {
        feature: "dataset-editor.declared-missing-editing",
        label: "Declared missing editing",
        required: ["tabular.declaredMissing", "tabular.declaredMissing.write"]
    },
    {
        feature: "help",
        label: "Help topics",
        required: ["help.topics"]
    },
    {
        feature: "completions",
        label: "Symbol completions",
        required: ["completions.symbols"]
    },
    {
        feature: "dependency-checks",
        label: "Dependency checks",
        required: ["dependencies.packages"]
    }
];
