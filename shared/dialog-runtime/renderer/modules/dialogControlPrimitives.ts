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

export const getRootFontSizePx = function(
    root: HTMLElement,
    fallback = 12
): number {
    const inline = Number(
        String(root.style.fontSize || "").replace("px", "")
    );

    if (Number.isFinite(inline) && inline > 0) {
        return inline;
    }

    try {
        const computed = Number(
            String(window.getComputedStyle(root).fontSize || "")
                .replace("px", "")
        );

        if (Number.isFinite(computed) && computed > 0) {
            return computed;
        }
    }
    catch {}

    return fallback;
};

export const syncInputOverflow = function(
    input: HTMLTextAreaElement | null
): void {
    if (!input) {
        return;
    }

    input.style.overflowX = "hidden";
    input.style.overflowY =
        input.scrollHeight - input.clientHeight > 1
            ? "auto"
            : "hidden";
};

export const updateSmartButton = function(
    button: HTMLElement,
    text: string,
    fontSize: number,
    lineClamp: number,
    width: number,
    height?: number
): void {
    button.style.width = width + "px";
    button.style.maxWidth = width + "px";

    const lineHeight = fontSize * 1.2;
    const paddingY = 3;
    const maxHeight = lineHeight * lineClamp + 3 * paddingY;

    button.style.maxHeight = maxHeight + "px";

    if (Number.isFinite(height) && Number(height) > 0) {
        button.style.height = Number(height) + "px";
        button.style.minHeight = Number(height) + "px";
    }
    else {
        button.style.removeProperty("height");
        button.style.removeProperty("min-height");
    }

    const label = button.querySelector(
        ".smart-button-text"
    ) as HTMLSpanElement | null;
    const icon = button.querySelector(
        ".smart-button-icon"
    ) as HTMLSpanElement | null;

    if (!label) {
        return;
    }

    label.style.fontSize = fontSize + "px";
    label.style.lineHeight = "1.2";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.whiteSpace = "nowrap";
    label.style.setProperty("-webkit-line-clamp", String(lineClamp));
    label.textContent = text;

    if (icon) {
        const configuredSize = Number(icon.dataset.iconSize || "");
        const iconSize = Number.isFinite(configuredSize) && configuredSize > 0
            ? configuredSize
            : fontSize;

        icon.style.fontSize = iconSize + "px";
        icon.style.lineHeight = "1";
    }
};

export const toCodiconClass = function(value: unknown): string {
    const raw = String(value ?? "").trim().toLowerCase();

    if (!raw || raw === "none") {
        return "";
    }

    const aliases: Record<string, string> = {
        minus: "dash",
        remove: "dash",
        plus: "plus",
        add: "plus",
        x: "close"
    };
    const normalized = aliases[raw] ?? raw;

    return normalized.startsWith("codicon-")
        ? normalized
        : "codicon-" + normalized;
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
