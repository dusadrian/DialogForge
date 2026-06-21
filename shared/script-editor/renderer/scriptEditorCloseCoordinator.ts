import type { ScriptDocument } from "../state/scriptDocument";
import {
    resolveDirtyScriptTabsForClose,
    type ScriptFilePersistence
} from "../files/scriptFilePersistence";
import {
    scriptEditorEventChannels
} from "../scriptEditorIpc";


export interface ScriptEditorCloseTransport {
    send(channel: string, payload?: unknown): void;
}


export interface ScriptEditorCloseCoordinatorOptions {
    transport: ScriptEditorCloseTransport;
    persistence: ScriptFilePersistence;
    getTabs: () => ScriptDocument[];
    activate: (tab: ScriptDocument) => void;
    save: (tab: ScriptDocument) => Promise<boolean>;
    refreshDocumentState: () => void;
}


export interface ScriptEditorCloseCoordinator {
    resolveForWindowClose(requestId: string): Promise<void>;
}


export const createScriptEditorCloseCoordinator = function(
    options: ScriptEditorCloseCoordinatorOptions
): ScriptEditorCloseCoordinator {
    const sendResult = function(
        requestId: string,
        ok: boolean
    ): void {
        options.transport.send(
            scriptEditorEventChannels.closeSaveResult,
            {
                requestId,
                ok
            }
        );
    };

    const resolveForWindowClose = async function(
        requestId: string
    ): Promise<void> {
        const resolved = await resolveDirtyScriptTabsForClose(
            options.getTabs().slice(),
            {
                activate: options.activate,
                confirm: (tab) => {
                    return options.persistence.confirmSave(tab.filePath);
                },
                save: options.save,
                discard: (tab) => {
                    tab.dirty = false;
                }
            }
        );

        if (!resolved) {
            sendResult(requestId, false);
            return;
        }

        options.refreshDocumentState();
        sendResult(requestId, true);
    };

    return {
        resolveForWindowClose
    };
};
