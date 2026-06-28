export interface BrowserFileReference {
    id: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
    source: "upload" | "virtual";
}


export interface BrowserFileOpenResult {
    canceled: boolean;
    files: BrowserFileReference[];
    message: string;
}


export interface BrowserDownloadRequest {
    name: string;
    type?: string;
    content: BlobPart | BlobPart[];
}


export interface BrowserFileAdapter {
    createFileReference(file: File): BrowserFileReference;
    readText(file: File): Promise<string>;
    readBuffer(file: File): Promise<Uint8Array>;
    selectFiles(options?: { accept?: string; multiple?: boolean }): Promise<BrowserFileOpenResult>;
    download(request: BrowserDownloadRequest): Promise<BrowserFileReference>;
}


let fileSequence = 0;


const nextFileId = function(prefix: string): string {
    fileSequence += 1;

    return `${prefix}.${Date.now()}.${fileSequence}`;
};


const normalizeBlobParts = function(content: BlobPart | BlobPart[]): BlobPart[] {
    return Array.isArray(content) ? content : [content];
};


export const createBrowserFileAdapter = function(): BrowserFileAdapter {
    return {
        createFileReference: function(file: File): BrowserFileReference {
            return {
                id: nextFileId("upload"),
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,
                source: "upload"
            };
        },
        readText: function(file: File): Promise<string> {
            return file.text();
        },
        readBuffer: async function(file: File): Promise<Uint8Array> {
            return new Uint8Array(await file.arrayBuffer());
        },
        selectFiles: function(options = {}): Promise<BrowserFileOpenResult> {
            return new Promise((resolve) => {
                const input = document.createElement("input");

                input.type = "file";
                input.accept = options.accept || "";
                input.multiple = Boolean(options.multiple);
                input.style.display = "none";
                input.addEventListener("change", () => {
                    const files = Array.from(input.files || []);

                    input.remove();
                    resolve({
                        canceled: files.length === 0,
                        files: files.map(this.createFileReference),
                        message: files.length === 0
                            ? "File selection was canceled."
                            : "Browser file selection completed."
                    });
                }, { once: true });

                document.body.appendChild(input);
                input.click();
            });
        },
        download: async function(request: BrowserDownloadRequest): Promise<BrowserFileReference> {
            const blob = new Blob(
                normalizeBlobParts(request.content),
                { type: request.type || "application/octet-stream" }
            );
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            const name = String(request.name || "download.bin").trim() || "download.bin";

            anchor.href = url;
            anchor.download = name;
            anchor.style.display = "none";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);

            return {
                id: nextFileId("download"),
                name,
                size: blob.size,
                type: blob.type,
                lastModified: Date.now(),
                source: "virtual"
            };
        }
    };
};
