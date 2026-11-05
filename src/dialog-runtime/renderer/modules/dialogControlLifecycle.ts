import type {
    EventEmitter
} from "events";
import type {
    RuntimeElementSpec
} from "./dialog.types";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";
import {
    asBoolean,
    asText,
    ensureNumber
} from "../library/utils";
import {
    toCssPx
} from "./dialogControlPrimitives";

export interface DialogControlLifecycleRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    conditionsParser: (conditionText: unknown) => {
        conditions: unknown;
        elements: string[];
    };
    conditionsChecker: (
        data: { name?: string },
        element: RuntimeControl
    ) => void;
}

export interface DialogControlLifecycle {
    applyPosition(element: HTMLElement, spec: RuntimeElementSpec): void;
    wireConditions(control: RuntimeControl, spec: RuntimeElementSpec): void;
    registerCommonState(control: RuntimeControl, spec: RuntimeElementSpec, includeEnabled?: boolean): void;
    setupVisibilityAndEnabled(control: RuntimeControl, node: HTMLElement, includeEnabled?: boolean): void;
}

/**
 * moveWithDialog is either a boolean, meaning the element keeps its authored
 * distance from the lower-right corner, or an "x,y" pair of fractions for
 * elements that track something other than the corner. An axis caption
 * centred under a growing plot, for example, travels half the added width and
 * all of the added height, so it is written as "0.5,1".
 */
const readMoveFactors = function(
    value: unknown
): { x: number; y: number } | null {
    const text = asText(value, "").trim();

    if (text.includes(",")) {
        const [rawX, rawY] = text.split(",");
        const x = ensureNumber(rawX, Number.NaN);
        const y = ensureNumber(rawY, Number.NaN);

        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
        }

        return null;
    }

    return asBoolean(value) ? { x: 1, y: 1 } : null;
};


export const createDialogControlLifecycle = function(
    runtime: DialogControlLifecycleRuntime
): DialogControlLifecycle {
    const applyPosition = function(
        element: HTMLElement,
        spec: RuntimeElementSpec
    ): void {
        element.style.position = "absolute";
        element.style.left = toCssPx(spec.left, 10);
        element.style.top = toCssPx(spec.top, 10);
        element.dataset.controlName = asText(spec.name);
        element.dataset.sourceElementId = String(spec.sourceElementId ?? spec.parentId ?? '');

        const attached = typeof spec.anchorTarget === 'string' && spec.anchorTarget.trim() !== '';
        const moveFactors = attached ? null : readMoveFactors(spec.moveWithDialog);

        if (moveFactors) {
            element.dataset.moveWithDialog = "true";
            element.dataset.authoredLeft = String(
                ensureNumber(spec.left, 10)
            );
            element.dataset.authoredTop = String(
                ensureNumber(spec.top, 10)
            );
            element.dataset.moveFactorX = String(moveFactors.x);
            element.dataset.moveFactorY = String(moveFactors.y);
        }
    };

    const wireConditions = function(
        control: RuntimeControl,
        spec: RuntimeElementSpec
    ): void {
        control.conditions = runtime.conditionsParser(spec.conditions);
        runtime.events.on(
            "iSpeak",
            function(data: { name: string }): void {
                if (data.name !== control.name) {
                    runtime.conditionsChecker(data, control);
                }
            }
        );
    };

    const registerCommonState = function(
        control: RuntimeControl,
        spec: RuntimeElementSpec,
        includeEnabled = true
    ): void {
        control.visible = asBoolean(spec.isVisible, true);
        control.enabled = includeEnabled
            ? asBoolean(spec.isEnabled, true)
            : true;
        control.initialize = true;
        runtime.dialogDefaultData[control.name] = {
            visible: control.visible
        };

        if (includeEnabled) {
            runtime.dialogDefaultData[control.name].enabled =
                control.enabled;
        }
    };

    // Plot content is a host extension, rather than a standard dialog control.
    const setupVisibilityAndEnabled = function(control: RuntimeControl, node: HTMLElement): void {
        control.show = () => { control.visible = true; node.hidden = false; };
        control.hide = () => { control.visible = false; node.hidden = true; };
        control.enable = () => { control.enabled = true; node.style.pointerEvents = ''; };
        control.disable = () => { control.enabled = false; node.style.pointerEvents = 'none'; };
        control.visible ? control.show() : control.hide();
        control.enabled ? control.enable() : control.disable();
        control.initialize = false;
    };

    return {
        applyPosition,
        wireConditions,
        registerCommonState,
        setupVisibilityAndEnabled
    };
};
