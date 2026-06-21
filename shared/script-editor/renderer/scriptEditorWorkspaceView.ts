import {
    createScriptBreadcrumbView,
    type ScriptBreadcrumbView
} from "./scriptBreadcrumbView";
import {
    bindGlobalScriptFileDropGuard,
    bindScriptFileDropHandling
} from "./scriptFileDropBindings";
import {
    createScriptEditorShell,
    type ScriptEditorShell
} from "./scriptEditorShell";


export interface ScriptWorkspaceTransport {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
}


export interface ScriptEditorWorkspaceViewOptions {
    root: HTMLElement;
    toolbar: HTMLElement;
    transport: ScriptWorkspaceTransport;
    getFilePath(file: File): string;
    openFile(filePath: string, preferCurrent: boolean): Promise<void>;
    insertCode(code: unknown): void;
}


export interface ScriptEditorWorkspaceView {
    shell: ScriptEditorShell;
    breadcrumbs: ScriptBreadcrumbView;
}


interface DirectoryResponse {
    status?: unknown;
    entries?: unknown;
}


interface OpenFileResponse {
    status?: unknown;
    filePath?: unknown;
    content?: unknown;
}


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


export const createScriptEditorWorkspaceView = function(
    options: ScriptEditorWorkspaceViewOptions
): ScriptEditorWorkspaceView {
    bindGlobalScriptFileDropGuard();

    const shell = createScriptEditorShell(options.toolbar);
    const breadcrumbs = createScriptBreadcrumbView(
        shell.pathText,
        shell.breadcrumbs,
        {
            listDirectory: async (directoryPath) => {
                const response = asRecord(
                    await options.transport.invoke(
                        "base-app:listScriptDirectory",
                        { dirPath: directoryPath }
                    )
                ) as DirectoryResponse;

                return (
                    response.status === "ready"
                    && Array.isArray(response.entries)
                )
                    ? response.entries
                    : [];
            },
            openFile: async (filePath) => {
                await options.openFile(filePath, true);
            }
        }
    );

    bindScriptFileDropHandling(
        shell.editorHost,
        {
            getFilePath: options.getFilePath,
            openScript: (filePath) => {
                void options.openFile(filePath, true);
            },
            insertCode: options.insertCode
        }
    );

    options.root.appendChild(shell.shell);

    return {
        shell,
        breadcrumbs
    };
};


export const openScriptFileThroughTransport = async function(
    transport: ScriptWorkspaceTransport,
    filePath: string
): Promise<{
    filePath: string;
    content: string;
} | null> {
    try {
        const response = asRecord(
            await transport.invoke(
                "base-app:openScriptFilePath",
                filePath
            )
        ) as OpenFileResponse;

        if (response.status !== "ready") {
            return null;
        }

        return {
            filePath: String(response.filePath || filePath),
            content: String(response.content || "")
        };
    } catch {
        return null;
    }
};
