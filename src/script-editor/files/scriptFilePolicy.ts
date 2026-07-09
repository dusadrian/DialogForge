export interface ScriptBrowserOpenFileType {
    description: string;
    accept: Record<string, string[]>;
}


export interface ScriptFilePolicy {
    openFileExtensions: string[];
    saveFileExtensions: string[];
    browserOpenFileTypes: ScriptBrowserOpenFileType[];
    blobType: string;
    openDialogLabel: string;
    saveDialogLabel: string;
}
