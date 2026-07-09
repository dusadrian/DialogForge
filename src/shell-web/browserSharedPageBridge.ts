export interface BrowserSharedPageBridgeOptions {
    openHelpCommandUrl(value: unknown): Promise<unknown> | unknown;
    fetchHelpPage(value: unknown): Promise<unknown> | unknown;
    runHelpExample(input: unknown): Promise<unknown> | unknown;
    selectImportFile(): Promise<unknown> | unknown;
    planImportFile(input: unknown): Promise<unknown> | unknown;
    previewImportFile(input: unknown): Promise<unknown> | unknown;
    importData(input: unknown): Promise<unknown> | unknown;
    executeInvisibleMutation(input: unknown): Promise<unknown> | unknown;
    savePlot(input: unknown): Promise<unknown> | unknown;
    copyPlot(input: unknown): Promise<unknown> | unknown;
    getConsoleSyntaxModule(): Promise<unknown> | unknown;
}


export const waitForBrowserPageFullyLoaded = function(
    documentRef: Document,
    windowRef: Window
): Promise<void> {
    if (documentRef.readyState === "complete") {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        windowRef.addEventListener("load", () => {
            resolve();
        }, {
            once: true
        });
    });
};


export const waitForBrowserAnimationFrameSettled = function(
    windowRef: Window
): Promise<void> {
    return new Promise((resolve) => {
        windowRef.requestAnimationFrame(() => {
            windowRef.requestAnimationFrame(() => {
                resolve();
            });
        });
    });
};


export const installBrowserSharedPageBridge = function(
    win: Window,
    options: BrowserSharedPageBridgeOptions
): void {
    const target = win as unknown as { dialogForge?: Record<string, unknown> };
    const existing = target.dialogForge && typeof target.dialogForge === "object"
        ? target.dialogForge
        : {};

    target.dialogForge = Object.assign(existing, {
        openHelpCommandUrl: options.openHelpCommandUrl,
        fetchHelpPage: options.fetchHelpPage,
        fetchRHelpPage: options.fetchHelpPage,
        runHelpExample: options.runHelpExample,
        selectImportFile: options.selectImportFile,
        planImportFile: options.planImportFile,
        previewImportFile: options.previewImportFile,
        importData: options.importData,
        executeInvisibleMutation: options.executeInvisibleMutation,
        savePlot: options.savePlot,
        copyPlot: options.copyPlot,
        getConsoleSyntaxModule: options.getConsoleSyntaxModule
    });
};
