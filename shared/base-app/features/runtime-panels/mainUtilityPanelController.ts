import type {
    CompletionResult,
    DependencyCheckResult,
    HelpTopicResult,
    ImportPlanResult,
    ImportResult,
    InvisibleMutationResult,
    InvisibleQueryResult
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ImportPreviewResult
} from "../../../runtime/tabular-data/importPreview";
import type {
    OpenFileResult
} from "../../../shell-electron/filesystem/openFileResult";
import {
    importPanelApi
} from "../import-panel/importPanel";
import {
    runtimeToolsPanelApi
} from "./runtimeToolsPanel";


interface PanelHelpers {
    appendField(parent: HTMLElement, name: string, value: unknown): void;
    empty(element: HTMLElement): void;
}


export interface MainUtilityPanelBindings {
    document: Document;
    helpers: PanelHelpers;
    checkDependencies(input: {
        kind: "package";
        names: string[];
        source: string;
    }): Promise<DependencyCheckResult>;
}


export const createMainUtilityPanelController = function(
    bindings: MainUtilityPanelBindings
) {
    const byId = function(id: string): HTMLElement {
        const element = bindings.document.getElementById(id);

        if (!element) {
            throw new Error("Missing utility panel element: " + id);
        }

        return element;
    };

    const renderDependencyCheck = function(
        result: DependencyCheckResult
    ): void {
        runtimeToolsPanelApi.renderDependencyCheck(
            byId("dependencyStatus"),
            result,
            bindings.helpers
        );
    };

    return {
        renderImportResult: function(result: ImportResult): void {
            importPanelApi.renderImportResult(
                byId("importStatus"),
                result,
                bindings.helpers
            );
        },
        renderImportFileResult: function(result: OpenFileResult): void {
            importPanelApi.renderImportFileResult(
                byId("importFileStatus"),
                result,
                bindings.helpers
            );
        },
        renderImportPlan: function(result: ImportPlanResult): void {
            importPanelApi.renderImportPlan(
                byId("importPlanStatus"),
                result,
                bindings.helpers
            );
        },
        renderImportPreview: function(result: ImportPreviewResult): void {
            importPanelApi.renderImportPreview(
                byId("importPreviewStatus"),
                result,
                bindings.helpers
            );
        },
        renderHelpTopic: function(result: HelpTopicResult): void {
            runtimeToolsPanelApi.renderHelpTopic(
                byId("helpTopicStatus"),
                result,
                bindings.helpers
            );
        },
        renderCompletions: function(result: CompletionResult): void {
            runtimeToolsPanelApi.renderCompletions(
                byId("completionStatus"),
                result,
                bindings.helpers
            );
        },
        renderDependencyCheck,
        checkDependencies: async function(
            names: string[],
            source = "base-app.dependencies"
        ): Promise<void> {
            renderDependencyCheck(await bindings.checkDependencies({
                kind: "package",
                names,
                source
            }));
        },
        renderInvisibleQuery: function(result: InvisibleQueryResult): void {
            runtimeToolsPanelApi.renderInvisibleQuery(
                byId("invisibleQueryStatus"),
                result,
                bindings.helpers
            );
        },
        renderInvisibleMutation: function(
            result: InvisibleMutationResult
        ): void {
            runtimeToolsPanelApi.renderInvisibleMutation(
                byId("invisibleMutationStatus"),
                result,
                bindings.helpers
            );
        }
    };
};
