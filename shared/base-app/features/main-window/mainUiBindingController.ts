import type {
    DatasetPanelBindings
} from "./datasetPanelBindings";
import {
    bindDatasetPanelControls
} from "./datasetPanelBindings";
import type {
    MainControlBindings
} from "./mainControlBindings";
import {
    bindMainControls
} from "./mainControlBindings";
import type {
    MainRendererEventBindings
} from "./mainRendererEventBindings";
import {
    bindMainRendererEvents
} from "./mainRendererEventBindings";
import type {
    MainWindowInputBindings
} from "./mainWindowInputBindings";
import {
    bindMainWindowInput
} from "./mainWindowInputBindings";


export interface MainUiBindingControllerOptions {
    closeDialogHost(): void;
    mainWindowInput: MainWindowInputBindings;
    mainControls: MainControlBindings;
    datasetPanel: DatasetPanelBindings;
    rendererEvents: MainRendererEventBindings;
}


const requiredElement = function(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error("Missing renderer element: " + id);
    }

    return element;
};


export const createMainUiBindingController = function(
    options: MainUiBindingControllerOptions
) {
    return {
        bind: function(): void {
            requiredElement("dialogClose").addEventListener(
                "click",
                options.closeDialogHost
            );
            bindMainWindowInput(options.mainWindowInput);
            bindMainControls(options.mainControls);
            bindDatasetPanelControls(options.datasetPanel);
            bindMainRendererEvents(options.rendererEvents);
        }
    };
};
