import {
    applicationEventChannels
} from "../base-app/bootstrap/applicationEvents";
import type {
    BrowserStorageAdapter
} from "./browserStorageAdapter";
import {
    readMainZoomShortcut
} from "../base-app/features/main-window/mainZoomPolicy";
import { createMainZoomState } from "../base-app/features/main-window/mainZoomState";


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


const readShortcutAction = function(input: unknown) {
    const record = input && typeof input === "object"
        ? input as Record<string, unknown>
        : {};
    return readMainZoomShortcut({
        key: String(record.key || ""),
        code: String(record.code || ""),
        ctrlCmd: Boolean(record.ctrlKey || record.metaKey),
        alt: Boolean(record.altKey)
    });
};


export const createBrowserZoomAdapter = function(
    options: BrowserZoomAdapterOptions
): BrowserZoomAdapter {
    const frameWindows = function(): Window[] {
        return Array.from(
            options.document.querySelectorAll("iframe[class*='dialogforge-web-']")
        ).map((frame) => {
            return (frame as HTMLIFrameElement).contentWindow;
        }).filter((frame): frame is Window => Boolean(frame));
    };

    const persist = function(zoomFactor: number): void {
        options.storage.writeSettings(Object.assign(
            {},
            options.storage.readSettings(),
            {
                dialogZoomFactor: zoomFactor
            }
        ));
    };

    const postToWindow = function(targetWindow: Window | null | undefined): void {
        const zoomFactor = zoomState.readZoomFactor();
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

    const deliverZoomFactor = function(zoomFactor: number): void {
        options.document.documentElement.style.setProperty(
            "--dialogforge-main-zoom-factor",
            String(zoomFactor)
        );
        options.document.body.style.zoom = String(zoomFactor);

        broadcast();
    };

    const zoomState = createMainZoomState({
        readStoredZoomFactor: function(): unknown {
            return options.storage.readSettings().dialogZoomFactor;
        },
        deliverZoomFactor,
        persistZoomFactor: persist
    });
    zoomState.initialize();

    return {
        readZoomFactor: zoomState.readZoomFactor,
        apply: function(value, applyOptions = {}): void {
            zoomState.apply(value, applyOptions.persist !== false);
        },
        execute: zoomState.execute,
        broadcast,
        postToWindow,
        handleKeyDown: function(input: unknown): boolean {
            const action = readShortcutAction(input);

            if (!action) {
                return false;
            }

            zoomState.execute(action);
            return true;
        }
    };
};
