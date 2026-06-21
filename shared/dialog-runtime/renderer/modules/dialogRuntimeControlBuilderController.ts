import type {
    EventEmitter
} from "events";
import {
    asText
} from "../library/utils";
import type {
    RuntimeElementSpec
} from "./dialog.types";
import {
    createDialogBasicControlBuilders
} from "./dialogBasicControlBuilders";
import {
    createDialogCompositeControlBuilders
} from "./dialogCompositeControlBuilders";
import {
    createDialogContainerBuilder
} from "./dialogContainerBuilder";
import {
    createDialogContainerSearch
} from "./dialogContainerSearch";
import {
    createDialogControlLifecycle
} from "./dialogControlLifecycle";
import {
    createDialogLabelBuilder
} from "./dialogLabelBuilder";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";
import {
    createDialogValueControlBuilders
} from "./dialogValueControlBuilders";

export interface DialogRuntimeControlBuilderRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    radios: Record<string, Record<string, true>>;
    retryPendingRestore: () => void;
    conditionsParser: (conditionText: unknown) => {
        conditions: unknown;
        elements: string[];
    };
    conditionsChecker: (
        data: { name?: string },
        element: RuntimeControl
    ) => void;
}

export interface DialogRuntimeControlBuilderController {
    buildElement: (spec: RuntimeElementSpec) => void;
}

export const createDialogRuntimeControlBuilderController = function(
    root: HTMLElement,
    runtime: DialogRuntimeControlBuilderRuntime
): DialogRuntimeControlBuilderController {
    const containerSearch = createDialogContainerSearch(document);
    const lifecycle = createDialogControlLifecycle(runtime);
    const {
        buildButton,
        buildCheckbox,
        buildInput,
        buildCounter
    } = createDialogBasicControlBuilders(root, runtime, lifecycle);
    const {
        buildPlot,
        buildSeparator,
        buildSlider,
        buildSelect,
        buildRadio
    } = createDialogValueControlBuilders(root, runtime, lifecycle);
    const buildLabel = createDialogLabelBuilder(
        root,
        runtime,
        lifecycle
    );
    const buildContainer = createDialogContainerBuilder(
        root,
        runtime,
        lifecycle,
        containerSearch
    );
    const {
        buildChoice,
        buildGroup
    } = createDialogCompositeControlBuilders(root, runtime, lifecycle);

    const buildElement = function(spec: RuntimeElementSpec): void {
        const type = asText(spec.type, "").toLowerCase();

        if (type === "button") {
            buildButton(spec);
        }
        else if (type === "checkbox") {
            buildCheckbox(spec);
        }
        else if (type === "choice") {
            buildChoice(spec);
        }
        else if (type === "container") {
            buildContainer(spec);
        }
        else if (type === "counter") {
            buildCounter(spec);
        }
        else if (type === "group") {
            buildGroup(spec);
        }
        else if (type === "input") {
            buildInput(spec);
        }
        else if (type === "label") {
            buildLabel(spec);
        }
        else if (type === "plot") {
            buildPlot(spec);
        }
        else if (type === "radio") {
            buildRadio(spec);
        }
        else if (type === "select") {
            buildSelect(spec);
        }
        else if (type === "separator") {
            buildSeparator(spec);
        }
        else if (type === "slider") {
            buildSlider(spec);
        }
    };

    return {
        buildElement
    };
};
