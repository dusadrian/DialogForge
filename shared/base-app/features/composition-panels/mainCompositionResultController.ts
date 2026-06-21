import type {
    ProductCommandResult,
    RuntimeExtensionMethodResult,
    TranscriptEvent
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";
import {
    createFeatureEntrypointActivation
} from "../featureEntrypointCommands";
import {
    compositionPanelsApi
} from "./compositionPanels";


interface PanelHelpers {
    appendField(parent: HTMLElement, name: string, value: unknown): void;
    empty(element: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
}


export interface MainCompositionResultBindings {
    selectedCommand: HTMLElement;
    helpers: PanelHelpers;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
    scrollTo(domTarget: string): void;
}


export const createMainCompositionResultController = function(
    bindings: MainCompositionResultBindings
) {
    return {
        renderSelectedCommand: function(command: EvaluatedMenuItem): void {
            compositionPanelsApi.renderSelectedCommand(
                bindings.selectedCommand,
                command,
                bindings.helpers
            );
        },
        renderProductCommandResult: function(
            result: ProductCommandResult
        ): void {
            compositionPanelsApi.renderProductCommandResult(
                bindings.selectedCommand,
                result,
                bindings.helpers
            );

            if (
                Array.isArray(result.transcriptEvents)
                && result.transcriptEvents.length > 0
            ) {
                bindings.recordTranscriptEvents(result.transcriptEvents);
            }
        },
        renderRuntimeMethodResult: function(
            result: RuntimeExtensionMethodResult
        ): void {
            compositionPanelsApi.renderRuntimeMethodResult(
                bindings.selectedCommand,
                result,
                bindings.helpers
            );
        },
        renderFeatureEntrypointActivation: function(
            command: EvaluatedMenuItem
        ): void {
            const result = createFeatureEntrypointActivation(command);

            compositionPanelsApi.renderFeatureEntrypointActivation(
                bindings.selectedCommand,
                result,
                bindings.scrollTo,
                bindings.helpers
            );
        }
    };
};
