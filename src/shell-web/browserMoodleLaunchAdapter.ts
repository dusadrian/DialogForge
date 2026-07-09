import {
    ensureWebRDirectory
} from "../runtime/providers/webr/webRFileSystem";
import {
    createRMoodleLaunchDatasetCommand,
    createRMoodleLaunchDatasetPath,
    rMoodleLaunchScriptEditorCode
} from "../runtime/providers/r/launch/rMoodleLaunchPolicy";

export const browserMoodleLaunchScriptEditorCode = rMoodleLaunchScriptEditorCode;

interface BrowserMoodleLaunchRuntime {
    FS: {
        writeFile(path: string, bytes: Uint8Array): Promise<void> | void;
        mkdir(path: string): Promise<void> | void;
    };
    evalRVoid(command: string): Promise<void> | void;
}

export interface BrowserMoodleLaunchDatasetResult {
    loaded: boolean;
    datasetName: string;
}

export const readBrowserMoodleLaunchCode = function(
    windowRef: Window = window,
    documentRef: Document = document
): string {
    const currentUrl = new URL(windowRef.location.href);
    const launchCode = String(currentUrl.searchParams.get("k") || "").trim();

    if (!launchCode) {
        return "";
    }

    currentUrl.searchParams.delete("k");
    windowRef.history.replaceState(
        windowRef.history.state,
        documentRef.title,
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` || "/"
    );

    return launchCode;
};

export const loadBrowserMoodleLaunchDataset = async function(
    runtime: BrowserMoodleLaunchRuntime,
    launchCode: unknown
): Promise<BrowserMoodleLaunchDatasetResult> {
    const cleanCode = String(launchCode || "").trim();

    if (!cleanCode) {
        return {
            loaded: false,
            datasetName: ""
        };
    }

    const response = await fetch(
        `/api/launch/${encodeURIComponent(cleanCode)}/dataset.rds`
    );

    if (!response.ok) {
        throw new Error(`Launch dataset could not be loaded: HTTP ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const launchDatasetPath = createRMoodleLaunchDatasetPath(cleanCode);

    await ensureWebRDirectory(runtime, "/launch");
    await runtime.FS.writeFile(launchDatasetPath, bytes);
    await runtime.evalRVoid(createRMoodleLaunchDatasetCommand(launchDatasetPath));

    return {
        loaded: true,
        datasetName: "dataset"
    };
};
