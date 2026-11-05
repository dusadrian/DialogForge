import {
    ensureNumber
} from "../library/utils";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";

export interface DialogNodeFacade {
    node: HTMLElement | null;
    click: (listener: () => void) => void;
    attr: (payload: unknown) => string;
}

export const toCssPx = function(
    value: unknown,
    fallback: number
): string {
    return ensureNumber(value, fallback) + "px";
};

export const makeNodeFacade = function(
    node: HTMLElement | null,
    options: { text?: boolean } = {}
): DialogNodeFacade {
    return {
        node,
        click: function(listener: () => void): void {
            node?.addEventListener("click", listener);
        },
        attr: function(payload: unknown): string {
            if (!node) {
                return "";
            }

            if (typeof payload === "string") {
                return payload === "text"
                    ? node.textContent || ""
                    : "";
            }

            if (
                options.text
                && payload
                && typeof payload === "object"
            ) {
                const attributes = payload as Record<string, unknown>;

                if (attributes.text !== undefined) {
                    node.textContent = String(attributes.text);
                }
            }

            return "";
        }
    };
};

export const createRuntimeControl = function<T extends object>(
    name: string,
    extension: T
): RuntimeControl & T {
    return {
        name,
        visible: true,
        enabled: true,
        initialize: true,
        show: function(): void {},
        hide: function(): void {},
        enable: function(): void {},
        disable: function(): void {},
        ...extension
    };
};
