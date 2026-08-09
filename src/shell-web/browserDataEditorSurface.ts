import {
    datasetEditorEventChannels
} from "../dataset-editor/datasetEditorIpc";
import type {
    BrowserFrameSurfaceController
} from "./browserFrameSurface";


export interface BrowserDataEditorInitPayload {
    appPath: string;
    datasetName: string;
    datasetNames: string[];
    i18n?: Record<string, string>;
    languageNS: string;
    variableColumnWidths: Record<string, number>;
}


export interface BrowserDataEditorSurfaceState {
    layer: HTMLElement | null;
    frame: HTMLIFrameElement | null;
}


export interface BrowserDataEditorSurfaceOptions {
    frameSurfaces: BrowserFrameSurfaceController;
    postEvent(
        targetWindow: Window | null | undefined,
        channel: string,
        ...args: unknown[]
    ): void;
    installActivation(surfaceId: string, element?: HTMLElement | null): void;
    activateSurface(surfaceId: string): void;
    readDatasetNames(): string[];
    createInitPayload(datasetName: string): BrowserDataEditorInitPayload;
    formatTitle(datasetName: string): string;
    onStateChanged?(state: BrowserDataEditorSurfaceState): void;
}


export interface BrowserDataEditorSurface {
    open(datasetName: string): Promise<void>;
    gotoVariable(datasetName: string, variableName: string): Promise<void>;
    gotoCase(datasetName: string, caseNumber: number): Promise<void>;
    state(): BrowserDataEditorSurfaceState;
}


const surfaceId = "dataEditor";
const framePath = "/src/base-app/pages/datasetEditor.html";
const frameVersion = String(Date.now());


const createFramePath = function(): string {
    return `${framePath}?v=${encodeURIComponent(frameVersion)}`;
};


export const createBrowserDataEditorSurface = function(
    options: BrowserDataEditorSurfaceOptions
): BrowserDataEditorSurface {
    let layer: HTMLElement | null = null;
    let frame: HTMLIFrameElement | null = null;
    let datasetName = "";

    const publishState = function(): void {
        options.onStateChanged?.({
            layer,
            frame
        });
    };

    const postOpenEvents = function(
        targetFrame: HTMLIFrameElement | null,
        name: string
    ): void {
        const cleanName = String(name || "").trim();

        options.postEvent(
            targetFrame?.contentWindow,
            datasetEditorEventChannels.init,
            options.createInitPayload(cleanName)
        );
        options.postEvent(
            targetFrame?.contentWindow,
            datasetEditorEventChannels.setDatasetList,
            { datasetNames: options.readDatasetNames() }
        );
        options.postEvent(
            targetFrame?.contentWindow,
            datasetEditorEventChannels.openDataset,
            { datasetName: cleanName }
        );
    };

    const open = async function(name: string): Promise<void> {
        const cleanName = String(name || "").trim();

        if (!cleanName) {
            return;
        }

        datasetName = cleanName;
        const title = options.formatTitle(cleanName);
        const result = options.frameSurfaces.open({
            id: surfaceId,
            title,
            src: createFramePath(),
            width: 980,
            height: 620,
            role: "region",
            ariaModal: false,
            frameTitle: title,
            storageKey: surfaceId,
            layerClass: "dialogforge-web-data-editor-layer",
            shellClass: "dialogforge-web-data-editor-window dialogforge-web-data-editor-window--shared",
            frameClass: "dialogforge-web-data-editor-frame",
            onClose: function() {
                if (layer === result.layer) {
                    layer = null;
                    frame = null;
                    publishState();
                }
            },
            onFrameLoad: function() {
                postOpenEvents(result.frame, datasetName);
            },
            onActivate: function() {
                options.activateSurface(surfaceId);
            }
        });

        layer = result.layer;
        frame = result.frame;
        publishState();

        if (result.created) {
            options.installActivation(surfaceId, result.layer);
        }
        else {
            postOpenEvents(result.frame, cleanName);
        }

        options.activateSurface(surfaceId);
        result.frame.focus();
    };

    return {
        open,
        gotoVariable: async function(name: string, variableName: string): Promise<void> {
            options.postEvent(
                frame?.contentWindow,
                datasetEditorEventChannels.gotoVariable,
                {
                    datasetName: name,
                    variableName
                }
            );
        },
        gotoCase: async function(name: string, caseNumber: number): Promise<void> {
            options.postEvent(
                frame?.contentWindow,
                datasetEditorEventChannels.gotoCase,
                {
                    datasetName: name,
                    caseNumber
                }
            );
        },
        state: function(): BrowserDataEditorSurfaceState {
            return {
                layer,
                frame
            };
        }
    };
};
