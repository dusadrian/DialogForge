export interface WorkspacePaneWindowExpansion {
    addedWidth: number;
    beforeX: number;
    beforeWidth: number;
    afterX: number;
    afterWidth: number;
}


export interface WorkspacePaneWindowRequest {
    visible: boolean;
    paneWidth?: number;
    restoreExistingExpansion?: boolean;
    syncExistingExpansion?: boolean;
}


export interface WorkspacePaneWindowResult {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    addedWidth?: number;
    delta?: number;
    restored?: boolean;
}


export const normalizeWorkspacePaneWindowExpansion = function(
    value: unknown
): WorkspacePaneWindowExpansion | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const input = value as Record<string, unknown>;
    const expansion = {
        addedWidth: Number(input.addedWidth),
        beforeX: Number(input.beforeX),
        beforeWidth: Number(input.beforeWidth),
        afterX: Number(input.afterX),
        afterWidth: Number(input.afterWidth)
    };

    if (
        !Number.isFinite(expansion.addedWidth) ||
        !Number.isFinite(expansion.beforeX) ||
        !Number.isFinite(expansion.beforeWidth) ||
        !Number.isFinite(expansion.afterX) ||
        !Number.isFinite(expansion.afterWidth) ||
        expansion.addedWidth <= 0
    ) {
        return null;
    }

    return expansion;
};
