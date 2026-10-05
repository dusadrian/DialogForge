export const formatDatasetEditorTitle = function(
    datasetName: string,
    translate: (key: string) => string
): string {
    const caption = translate("Dataset Editor");

    return datasetName ? `${datasetName} - ${caption}` : caption;
};
