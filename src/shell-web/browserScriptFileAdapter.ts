import {
    readScriptBaseName
} from "../script-editor/files/scriptPath";
import {
    createCanceledScriptFileSelectionResult,
    createOpenedScriptFileResult,
    createSavedScriptFileResult,
    type ScriptFileResult
} from "../script-editor/files/scriptFileResult";
import {
    rScriptFilePolicy
} from "../runtime/providers/r/script/rScriptFilePolicy";

interface BrowserScriptWritableFile {
    write(data: string): Promise<void> | void;
    close(): Promise<void> | void;
}

interface BrowserScriptFileHandle {
    isSameEntry?(other: BrowserScriptFileHandle): Promise<boolean>;
    getFile(): Promise<File>;
    createWritable(): Promise<BrowserScriptWritableFile>;
}

interface BrowserScriptWindow extends Window {
    showOpenFilePicker?: (options: unknown) => Promise<BrowserScriptFileHandle[]>;
}

export interface BrowserScriptDocument {
    fileKey?: string;
    filePath?: string;
    content?: string;
}

export interface BrowserScriptFileAdapterBindings {
    getCurrentDocument(): BrowserScriptDocument;
}

export interface BrowserScriptFileAdapter {
    clearHandles(): void;
    openFile(): Promise<ScriptFileResult>;
    saveFile(input?: BrowserScriptDocument, saveAs?: boolean): Promise<ScriptFileResult>;
}

const saveScriptDocumentAsDownload = function(
    documentRef: Document,
    urlRef: typeof URL,
    fileName: string,
    text: string
): void {
    const blob = new Blob([text], {
        type: rScriptFilePolicy.blobType
    });
    const url = urlRef.createObjectURL(blob);
    const anchor = documentRef.createElement("a");

    anchor.href = url;
    anchor.download = fileName || "Untitled.R";
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
        urlRef.revokeObjectURL(url);
    }, 1000);
};


const createScriptFileAcceptList = function(): string {
    return rScriptFilePolicy.browserOpenFileTypes
        .flatMap((type) => {
            return Object.values(type.accept || {});
        })
        .flat()
        .join(",");
};


const openScriptFileWithInput = function(
    documentRef: Document
): Promise<File | null> {
    return new Promise((resolve) => {
        const input = documentRef.createElement("input");

        input.type = "file";
        input.accept = createScriptFileAcceptList();
        input.style.position = "fixed";
        input.style.left = "-10000px";
        input.style.top = "0";
        input.addEventListener("change", () => {
            const file = input.files && input.files[0];

            input.remove();
            resolve(file || null);
        }, { once: true });
        input.addEventListener("cancel", () => {
            input.remove();
            resolve(null);
        }, { once: true });
        documentRef.body.appendChild(input);
        input.click();
    });
};

export const createBrowserScriptFileAdapter = function(
    bindings: BrowserScriptFileAdapterBindings,
    windowRef: BrowserScriptWindow = window,
    documentRef: Document = document,
    urlRef: typeof URL = URL
): BrowserScriptFileAdapter {
    const handles = new Map<string, BrowserScriptFileHandle>();

    return {
        clearHandles() {
            handles.clear();
        },
        async openFile() {
            if (windowRef.showOpenFilePicker) {
                try {
                    const selectedHandles = await windowRef.showOpenFilePicker({
                        multiple: false,
                        types: rScriptFilePolicy.browserOpenFileTypes
                    });
                    const selectedHandle = selectedHandles[0] || null;
                    const file = selectedHandle ? await selectedHandle.getFile() : null;

                    if (!file || !selectedHandle) {
                        return createCanceledScriptFileSelectionResult();
                    }

                    const result = createOpenedScriptFileResult(file.name, await file.text());
                    for (const [key, handle] of handles) {
                        if (selectedHandle === handle || await selectedHandle.isSameEntry?.(handle)) {
                            return { ...result, fileKey: key };
                        }
                    }

                    const fileKey = crypto.randomUUID();
                    handles.set(fileKey, selectedHandle);
                    return { ...result, fileKey };
                }
                catch (error) {
                    if (error instanceof DOMException && error.name === "AbortError") {
                        return createCanceledScriptFileSelectionResult();
                    }

                    throw error;
                }
            }

            const file = await openScriptFileWithInput(documentRef);

            if (!file) {
                return createCanceledScriptFileSelectionResult();
            }

            return {
                ...createOpenedScriptFileResult(file.name, await file.text()),
                fileKey: crypto.randomUUID()
            };
        },

        async saveFile(input = {}, saveAs = false) {
            const current = bindings.getCurrentDocument();
            const filePath = readScriptBaseName(
                input.filePath || current.filePath || "Untitled.R"
            );
            const content = String(input.content ?? current.content ?? "");

            const fileHandle = input.fileKey ? handles.get(input.fileKey) : undefined;

            if (!saveAs && fileHandle) {
                const writable = await fileHandle.createWritable();

                await writable.write(content);
                await writable.close();

                return createSavedScriptFileResult(filePath, content);
            }

            saveScriptDocumentAsDownload(documentRef, urlRef, filePath, content);

            return createSavedScriptFileResult(filePath, content);
        }
    };
};
