import { normalizeScriptFilePath } from "./scriptEditorSession";


export interface ScriptTabPlacementInput {
    id: string;
    filePath: string;
    dirty: boolean;
}


export type ScriptTabOpenPlan =
    | { action: "activate-existing"; tabId: string }
    | { action: "reuse-active"; tabId: string }
    | { action: "create" };


export const createScriptTabOpenPlan = function(
    tabs: ScriptTabPlacementInput[],
    activeTabId: string,
    filePath: string,
    preferCurrent: boolean
): ScriptTabOpenPlan {
    const normalizedPath = normalizeScriptFilePath(filePath);
    const existing = tabs.find((tab) => {
        return normalizedPath
            && normalizeScriptFilePath(tab.filePath) === normalizedPath;
    });

    if (existing) {
        return {
            action: "activate-existing",
            tabId: existing.id
        };
    }

    const active = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

    if (preferCurrent && active && !active.filePath && !active.dirty) {
        return {
            action: "reuse-active",
            tabId: active.id
        };
    }

    return { action: "create" };
};


export const nextScriptTabAfterClose = function(
    tabs: ScriptTabPlacementInput[],
    closedIndex: number
): string {
    if (!tabs.length) return "";

    const nextIndex = Math.max(
        0,
        Math.min(Number(closedIndex) || 0, tabs.length - 1)
    );

    return tabs[nextIndex].id;
};
