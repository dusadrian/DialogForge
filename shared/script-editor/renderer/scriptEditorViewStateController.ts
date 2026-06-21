import {
    formatScriptWindowTitle
} from "../view/scriptWindowTitle";
import type {
    ScriptDocument
} from "../state/scriptDocument";
import type {
    ScriptBreadcrumbView
} from "./scriptBreadcrumbView";
import type {
    ScriptOutlineController
} from "./scriptOutlineController";
import type {
    ScriptEditorTabController
} from "./scriptEditorTabController";
import type {
    ScriptToolbarLabels,
    ScriptToolbarView
} from "./scriptToolbarView";


export const createScriptEditorViewStateController = function(
    options: {
        document: Document;
        tabs: ScriptEditorTabController;
        outline: ScriptOutlineController;
        getToolbarView(): ScriptToolbarView | null;
        getBreadcrumbView(): ScriptBreadcrumbView | null;
        getToolbarLabels(): ScriptToolbarLabels;
        translate(key: string): string;
        publishDirtyState(state: {
            dirty: boolean;
            filePath: string;
            content: string;
        }): void;
    }
) {
    const reportDirtyState = function(): void {
        const active = options.tabs.getActiveTab();

        options.publishDirtyState({
            dirty: options.tabs.hasDirtyTabs(),
            filePath: String(active?.filePath || ""),
            content: String(active?.model?.getValue?.() || "")
        });
    };

    const updateTitle = function(): void {
        const active = options.tabs.getActiveTab();

        options.document.title = formatScriptWindowTitle(active, {
            untitled: options.translate("Untitled"),
            scriptEditor: options.translate("Script editor")
        });
    };

    const updatePathBar = function(): void {
        const active = options.tabs.getActiveTab();
        options.getBreadcrumbView()?.render(String(active?.filePath || ""));
    };

    const renderTabs = function(): void {
        options.tabs.refresh();
    };

    const updateOutlineState = function(): void {
        options.outline.refresh();
    };

    const scheduleOutlineUpdate = function(): void {
        options.outline.scheduleRefresh();
    };

    const updateToolbarState = function(): void {
        const active = options.tabs.getActiveTab();
        const symbols = active ? options.outline.getActiveSymbols() : [];

        options.getToolbarView()?.updateDocumentState(!!active, symbols.length);
        updateOutlineState();
        reportDirtyState();
    };

    const updateToolbarLabels = function(): void {
        options.getToolbarView()?.updateLabels(options.getToolbarLabels());
        updateOutlineState();
    };

    const activeTabChanged = function(): void {
        updatePathBar();
        updateTitle();
        updateToolbarState();
    };

    const documentContentChanged = function(
        changedTab: ScriptDocument,
        activeTabId: string
    ): void {
        if (changedTab.id === activeTabId) {
            updateTitle();
            updateToolbarState();
        } else {
            reportDirtyState();
        }

        renderTabs();

        if (changedTab.id === activeTabId) {
            scheduleOutlineUpdate();
        }
    };

    return {
        activeTabChanged,
        documentContentChanged,
        renderTabs,
        reportDirtyState,
        scheduleOutlineUpdate,
        updateOutlineState,
        updatePathBar,
        updateTitle,
        updateToolbarLabels,
        updateToolbarState
    };
};
