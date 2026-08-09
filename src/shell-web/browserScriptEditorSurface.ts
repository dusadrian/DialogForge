import {
    scriptEditorEventChannels
} from "../script-editor/scriptEditorIpc";
import {
    createScriptEditorCloseSaveCoordinator
} from "../script-editor/scriptEditorCloseSaveCoordinator";
import type {
    BrowserFrameSurfaceController,
    BrowserFrameSurfaceResult
} from "./browserFrameSurface";


export interface BrowserScriptEditorDocument {
    filePath: string;
    content: string;
}


export interface BrowserScriptEditorSurfaceState {
    layer: HTMLElement | null;
    frame: HTMLIFrameElement | null;
}


export interface BrowserScriptEditorSurfaceOptions {
    frameSurfaces: BrowserFrameSurfaceController;
    postEvent(
        targetWindow: Window | null | undefined,
        channel: string,
        ...args: unknown[]
    ): void;
    installActivation(surfaceId: string, element?: HTMLElement | null): void;
    activateSurface(surfaceId: string): void;
    readDocument(): BrowserScriptEditorDocument;
    getI18n(): Record<string, string>;
    getLocale(): string;
    formatTitle(): string;
    readLiveScriptJoinText?(): string;
    shutdownLiveSessions?(): Promise<void>;
    onStateChanged?(state: BrowserScriptEditorSurfaceState): void;
    onError?(error: unknown): void;
}


export interface BrowserScriptEditorSurface {
    open(initialCode?: string): Promise<void>;
    openDocument(document: BrowserScriptEditorDocument): Promise<void>;
    handleBrowserReady(): void;
    resolveCloseRequest(input: unknown): void;
    resolveLiveSessionShutdownRequest(input: unknown): void;
    state(): BrowserScriptEditorSurfaceState;
}


const surfaceId = "scriptEditor";
const framePath = "/src/base-app/pages/scriptEditor.html";


const readCloseRequestId = function(input: unknown): string {
    return String((input as { requestId?: unknown } | null)?.requestId || "");
};


const readCloseResult = function(input: unknown): boolean {
    return (input as { ok?: unknown } | null)?.ok === true;
};


