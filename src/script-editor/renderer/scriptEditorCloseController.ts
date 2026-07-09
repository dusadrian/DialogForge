import type {
    ScriptDocument
} from "../state/scriptDocument";
import type {
    ScriptFilePersistence
} from "../files/scriptFilePersistence";
import {
    createScriptEditorCloseCoordinator,
    type ScriptEditorCloseTransport
} from "./scriptEditorCloseCoordinator";


export const createScriptEditorCloseController = function(
    options: {
        transport: ScriptEditorCloseTransport;
        persistence: ScriptFilePersistence;
        getTabs(): ScriptDocument[];
        activate(tabId: string): void;
        save(tab: ScriptDocument): Promise<boolean>;
        refreshDocumentState(): void;
    }
) {
    return createScriptEditorCloseCoordinator({
        transport: options.transport,
        persistence: options.persistence,
        getTabs: options.getTabs,
        activate: (tab) => {
            options.activate(tab.id);
        },
        save: options.save,
        refreshDocumentState: options.refreshDocumentState
    });
};
