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
    mainWindowInput: MainWindowInputBindings;
    mainControls: MainControlBindings;
    datasetPanel: DatasetPanelBindings;
    rendererEvents: MainRendererEventBindings;
}


export const createMainUiBindingController = function(
    options: MainUiBindingControllerOptions
) {
    let controlsBound = false;
    let rendererEventsBound = false;

    return {
        bindControls: function(): void {
            if (controlsBound) {
                return;
            }

            controlsBound = true;
            bindMainWindowInput(options.mainWindowInput);
            bindMainControls(options.mainControls);
            bindDatasetPanelControls(options.datasetPanel);
        },
        bindRendererEvents: function(): void {
            if (rendererEventsBound) {
                return;
            }

            rendererEventsBound = true;
            bindMainRendererEvents(options.rendererEvents);
        }
    };
};
