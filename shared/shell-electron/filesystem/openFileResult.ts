export interface OpenFileDialogResult {
    canceled: boolean;
    filePaths: string[];
}


export interface OpenFileResult {
    status: string;
    canceled: boolean;
    filePath: string;
    filePaths: string[];
    message: string;
}

export interface PathInfoResult {
    status: string;
    path: string;
    kind: "file" | "directory" | "missing" | "unknown";
    extension: string;
    basename: string;
    message: string;
}


export const createOpenFileResult = function(input: Partial<OpenFileDialogResult>): OpenFileResult {
    const filePaths = input.filePaths || [];

    return {
        status: input.canceled ? "canceled" : "selected",
        canceled: Boolean(input.canceled),
        filePath: filePaths.length > 0 ? filePaths[0] : "",
        filePaths,
        message: input.canceled ? "File selection was canceled." : "File selected."
    };
};


export const createPathInfoResult = function(input: Partial<PathInfoResult>): PathInfoResult {
    return {
        status: input.status || "unknown",
        path: input.path || "",
        kind: input.kind || "unknown",
        extension: input.extension || "",
        basename: input.basename || "",
        message: input.message || ""
    };
};


export const createOpenDirectoryResult = function(input: Partial<OpenFileDialogResult>): OpenFileResult {
    const filePaths = input.filePaths || [];

    return {
        status: input.canceled ? "canceled" : "selected",
        canceled: Boolean(input.canceled),
        filePath: filePaths.length > 0 ? filePaths[0] : "",
        filePaths,
        message: input.canceled ? "Directory selection was canceled." : "Directory selected."
    };
};
