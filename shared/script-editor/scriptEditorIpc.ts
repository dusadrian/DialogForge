import type {
    TranscriptEvent
} from "../runtime/provider-contract/runtimeProvider";
import type {
    ScriptFileResult
} from "../shell-electron/filesystem/scriptFileResult";
import type {
    ScriptDirectoryResult
} from "./main-process/scriptFileSystemController";
import {
    sendTypedIpcCommand,
    type IpcSendTransport
} from "../core/ipc/typedIpc";


export const scriptEditorIpcChannels = {
    checkFragment: "base-app:checkScriptFragment",
    runCodeBatch: "base-app:runScriptCodeBatch",
    getDocument: "base-app:getScriptEditorDocument",
    openEditor: "base-app:openScriptEditor",
    insertCode: "base-app:insertScriptEditorCode",
    openFile: "base-app:openScriptFile",
    confirmSave: "base-app:confirmScriptEditorSave",
    openFilePath: "base-app:openScriptFilePath",
    listDirectory: "base-app:listScriptDirectory",
    openFileInEditor: "base-app:openScriptFileInEditor",
    openFilePathInEditor: "base-app:openScriptFilePathInEditor",
    saveFile: "base-app:saveScriptFile",
    saveFileAs: "base-app:saveScriptFileAs"
} as const;


export const scriptEditorEventChannels = {
    insertCode: "scriptEditor:insertCode",
    updateDirtyState: "base-app:updateScriptEditorDirtyState",
    rendererReady: "base-app:script-editor-ready",
    closeSaveResult: "base-app:script-editor-close-save-result",
    initialize: "base-app:script-editor-init",
    publishInsertCode: "base-app:script-editor-insert-code",
    publishOpenFile: "base-app:script-editor-open-file",
    requestSaveForClose: "base-app:script-editor-request-save-for-close",
    sessionState: "base-app:script-editor-session-state",
    runtimeExecuted: "base-app:script-editor-runtime-executed",
    commandBoundary: "base-app:script-editor-command-boundary"
} as const;


interface ScriptEditorCommands {
    "base-app:updateScriptEditorDirtyState": [{
        dirty?: boolean;
        filePath?: string;
        content?: string;
    }];
    "base-app:script-editor-ready": [];
    "base-app:script-editor-close-save-result": [{
        requestId?: string;
        ok?: boolean;
    }];
}


export type ScriptEditorIpcChannel =
    typeof scriptEditorIpcChannels[
        keyof typeof scriptEditorIpcChannels
    ];


export interface ScriptFragmentCheckResult {
    ok: boolean;
    state: string;
    message?: string;
}


export interface ScriptCodeBatchResult {
    status: string;
    events: TranscriptEvent[];
}


export interface ScriptEditorDocumentState {
    filePath: string;
    content: string;
    message: string;
}


export interface ScriptEditorInsertResult {
    status: string;
    message: string;
}


interface ScriptEditorIpcInputs {
    "base-app:checkScriptFragment": { code?: string };
    "base-app:runScriptCodeBatch": { chunks?: string[] };
    "base-app:getScriptEditorDocument": undefined;
    "base-app:openScriptEditor": undefined;
    "base-app:insertScriptEditorCode": { code?: string };
    "base-app:openScriptFile": undefined;
    "base-app:confirmScriptEditorSave": { filePath?: string };
    "base-app:openScriptFilePath": string;
    "base-app:listScriptDirectory": { dirPath?: string };
    "base-app:openScriptFileInEditor": undefined;
    "base-app:openScriptFilePathInEditor": string;
    "base-app:saveScriptFile": { filePath?: string; content?: string };
    "base-app:saveScriptFileAs": { filePath?: string; content?: string };
}


interface ScriptEditorIpcResults {
    "base-app:checkScriptFragment": ScriptFragmentCheckResult;
    "base-app:runScriptCodeBatch": ScriptCodeBatchResult;
    "base-app:getScriptEditorDocument": ScriptEditorDocumentState;
    "base-app:openScriptEditor": ScriptFileResult;
    "base-app:insertScriptEditorCode": ScriptEditorInsertResult;
    "base-app:openScriptFile": ScriptFileResult;
    "base-app:confirmScriptEditorSave": { action: string };
    "base-app:openScriptFilePath": ScriptFileResult;
    "base-app:listScriptDirectory": ScriptDirectoryResult;
    "base-app:openScriptFileInEditor": ScriptFileResult;
    "base-app:openScriptFilePathInEditor": ScriptFileResult;
    "base-app:saveScriptFile": ScriptFileResult;
    "base-app:saveScriptFileAs": ScriptFileResult;
}


interface InvokeTransport {
    invoke(
        channel: string,
        ...args: unknown[]
    ): Promise<unknown>;
}


type InvokeArguments<
    Channel extends ScriptEditorIpcChannel
> = ScriptEditorIpcInputs[Channel] extends undefined
    ? []
    : [ScriptEditorIpcInputs[Channel]];


export const invokeScriptEditorRoute = function<
    Channel extends ScriptEditorIpcChannel
>(
    transport: InvokeTransport,
    channel: Channel,
    ...args: InvokeArguments<Channel>
): Promise<ScriptEditorIpcResults[Channel]> {
    return transport.invoke(
        channel,
        ...args
    ) as Promise<ScriptEditorIpcResults[Channel]>;
};


export const sendScriptEditorCommand = function<
    Channel extends keyof ScriptEditorCommands & string
>(
    transport: IpcSendTransport,
    channel: Channel,
    ...args: ScriptEditorCommands[Channel]
): void {
    sendTypedIpcCommand<ScriptEditorCommands[Channel]>(
        transport,
        channel,
        ...args
    );
};
