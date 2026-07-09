import {
    asText
} from "../library/utils";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";
import conditions from "../library/conditions";

export interface DialogRuntimeConditionControllerRuntime {
    objList: Record<string, RuntimeControl>;
}

export interface DialogRuntimeConditionController {
    parse: (conditionText: unknown) => {
        conditions: unknown;
        elements: string[];
    };
    check: (
        data: { name?: string },
        element: RuntimeControl
    ) => void;
}

export const createDialogRuntimeConditionController = function(
    runtime: DialogRuntimeConditionControllerRuntime
): DialogRuntimeConditionController {
    const parse = function(conditionText: unknown): {
        conditions: unknown;
        elements: string[];
    } {
        const parsed = conditions.parseConditions(
            asText(conditionText, "")
        );

        if (!parsed.error) {
            return {
                conditions: parsed.result,
                elements: parsed.elements
            };
        }

        return {
            conditions: [],
            elements: []
        };
    };

    const check = function(
        data: { name?: string },
        element: RuntimeControl
    ): void {
        if (!data || !data.name || !element || !element.conditions) {
            return;
        }

        if (
            Array.isArray(element.conditions.elements) &&
            element.conditions.elements.includes(data.name)
        ) {
            conditions.checkConditions(
                data,
                element as never,
                runtime.objList as never
            );
        }
    };

    return {
        parse,
        check
    };
};
