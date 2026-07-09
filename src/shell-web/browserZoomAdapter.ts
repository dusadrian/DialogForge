import {
    applicationEventChannels
} from "../base-app/bootstrap/applicationEvents";
import type {
    BrowserStorageAdapter
} from "./browserStorageAdapter";


export interface BrowserZoomAdapterOptions {
    document: Document;
    window: Window;
    storage: BrowserStorageAdapter;
}

export interface BrowserZoomAdapter {
    readZoomFactor(): number;
    apply(value: unknown, options?: { persist?: boolean }): void;
    execute(action: "in" | "out" | "reset"): void;
    broadcast(): void;
    postToWindow(targetWindow: Window | null | undefined): void;
    handleKeyDown(input: unknown): boolean;
}


const clampBrowserZoomFactor = function(value: unknown): number {
    const next = Number(value);

    if (!Number.isFinite(next)) {
        return 1;
    }

    return Math.max(0.5, Math.min(3, next));
};


const readShortcutAction = function(input: unknown): "" | "in" | "out" | "reset" {
    const record = input && typeof input === "object"
        ? input as Record<string, unknown>
        : {};
    const key = String(record.key || "");
    const code = String(record.code || "");
    const ctrlCmd = Boolean(record.ctrlKey || record.metaKey);

    if (!ctrlCmd || record.altKey || record.shiftKey) {
        return "";
    }

    if (key === "+" || key === "=" || code === "Equal" || code === "NumpadAdd") {
        return "in";
    }

    if (key === "-" || code === "Minus" || code === "NumpadSubtract") {
        return "out";
    }

    if (key === "0" || code === "Digit0" || code === "Numpad0") {
        return "reset";
    }

    return "";
};


export const createBrowserZoomAdapter = function(
    options: BrowserZoomAdapterOptions
): BrowserZoomAdapter {
    let zoomFactor = clampBrowserZoomFactor(
        options.storage.readSettings().dialogZoomFactor
    );

    const frameWindows = function(): Window[] {
        return Array.from(
            options.document.querySelectorAll("iframe[class*='dialogforge-web-']")
        ).map((frame) => {
            return (frame as HTMLIFrameElement).contentWindow;
        }).filter((frame): frame is Window => Boolean(frame));
    };

    const persist = function(): void {
        options.storage.writeSettings(Object.assign(
            {},
            options.storage.readSettings(),
            {
                dialogZoomFactor: zoomFactor
            }
        ));
    };

    const postToWindow = function(targetWindow: Window | null | undefined): void {
        targetWindow?.postMessage({
            source: "dialogforge.web-host",
            kind: "event",
            type: "mainZoomFactor",
            channel: applicationEventChannels.mainZoomFactor,
            zoomFactor,
            args: [{ zoomFactor }]
        }, options.window.location.origin);
    };

    const broadcast = function(): void {
        frameWindows().forEach(postToWindow);
    };

    const apply = function(
        value: unknown,
        applyOptions: { persist?: boolean } = {}
    ): void {
        zoomFactor = clampBrowserZoomFactor(value);
        options.document.documentElement.style.setProperty(
            "--dialogforge-main-zoom-factor",
            String(zoomFactor)
        );
        options.document.body.style.zoom = String(zoomFactor);

        if (applyOptions.persist !== false) {
            persist();
        }

        broadcast();
    };

    const execute = function(action: "in" | "out" | "reset"): void {
        apply(
            action === "reset"
                ? 1
                : zoomFactor + (action === "in" ? 0.1 : -0.1)
        );
    };

    return {
        readZoomFactor: function(): number {
            return zoomFactor;
        },
        apply,
        execute,
        broadcast,
        postToWindow,
        handleKeyDown: function(input: unknown): boolean {
            const action = readShortcutAction(input);

            if (!action) {
                return false;
            }

            execute(action);
            return true;
        }
    };
};