export const createBrowserScriptEditorSurface = function(
    options: BrowserScriptEditorSurfaceOptions
): BrowserScriptEditorSurface {
    let layer: HTMLElement | null = null;
    let frame: HTMLIFrameElement | null = null;
    let initializedFrame: HTMLIFrameElement | null = null;
    let readyFrame: HTMLIFrameElement | null = null;
    let pendingInitialCode = "";
    let pendingDocument: BrowserScriptEditorDocument | null = null;
    const closeSaveCoordinator = createScriptEditorCloseSaveCoordinator();
    const liveSessionShutdownCoordinator = createScriptEditorCloseSaveCoordinator({
        timeoutMs: 5000,
        createRequestId: function(): string {
            return "script-live-shutdown-" + Date.now() + "-" +
                Math.random().toString(16).slice(2, 8);
        }
    });

    const publishState = function(): void {
        options.onStateChanged?.({
            layer,
            frame
        });
    };

    const initPayload = function() {
        const document = options.readDocument();

        return {
            appPath: "/",
            i18n: options.getI18n(),
            languageNS: options.getLocale(),
            filePath: document.filePath || "Untitled.R",
            content: String(document.content || ""),
            terminalSettings: {},
            liveScriptJoinText: options.readLiveScriptJoinText?.() || ""
        };
    };

    const postInit = function(targetFrame: HTMLIFrameElement | null): void {
        options.postEvent(
            targetFrame?.contentWindow,
            "base-app:script-editor-init",
            initPayload()
        );
    };

    const postInitOnce = function(targetFrame: HTMLIFrameElement | null): void {
        if (!targetFrame || initializedFrame === targetFrame) {
            return;
        }

        initializedFrame = targetFrame;
        postInit(targetFrame);
    };

    const postInsertCode = function(
        targetFrame: HTMLIFrameElement | null,
        code: unknown
    ): void {
        const text = String(code || "");

        if (!text.trim()) {
            return;
        }

        options.postEvent(
            targetFrame?.contentWindow,
            scriptEditorEventChannels.publishInsertCode,
            text
        );
    };

    const postOpenDocument = function(
        targetFrame: HTMLIFrameElement | null,
        document: BrowserScriptEditorDocument
    ): void {
        options.postEvent(
            targetFrame?.contentWindow,
            scriptEditorEventChannels.publishOpenFile,
            {
                filePath: document.filePath,
                content: document.content
            }
        );
    };

    const flushPendingContent = function(targetFrame: HTMLIFrameElement | null): void {
        if (!targetFrame || readyFrame !== targetFrame) {
            return;
        }
        if (pendingDocument) {
            postOpenDocument(targetFrame, pendingDocument);
            pendingDocument = null;
        }
        else {
            postInsertCode(targetFrame, pendingInitialCode);
        }

        pendingInitialCode = "";
    };

    const resolveCloseRequest = function(input: unknown): void {
        closeSaveCoordinator.resolve(
            readCloseRequestId(input),
            readCloseResult(input)
        );
    };

    const requestClose = function(): Promise<boolean> {
        if (!frame) {
            return Promise.resolve(true);
        }

        return closeSaveCoordinator.request((requestId) => {
            options.postEvent(
                frame?.contentWindow,
                scriptEditorEventChannels.requestSaveForClose,
                requestId
            );
        });
    };

    const resolveLiveSessionShutdownRequest = function(input: unknown): void {
        liveSessionShutdownCoordinator.resolve(
            readCloseRequestId(input),
            readCloseResult(input)
        );
    };

    const requestLiveSessionShutdown = function(): Promise<boolean> {
        if (!frame) {
            return Promise.resolve(true);
        }

        return liveSessionShutdownCoordinator.request((requestId) => {
            options.postEvent(
                frame?.contentWindow,
                scriptEditorEventChannels.requestLiveSessionShutdown,
                requestId
            );
        });
    };

    const installCloseGuard = function(result: BrowserFrameSurfaceResult): void {
        if (result.close.dataset.scriptEditorCloseGuard === "true") {
            return;
        }

        result.close.dataset.scriptEditorCloseGuard = "true";
        result.close.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();

            requestClose().then(async (ok) => {
                if (!ok) {
                    return;
                }

                await requestLiveSessionShutdown();
                await options.shutdownLiveSessions?.();
                options.frameSurfaces.close(surfaceId);
            }).catch((error) => {
                options.onError?.(error);
            });
        }, true);
    };

    const open = async function(initialCode = ""): Promise<void> {
        pendingInitialCode = pendingDocument ? "" : initialCode;
        const title = options.formatTitle();
        const result = options.frameSurfaces.open({
            id: surfaceId,
            title,
            src: framePath,
            width: 920,
            height: 580,
            role: "region",
            ariaModal: false,
            frameTitle: title,
            storageKey: surfaceId,
            layerClass: "dialogforge-web-script-editor-layer",
            shellClass: "dialogforge-web-script-editor-window dialogforge-web-script-editor-window--shared",
            frameClass: "dialogforge-web-script-editor-frame",
            onClose: function() {
                if (layer === result.layer) {
                    layer = null;
                    frame = null;
                    initializedFrame = null;
                    readyFrame = null;
                    pendingInitialCode = "";
                    pendingDocument = null;
                    publishState();
                }
            },
            onFrameLoad: function() {
                if (initializedFrame === result.frame) {
                    initializedFrame = null;
                }
                if (readyFrame === result.frame) {
                    readyFrame = null;
                }
                postInitOnce(result.frame);
            },
            onActivate: function() {
                options.activateSurface(surfaceId);
            }
        });

        layer = result.layer;
        frame = result.frame;
        publishState();
        installCloseGuard(result);

        if (result.created) {
            options.installActivation(surfaceId, result.layer);
        }
        else {
            pendingInitialCode = initialCode;
            postInitOnce(result.frame);
            flushPendingContent(result.frame);
        }

        options.activateSurface(surfaceId);
        result.frame.focus();
    };

    const openDocument = async function(
        document: BrowserScriptEditorDocument
    ): Promise<void> {
        pendingDocument = document;
        await open();
        flushPendingContent(frame);
    };

    return {
        open,
        openDocument,
        handleBrowserReady: function(): void {
            postInitOnce(frame);
            readyFrame = frame;
            flushPendingContent(frame);
        },
        resolveCloseRequest,
        resolveLiveSessionShutdownRequest,
        state: function(): BrowserScriptEditorSurfaceState {
            return {
                layer,
                frame
            };
        }
    };
};
