import {
    normalizeScriptFilePath,
    type ScriptEditorSessionState
} from "./scriptEditorSession";


export interface RestoredScriptFile {
    filePath: string;
    content: string;
}


export interface ScriptSessionRestoreBindings<Tab> {
    openFile(filePath: string): Promise<RestoredScriptFile | null>;
    openTab(file: RestoredScriptFile): Promise<void>;
    findTab(filePath: string): Tab | null;
    setScrollTop(tab: Tab, scrollTop: number): void;
    activate(tab: Tab): void;
    applyActiveScroll(): void;
}


export const restoreScriptEditorSession = async function<Tab>(
    session: ScriptEditorSessionState,
    bindings: ScriptSessionRestoreBindings<Tab>
): Promise<boolean> {
    if (session.openFiles.length === 0) {
        return false;
    }

    let restoredCount = 0;

    for (const requestedPath of session.openFiles) {
        const filePath = String(requestedPath || "");

        if (!filePath) {
            continue;
        }

        const opened = await bindings.openFile(filePath);

        if (!opened) {
            continue;
        }

        await bindings.openTab(opened);
        const restoredPath = normalizeScriptFilePath(opened.filePath || filePath);
        const tab = bindings.findTab(restoredPath);

        if (tab) {
            const savedScrollTop = Number(session.scrollByFile[restoredPath]);

            if (Number.isFinite(savedScrollTop) && savedScrollTop >= 0) {
                bindings.setScrollTop(tab, savedScrollTop);
            }
        }

        restoredCount += 1;
    }

    if (restoredCount === 0) {
        return false;
    }

    const activeFilePath = normalizeScriptFilePath(session.activeFile);

    if (activeFilePath) {
        const activeTab = bindings.findTab(activeFilePath);

        if (activeTab) {
            bindings.activate(activeTab);
        }
    }

    bindings.applyActiveScroll();

    return true;
};
