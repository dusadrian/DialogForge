import type {
    RuntimeCapability
} from "../../provider-contract/runtimeProvider";


export const implementedRRuntimeCapabilities: RuntimeCapability[] = [
    "commands.visible",
    "commands.invisible",
    "data.import",
    "workspace.objects",
    "workspace.activeDataset",
    "workspace.rename",
    "tabular.schema",
    "tabular.read",
    "tabular.writeCells",
    "tabular.writeColumns",
    "tabular.writeRows",
    "tabular.rowNames",
    "tabular.columnNames",
    "tabular.variableMetadata",
    "tabular.variableMetadata.write",
    "tabular.valueLabels",
    "tabular.valueLabels.write",
    "tabular.declaredMissing",
    "tabular.declaredMissing.write",
    "help.topics",
    "completions.symbols",
    "dependencies.packages",
    "plots"
];


export const implementedRTabularObjectCapabilities:
    RuntimeCapability[] = implementedRRuntimeCapabilities.filter(
        function(capability) {
            return capability.startsWith("tabular.");
        }
    );


export const rWorkspaceObjectCapabilities = function(
    tabular: boolean
): RuntimeCapability[] {
    return (
        tabular
            ? implementedRTabularObjectCapabilities
            : []
    ).concat([
        "workspace.remove",
        "workspace.rename"
    ]);
};
