export type ScriptSaveDecision = "save" | "dont-save" | "cancel";


export interface ScriptFileDocument {
    filePath: string;
    content: string;
}


export interface SavedScriptFile {
    filePath: string;
}


export interface ScriptFilePersistence {
    confirmSave(filePath: string): Promise<ScriptSaveDecision>;
    save(document: ScriptFileDocument, saveAs: boolean): Promise<SavedScriptFile | null>;
}


export interface ScriptFilePersistenceTransport {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
}


interface ScriptFileResponse {
    status?: unknown;
    filePath?: unknown;
}


interface ScriptSavePromptResponse {
    action?: unknown;
}


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


export const createScriptFilePersistence = function(
    transport: ScriptFilePersistenceTransport
): ScriptFilePersistence {
    const confirmSave = async function(
        filePath: string
    ): Promise<ScriptSaveDecision> {
        try {
            const response = asRecord(
                await transport.invoke(
                    "base-app:confirmScriptEditorSave",
                    { filePath: String(filePath || "") }
                )
            ) as ScriptSavePromptResponse;
            const action = String(response.action || "cancel");

            if (action === "save" || action === "dont-save") {
                return action;
            }
        } catch {}

        return "cancel";
    };

    const save = async function(
        document: ScriptFileDocument,
        saveAs: boolean
    ): Promise<SavedScriptFile | null> {
        const channel = saveAs || !document.filePath
            ? "base-app:saveScriptFileAs"
            : "base-app:saveScriptFile";
        const payload = channel === "base-app:saveScriptFileAs"
            ? {
                content: String(document.content || ""),
                filePath: String(document.filePath || "")
            }
            : {
                filePath: String(document.filePath || ""),
                content: String(document.content || "")
            };

        try {
            const response = asRecord(
                await transport.invoke(channel, payload)
            ) as ScriptFileResponse;

            if (response.status !== "saved") {
                return null;
            }

            return {
                filePath: String(response.filePath || document.filePath || "")
            };
        } catch {
            return null;
        }
    };

    return {
        confirmSave,
        save
    };
};


export interface DirtyScriptTab {
    id: string;
    filePath: string;
    dirty: boolean;
}


export interface DirtyScriptCloseBindings<Tab extends DirtyScriptTab> {
    activate(tab: Tab): void;
    confirm(tab: Tab): Promise<ScriptSaveDecision>;
    save(tab: Tab): Promise<boolean>;
    discard(tab: Tab): void;
}


export const resolveDirtyScriptTabsForClose = async function<
    Tab extends DirtyScriptTab
>(
    tabs: Tab[],
    bindings: DirtyScriptCloseBindings<Tab>
): Promise<boolean> {
    for (const tab of tabs) {
        if (!tab.dirty) {
            continue;
        }

        bindings.activate(tab);
        const decision = await bindings.confirm(tab);

        if (decision === "cancel") {
            return false;
        }

        if (decision === "save") {
            const saved = await bindings.save(tab);

            if (!saved) {
                return false;
            }

            continue;
        }

        bindings.discard(tab);
    }

    return true;
};
