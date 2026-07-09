import {
    clampBrowserNumber,
    type BrowserSurfaceDragOptions,
    type BrowserSurfaceResizeOptions
} from "./browserSurfaceGeometry";


export interface BrowserWorkbenchLayout {
    install(): void;
    resizeForWorkspace(openWorkspace: boolean): void;
    toggleWorkspacePane(): void;
}


export interface BrowserWorkbenchLayoutOptions {
    document: Document;
    installDraggableSurface(
        surface: HTMLElement | null,
        handle: HTMLElement | null,
        options: BrowserSurfaceDragOptions
    ): void;
    installResizableSurface(
        surface: HTMLElement | null,
        handles: HTMLElement[],
        options: BrowserSurfaceResizeOptions
    ): void;
    initialWorkspacePaneWidth?: number;
}


const readPaneWidth = function(
    element: Element | null | undefined,
    fallback: number
): number {
    const width = Number(element?.getBoundingClientRect?.().width || 0);

    return Number.isFinite(width) && width > 0
        ? width
        : fallback;
};


export const createBrowserWorkbenchLayout = function(
    options: BrowserWorkbenchLayoutOptions
): BrowserWorkbenchLayout {
    const documentRef = options.document;
    let workspacePaneWidth = options.initialWorkspacePaneWidth || 280;
    let consolePaneWidth = 0;

    const updateWorkspacePaneToggle = function(collapsed: boolean): void {
        const button = documentRef.getElementById("workspacePaneToggle");
        const icon = button?.querySelector(".codicon");
        const label = collapsed ? "Show Workspace" : "Hide Workspace";

        if (button) {
            button.dataset.tooltip = label;
            button.setAttribute("aria-label", label);
        }

        if (icon) {
            icon.classList.toggle("codicon-chevron-left", !collapsed);
            icon.classList.toggle("codicon-chevron-right", collapsed);
        }
    };

    const installDrag = function(): void {
        options.installDraggableSurface(
            documentRef.getElementById("webWorkbenchWindow"),
            documentRef.querySelector("#webWorkbenchWindow .web-workbench-window__titlebar"),
            {
                boundsElement: documentRef.getElementById("webDesktop"),
                mode: "absolute",
                storageKey: "workbench"
            }
        );
    };

    const installResize = function(): void {
        options.installResizableSurface(
            documentRef.getElementById("webWorkbenchWindow"),
            Array.from(
                documentRef.querySelectorAll("#webWorkbenchWindow .web-workbench-resize-handle")
            ),
            {
                boundsElement: documentRef.getElementById("webDesktop")
            }
        );
    };

    const resizeForWorkspace = function(openWorkspace: boolean): void {
        const desktop = documentRef.getElementById("webDesktop");
        const workbench = documentRef.getElementById("webWorkbenchWindow");
        const workbenchBody = workbench?.querySelector(".web-workbench-window__body");
        const consolePane = documentRef.querySelector(".web-console");
        const workspacePane = documentRef.querySelector(".web-workspace");

        if (!desktop || !workbench || !workbenchBody || !consolePane || !workspacePane) {
            documentRef.body.classList.toggle("web-workspace-collapsed", !openWorkspace);
            updateWorkspacePaneToggle(!openWorkspace);
            return;
        }

        const desktopRect = desktop.getBoundingClientRect();
        const workbenchRect = workbench.getBoundingClientRect();
        const workbenchBodyRect = workbenchBody.getBoundingClientRect();
        const workbenchChromeWidth = Math.max(0, workbenchRect.width - workbenchBodyRect.width);
        const workspaceWidth = openWorkspace
            ? workspacePaneWidth
            : readPaneWidth(workspacePane, workspacePaneWidth);
        const consoleWidth = readPaneWidth(consolePane, consolePaneWidth || 0);
        const relativeLeft = workbenchRect.left - desktopRect.left;

        if (!openWorkspace) {
            workspacePaneWidth = workspaceWidth;
            consolePaneWidth = consoleWidth;
            workbench.style.width = `${consoleWidth + workbenchChromeWidth}px`;
            documentRef.body.classList.add("web-workspace-collapsed");
            updateWorkspacePaneToggle(true);
            return;
        }

        const targetConsoleWidth = consolePaneWidth || consoleWidth;
        const targetWidth = targetConsoleWidth + workspaceWidth + workbenchChromeWidth;
        const clampedWidth = Math.min(targetWidth, desktopRect.width);
        const clampedLeft = clampBrowserNumber(
            relativeLeft,
            0,
            Math.max(0, desktopRect.width - clampedWidth)
        );

        workbench.style.left = `${clampedLeft}px`;
        workbench.style.width = `${clampedWidth}px`;
        documentRef.body.classList.remove("web-workspace-collapsed");
        updateWorkspacePaneToggle(false);
    };

    const toggleWorkspacePane = function(): void {
        const collapsed = documentRef.body.classList.contains("web-workspace-collapsed");

        resizeForWorkspace(collapsed);
    };

    return {
        install: function(): void {
            installDrag();
            installResize();
        },
        resizeForWorkspace,
        toggleWorkspacePane
    };
};
