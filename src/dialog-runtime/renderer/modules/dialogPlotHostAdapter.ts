import type {
    EventEmitter
} from "events";
import {
    asBoolean,
    asStringArray,
    asText,
    ensureNumber
} from "../library/utils";
import type {
    RuntimeElementSpec
} from "./dialog.types";
import type {
    DialogControlLifecycle
} from "./dialogControlLifecycle";
import {
    createRuntimeControl,
    makeNodeFacade,
    toCssPx
} from "./dialogControlPrimitives";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";

export interface DialogValueControlRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    radios: Record<string, Record<string, true>>;
    retryPendingRestore: () => void;
}

export const createDialogPlotHostAdapter = function(
    root: HTMLElement,
    runtime: DialogValueControlRuntime,
    lifecycle: DialogControlLifecycle
) {
    const emitValueChange = function(
        control: RuntimeControl
    ): void {
        if (!control.initialize) {
            runtime.events.emit("iSpeak", {
                name: control.name,
                status: "value"
            });
        }
    };

    const buildPlot = function(
        spec: RuntimeElementSpec,
        wrap: HTMLElement
    ): void {
        wrap.classList.add('dm-plot');
        wrap.dataset.controlName = asText(spec.name);
        wrap.dataset.controlType = 'plot';
        lifecycle.applyPosition(wrap, spec);
        if (asBoolean(spec.resizeWithDialog)) {
            wrap.dataset.resizeWithDialog = "true";
            wrap.dataset.authoredWidth = String(ensureNumber(spec.width, 250));
            wrap.dataset.authoredHeight = String(ensureNumber(spec.height, 220));
        }

        wrap.style.backgroundColor = asText(
            spec.backgroundColor,
            "#ffffff"
        );
        wrap.style.border =
            "1px solid "
            + asText(spec.borderColor, "#c9c9c9");
        wrap.style.overflow = "visible";

        const surface = wrap.querySelector<HTMLElement>('.dm-plot-surface')!;

        const control = createRuntimeControl(
            asText(spec.name),
            {
                kind: "plot",
                value: null as unknown,
                host: surface,
                wrap,
                clear: function(): void {},
                setValue: function(_value: unknown): void {},
                render: function(_renderer: unknown): void {},
                element: {
                    cover: makeNodeFacade(surface),
                    txt: makeNodeFacade(null)
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value = null;
        lifecycle.wireConditions(control, spec);

        control.clear = function(): void {
            surface.innerHTML = "";
            control.value = null;
            emitValueChange(control);
        };
        control.setValue = function(value: unknown): void {
            control.value = value ?? null;
            emitValueChange(control);
        };
        control.render = function(renderer: unknown): void {
            if (typeof renderer === "function") {
                renderer(surface, control);
            }
            else if (typeof renderer === "string") {
                surface.innerHTML = renderer;
            }
            else if (
                renderer
                && typeof renderer === "object"
            ) {
                control.value = renderer;
            }

            emitValueChange(control);
        };

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );
        runtime.objList[control.name] = control;
    };

    return { buildPlot };
};
