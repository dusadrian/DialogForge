export interface BrowserShellEventBindingsOptions {
    window: Window;
    document: Document;
    menuBar?: HTMLElement | null;
    routePreloadMessage(event: MessageEvent): Promise<unknown> | unknown;
    handlePlotViewerMessage(event: MessageEvent): Promise<unknown> | unknown;
    handleHelpViewerMessage(event: MessageEvent): Promise<unknown> | unknown;
    closeMenus(): void;
    handleKeyDown(event: KeyboardEvent): boolean | void;
    onError(error: unknown): void;
}


const reportAsyncError = function(
    action: Promise<unknown> | unknown,
    onError: (error: unknown) => void
): void {
    Promise.resolve(action).catch(onError);
};


export const installBrowserShellEventBindings = function(
    options: BrowserShellEventBindingsOptions
): void {
    options.window.addEventListener("message", (event) => {
        reportAsyncError(
            options.routePreloadMessage(event),
            options.onError
        );
        reportAsyncError(
            options.handlePlotViewerMessage(event),
            options.onError
        );
        reportAsyncError(
            options.handleHelpViewerMessage(event),
            options.onError
        );
    });

    options.document.addEventListener("click", (event) => {
        if (!options.menuBar?.contains(event.target as Node | null)) {
            options.closeMenus();
        }
    });

    options.document.addEventListener("keydown", (event) => {
        if (options.handleKeyDown(event)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, {
        capture: true
    });
};
