export interface DatasetEditorDomController {
    getRoot(): HTMLElement | null;
    getDataHost(): HTMLElement | null;
}


export const createDatasetEditorDomController = function(
    document: Document
): DatasetEditorDomController {
    const getRoot = function(): HTMLElement | null {
        return document.getElementById("datasetEditorRoot");
    };
    const getDataHost = function(): HTMLElement | null {
        return document.getElementById("datasetEditorDataScroll");
    };

    return {
        getRoot,
        getDataHost
    };
};
