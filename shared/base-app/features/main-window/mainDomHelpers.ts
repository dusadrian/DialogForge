export interface MainDomHelpers {
    setBootStage(stage: string): void;
    applyControlUpdates(updates: Array<{ id: string; value: string }>): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
}


export const createMainDomHelpers = function(
    document: Document,
    byId: (id: string) => HTMLElement
): MainDomHelpers {
    const setBootStage = function(stage: string): void {
        document.body.dataset.dialogForgeBootStage = stage;
    };

    const applyControlUpdates = function(
        updates: Array<{ id: string; value: string }>
    ): void {
        updates.forEach((update) => {
            const element = byId(update.id);

            if (
                element instanceof HTMLInputElement
                || element instanceof HTMLSelectElement
            ) {
                element.value = update.value;
            }
        });
    };

    const setStatusClass = function(
        element: HTMLElement,
        enabled: boolean
    ): void {
        element.classList.remove("enabled");
        element.classList.remove("disabled");
        element.classList.add(enabled ? "enabled" : "disabled");
    };

    return {
        setBootStage,
        applyControlUpdates,
        setStatusClass
    };
};
