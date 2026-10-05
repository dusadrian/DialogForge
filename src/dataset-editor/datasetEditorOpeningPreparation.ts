export const prepareDatasetEditorOpening = function(
    objectName: string,
    options: {
        selectDataset(name: string): Promise<unknown> | void;
        warmFirstScreens(name: string): void;
        reportError(error: unknown): void;
    }
): void {
    // Selection publication must not hold the first editor screen behind
    // unrelated dialog notifications. Both hosts retain the native ordering.
    try {
        void Promise.resolve(options.selectDataset(objectName)).catch(options.reportError);
    } catch (error) {
        options.reportError(error);
    }
    options.warmFirstScreens(objectName);
};
