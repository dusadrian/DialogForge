import {
    disposeScriptDocument,
    setScriptDocumentContent,
    type ScriptDocument
} from "../state/scriptDocument";
import {
    createScriptTabOpenPlan,
    nextScriptTabAfterClose
} from "../state/scriptTabPlacement";
import { restoreScriptEditorSession } from "../state/scriptSessionRestore";
import type {
    ScriptFilePersistence
} from "../files/scriptFilePersistence";
import type {
    ScriptEditorTabController
} from "./scriptEditorTabController";


export interface ScriptEditorFileTransport {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
}


export interface ScriptEditorFileControllerOptions {
    transport: ScriptEditorFileTransport;
    persistence: ScriptFilePersistence;
    tabs: ScriptEditorTabController;
    createTab(options: {
        filePath?: string;
        content?: string;
        activate?: boolean;
    }): ScriptDocument;
    scheduleValidation(): void;
    updateOutline(): void;
    documentStateChanged(): void;
}


export interface ScriptEditorFileController {
    saveTab(tab: ScriptDocument, saveAs?: boolean): Promise<boolean>;
    saveCurrent(saveAs?: boolean): Promise<boolean>;
    openFile(
        filePath: string,
        content: string,
        preferCurrent?: boolean
    ): Promise<void>;
    closeTab(tabId: string): Promise<boolean>;
    restoreSession(): Promise<boolean>;
}


interface OpenScriptFileResponse {
    status?: unknown;
    filePath?: unknown;
    content?: unknown;
}


const asOpenScriptFileResponse = function(
    value: unknown
): OpenScriptFileResponse {
    return value && typeof value === "object"
        ? value as OpenScriptFileResponse
        : {};
};


export const createScriptEditorFileController = function(
    options: ScriptEditorFileControllerOptions
): ScriptEditorFileController {
    const saveTab = async function(
        tab: ScriptDocument,
        saveAs = false
    ): Promise<boolean> {
        const saved = await options.persistence.save(
            {
                filePath: tab.filePath,
                content: String(tab.model?.getValue?.() || "")
            },
            saveAs
        );

        if (!saved) {
            return false;
        }

        tab.filePath = saved.filePath;
        tab.dirty = false;
        options.tabs.refresh();
        options.documentStateChanged();
        options.tabs.persistSession();

        return true;
    };

    const saveCurrent = async function(
        saveAs = false
    ): Promise<boolean> {
        const activeTab = options.tabs.getActiveTab();

        if (!activeTab) {
            return false;
        }

        return saveTab(activeTab, saveAs);
    };

    const openFile = async function(
        filePath: string,
        content: string,
        preferCurrent = true
    ): Promise<void> {
        const tabs = options.tabs.getTabs();
        const plan = createScriptTabOpenPlan(
            tabs.map((tab) => ({
                id: tab.id,
                filePath: tab.filePath,
                dirty: tab.dirty
            })),
            options.tabs.getActiveTabId(),
            filePath,
            preferCurrent
        );

        if (plan.action === "activate-existing") {
            const existing = options.tabs.findTab(plan.tabId);

            if (!existing) {
                return;
            }

            options.tabs.activateTab(existing.id);
            options.scheduleValidation();
            options.updateOutline();

            return;
        }

        if (plan.action === "reuse-active") {
            const active = options.tabs.findTab(plan.tabId);

            if (!active) {
                return;
            }

            active.filePath = filePath;
            setScriptDocumentContent(active, content, false);
            options.tabs.refresh();
            options.documentStateChanged();
            options.scheduleValidation();

            return;
        }

        options.createTab({
            filePath,
            content,
            activate: true
        });
    };

    const closeTab = async function(tabId: string): Promise<boolean> {
        const tabs = options.tabs.getTabs();
        const tabIndex = tabs.findIndex((tab) => tab.id === tabId);

        if (tabIndex < 0) {
            return false;
        }

        const tab = tabs[tabIndex];

        if (tab.dirty) {
            const decision = await options.persistence.confirmSave(
                String(tab.filePath || "")
            );

            if (decision === "cancel") {
                return false;
            }

            if (decision === "save") {
                const saved = await saveTab(tab);

                if (!saved) {
                    return false;
                }
            }
        }

        disposeScriptDocument(tab);
        const wasActive = options.tabs.getActiveTabId() === tabId;
        options.tabs.removeTab(tabId);

        if (options.tabs.getTabs().length === 0) {
            options.createTab({
                filePath: "",
                content: "",
                activate: true
            });
            options.tabs.persistSession();

            return true;
        }

        if (wasActive) {
            const nextTabId = nextScriptTabAfterClose(
                options.tabs.getTabs().map((nextTab) => ({
                    id: nextTab.id,
                    filePath: nextTab.filePath,
                    dirty: nextTab.dirty
                })),
                tabIndex
            );

            if (nextTabId) {
                options.tabs.activateTab(nextTabId);
            }
        }
        else {
            options.tabs.refresh();
            options.documentStateChanged();
        }

        options.tabs.persistSession();

        return true;
    };

    const restoreSession = async function(): Promise<boolean> {
        return restoreScriptEditorSession(
            options.tabs.getSessionState(),
            {
                openFile: async (filePath) => {
                    try {
                        const response = asOpenScriptFileResponse(
                            await options.transport.invoke(
                                "base-app:openScriptFilePath",
                                filePath
                            )
                        );

                        if (response.status !== "ready") {
                            return null;
                        }

                        return {
                            filePath: String(
                                response.filePath || filePath
                            ),
                            content: String(response.content || "")
                        };
                    } catch {
                        return null;
                    }
                },
                openTab: async (file) => {
                    await openFile(
                        file.filePath,
                        file.content,
                        false
                    );
                },
                findTab: (filePath) => {
                    return options.tabs.findFileTab(filePath);
                },
                setScrollTop: (tab, scrollTop) => {
                    tab.scrollTop = scrollTop;
                },
                activate: (tab) => {
                    options.tabs.activateTab(tab.id);
                },
                applyActiveScroll: () => {
                    options.tabs.applyActiveScroll();
                }
            }
        );
    };

    return {
        saveTab,
        saveCurrent,
        openFile,
        closeTab,
        restoreSession
    };
};
