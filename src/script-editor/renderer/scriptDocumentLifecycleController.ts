import type * as Monaco from "monaco-editor";
import {
    createScriptDocument,
    type ScriptDocument
} from "../state/scriptDocument";
import type {
    ScriptEditorTabController
} from "./scriptEditorTabController";


export interface ScriptDocumentCreationOptions {
    kind?: ScriptDocument["kind"];
    displayName?: string;
    filePath?: string;
    content?: string;
    dirty?: boolean;
    activate?: boolean;
}


export interface ScriptDocumentLifecycleControllerOptions {
    getMonaco(): typeof Monaco | null;
    tabs: ScriptEditorTabController;
    clearDiagnostics(tab: ScriptDocument): void;
    reportDirtyState(): void;
    updateTitle(): void;
    updateToolbarState(): void;
    renderTabs(): void;
    scheduleValidation(): void;
    scheduleOutlineUpdate(): void;
    updateOutlineState(): void;
}


export interface ScriptDocumentLifecycleController {
    create(options?: ScriptDocumentCreationOptions): ScriptDocument;
}


export const createScriptDocumentLifecycleController = function(
    options: ScriptDocumentLifecycleControllerOptions
): ScriptDocumentLifecycleController {
    const documentChanged = function(
        document: ScriptDocument
    ): void {
        const isActive = document.id === options.tabs.getActiveTabId();

        if (isActive) {
            options.updateTitle();
            options.updateToolbarState();
        }
        else {
            options.reportDirtyState();
        }

        options.renderTabs();

        if (isActive) {
            options.scheduleValidation();
            options.scheduleOutlineUpdate();
        }
    };
    const create = function(
        creationOptions: ScriptDocumentCreationOptions = {}
    ): ScriptDocument {
        const monaco = options.getMonaco();

        if (!monaco) {
            throw new Error(
                "Script editor Monaco runtime is not ready."
            );
        }

        const document = createScriptDocument(monaco, {
            kind: creationOptions.kind,
            displayName: String(creationOptions.displayName || ""),
            filePath: String(creationOptions.filePath || ""),
            content: String(creationOptions.content || ""),
            contentChanged: documentChanged
        });

        options.clearDiagnostics(document);
        document.dirty = creationOptions.kind === "live-participant"
            ? false
            : creationOptions.dirty === true;
        options.tabs.addTab(
            document,
            creationOptions.activate !== false
                || !options.tabs.getActiveTabId()
        );
        options.scheduleValidation();
        options.updateOutlineState();

        return document;
    };

    return {
        create
    };
};
