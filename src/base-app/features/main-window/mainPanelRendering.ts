import type {
    TranscriptEvent
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createMainUtilityPanelController
} from "../runtime-panels/mainUtilityPanelController";
import {
    createMainCompositionResultController
} from "../composition-panels/mainCompositionResultController";


export const createMainCommandFieldAppender = function(
    document: Document
) {
    return function(
        parent: HTMLElement,
        name: string,
        value: unknown
    ): void {
        const displayValue = value || "";
        const row = document.createElement("div");
        const label = document.createElement("span");
        const content = document.createElement("span");

        row.className = "commandField";
        label.className = "commandName";
        content.className = "commandValue";
        label.textContent = name;
        content.textContent = Array.isArray(displayValue)
            ? displayValue.join(", ")
            : String(displayValue);

        row.appendChild(label);
        row.appendChild(content);
        parent.appendChild(row);
    };
};


export interface MainPanelRenderingOptions {
    document: Document;
    dialogForge: DialogForgeApi;
    selectedCommand: HTMLElement;
    appendCommandField(
        parent: HTMLElement,
        name: string,
        value: unknown
    ): void;
    empty(element: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
    scrollTo(domTarget: string): void;
}


export const createMainPanelRendering = function(
    options: MainPanelRenderingOptions
) {
    const helpers = {
        appendField: options.appendCommandField,
        empty: options.empty
    };
    const utilityPanelController = createMainUtilityPanelController({
        document: options.document,
        helpers,
        checkDependencies: options.dialogForge.checkDependencies
    });
    const compositionResultController = createMainCompositionResultController({
        selectedCommand: options.selectedCommand,
        helpers: {
            ...helpers,
            setStatusClass: options.setStatusClass
        },
        recordTranscriptEvents: options.recordTranscriptEvents,
        scrollTo: options.scrollTo
    });

    return {
        renderImportResult: utilityPanelController.renderImportResult,
        renderImportFileResult: utilityPanelController.renderImportFileResult,
        renderImportPlan: utilityPanelController.renderImportPlan,
        renderImportPreview: utilityPanelController.renderImportPreview,
        renderHelpTopic: utilityPanelController.renderHelpTopic,
        renderCompletions: utilityPanelController.renderCompletions,
        checkDependencies: utilityPanelController.checkDependencies,
        renderInvisibleQuery: utilityPanelController.renderInvisibleQuery,
        renderInvisibleMutation: utilityPanelController.renderInvisibleMutation,
        renderSelectedCommand:
            compositionResultController.renderSelectedCommand,
        renderProductCommandResult:
            compositionResultController.renderProductCommandResult,
        renderRuntimeMethodResult:
            compositionResultController.renderRuntimeMethodResult,
        renderFeatureEntrypointActivation:
            compositionResultController.renderFeatureEntrypointActivation
    };
};
