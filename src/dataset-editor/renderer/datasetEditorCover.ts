export interface DatasetEditorCover {
    readonly isLoading: boolean;
    showModalCover: () => void;
    hideModalCover: () => void;
    showLoadingCover: (message: string) => void;
    hideLoadingCover: () => void;
}

export const createDatasetEditorCover = function(
    document: Document,
    translate: (key: string) => string
): DatasetEditorCover {
    let modalActive = false;
    let loadingActive = false;
    let loadingMessage = "";

    const update = function(): void {
        const cover = document.getElementById(
            "datasetEditorCover"
        );
        const label = document.getElementById(
            "datasetEditorCoverLabel"
        );

        if (!cover || !label) {
            return;
        }

        const active = modalActive || loadingActive;

        cover.classList.toggle(
            "dataset-editor__cover--active",
            active
        );
        cover.classList.toggle(
            "dataset-editor__cover--loading",
            loadingActive
        );
        label.textContent = loadingActive
            ? loadingMessage || translate("Loading...")
            : "";
        label.hidden = !loadingActive;
    };

    return {
        get isLoading(): boolean {
            return loadingActive;
        },
        showModalCover: function(): void {
            modalActive = true;
            update();
        },
        hideModalCover: function(): void {
            modalActive = false;
            update();
        },
        showLoadingCover: function(message: string): void {
            loadingActive = true;
            loadingMessage =
                String(message || "").trim()
                || translate("Loading...");
            update();
        },
        hideLoadingCover: function(): void {
            loadingActive = false;
            loadingMessage = "";
            update();
        }
    };
};
