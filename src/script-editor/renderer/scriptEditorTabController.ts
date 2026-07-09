import type * as Monaco from "monaco-editor";
import type { ScriptDocument } from "../state/scriptDocument";
import {
    createScriptEditorSessionKey,
    createScriptEditorSessionState,
    normalizeScriptFilePath,
    parseScriptEditorSessionState,
    type ScriptEditorSessionState
} from "../state/scriptEditorSession";
import { renderScriptTabStrip } from "../view/scriptTabStrip";


export interface ScriptEditorTabLabels {
    untitled: string;
    closeTab: string;
}


export interface ScriptEditorTabControllerOptions {
    getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
    getLabels(): ScriptEditorTabLabels;
    activeTabChanged(tab: ScriptDocument): void;
    tabStateChanged(): void;
}


export interface ScriptEditorTabController {
    setHost(host: HTMLElement): void;
    setCloseHandler(closeTab: (tabId: string) => void): void;
    setSessionScope(appPath: unknown): void;
    getSessionState(): ScriptEditorSessionState;
    getTabs(): ScriptDocument[];
    getActiveTab(): ScriptDocument | null;
    getActiveTabId(): string;
    hasDirtyTabs(): boolean;
    findTab(tabId: string): ScriptDocument | null;
    findFileTab(filePath: string): ScriptDocument | null;
    addTab(tab: ScriptDocument, activate: boolean): void;
    activateTab(tabId: string): boolean;
    removeTab(tabId: string): ScriptDocument | null;
    refresh(): void;
    persistSession(): void;
    scheduleSessionPersistence(): void;
    applyActiveScroll(): void;
}


const readEditorScrollTop = function(
    editor: Monaco.editor.IStandaloneCodeEditor | null
): number {
    try {
        const scrollTop = Number(editor?.getScrollTop?.() || 0);

        return Number.isFinite(scrollTop) && scrollTop >= 0
            ? scrollTop
            : 0;
    } catch {
        return 0;
    }
};


const applyEditorScrollTop = function(
    editor: Monaco.editor.IStandaloneCodeEditor | null,
    value: unknown
): void {
    const scrollTop = Number(value);

    if (!editor || !Number.isFinite(scrollTop) || scrollTop < 0) {
        return;
    }

    try {
        editor.setScrollTop(scrollTop);
    } catch {}
};


export const createScriptEditorTabController = function(
    options: ScriptEditorTabControllerOptions
): ScriptEditorTabController {
    const tabs: ScriptDocument[] = [];
    let host: HTMLElement | null = null;
    let activeTabId = "";
    let sessionStorageKey = "app.scriptEditor.tabs.v1";
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    let closeHandler = function(_tabId: string): void {};

    const getActiveTab = function(): ScriptDocument | null {
        return tabs.find((tab) => tab.id === activeTabId)
            || tabs[0]
            || null;
    };

    const captureActiveScroll = function(): void {
        const activeTab = getActiveTab();

        if (!activeTab) {
            return;
        }

        activeTab.scrollTop = readEditorScrollTop(options.getEditor());
    };

    const persistSession = function(): void {
        try {
            captureActiveScroll();

            const session = createScriptEditorSessionState(
                tabs.map((tab) => ({
                    filePath: tab.filePath,
                    scrollTop: tab.scrollTop
                })),
                String(getActiveTab()?.filePath || "")
            );

            if (session.openFiles.length === 0) {
                localStorage.removeItem(sessionStorageKey);
                return;
            }

            localStorage.setItem(
                sessionStorageKey,
                JSON.stringify(session)
            );
        } catch {}
    };

    const scheduleSessionPersistence = function(): void {
        if (persistTimer) {
            clearTimeout(persistTimer);
        }

        persistTimer = setTimeout(() => {
            persistTimer = null;
            persistSession();
        }, 180);
    };

    const reorderTabs = function(
        sourceTabId: string,
        targetTabId: string,
        before: boolean
    ): void {
        const sourceIndex = tabs.findIndex((tab) => tab.id === sourceTabId);
        const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);

        if (sourceIndex < 0 || targetIndex < 0) {
            return;
        }

        const [movedTab] = tabs.splice(sourceIndex, 1);
        let insertIndex = before ? targetIndex : targetIndex + 1;

        if (sourceIndex < targetIndex) {
            insertIndex -= 1;
        }

        insertIndex = Math.max(0, Math.min(tabs.length, insertIndex));
        tabs.splice(insertIndex, 0, movedTab);
        controller.refresh();
        options.tabStateChanged();
    };

    const controller: ScriptEditorTabController = {
        setHost(nextHost) {
            host = nextHost;
        },

        setCloseHandler(nextCloseHandler) {
            closeHandler = nextCloseHandler;
        },

        setSessionScope(appPath) {
            sessionStorageKey = createScriptEditorSessionKey(appPath);
        },

        getSessionState() {
            try {
                return parseScriptEditorSessionState(
                    localStorage.getItem(sessionStorageKey)
                );
            } catch {
                return parseScriptEditorSessionState(null);
            }
        },

        getTabs() {
            return tabs;
        },

        getActiveTab,

        getActiveTabId() {
            return activeTabId;
        },

        hasDirtyTabs() {
            return tabs.some((tab) => tab.dirty);
        },

        findTab(tabId) {
            return tabs.find((tab) => tab.id === tabId) || null;
        },

        findFileTab(filePath) {
            const normalizedPath = normalizeScriptFilePath(filePath);

            return tabs.find((tab) => (
                normalizeScriptFilePath(tab.filePath) === normalizedPath
            )) || null;
        },

        addTab(tab, activate) {
            tabs.push(tab);

            if (activate || !activeTabId) {
                activeTabId = tab.id;
                options.getEditor()?.setModel(tab.model);
            }

            controller.refresh();
            options.tabStateChanged();
        },

        activateTab(tabId) {
            const editor = options.getEditor();
            const nextTab = tabs.find((tab) => tab.id === tabId);

            if (!editor || !nextTab) {
                return false;
            }

            captureActiveScroll();
            activeTabId = nextTab.id;
            editor.setModel(nextTab.model);
            applyEditorScrollTop(editor, nextTab.scrollTop);

            try {
                editor.focus();
            } catch {}

            controller.refresh();
            options.activeTabChanged(nextTab);

            return true;
        },

        removeTab(tabId) {
            const tabIndex = tabs.findIndex((tab) => tab.id === tabId);

            if (tabIndex < 0) {
                return null;
            }

            const [removedTab] = tabs.splice(tabIndex, 1);

            if (activeTabId === tabId) {
                activeTabId = "";
            }

            return removedTab;
        },

        refresh() {
            if (host) {
                renderScriptTabStrip(
                    host,
                    tabs.map((tab) => ({
                        id: tab.id,
                        filePath: tab.filePath,
                        dirty: tab.dirty
                    })),
                    activeTabId,
                    options.getLabels(),
                    {
                        activate: (tabId) => {
                            controller.activateTab(tabId);
                        },
                        close: closeHandler,
                        reorder: reorderTabs
                    }
                );
            }

            persistSession();
        },

        persistSession,

        scheduleSessionPersistence,

        applyActiveScroll() {
            applyEditorScrollTop(
                options.getEditor(),
                getActiveTab()?.scrollTop
            );
        }
    };

    return controller;
};
