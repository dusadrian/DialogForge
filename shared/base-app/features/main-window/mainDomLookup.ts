export interface MainDomLookup {
    byId(id: string): HTMLElement;
    inputById(id: string): HTMLInputElement;
    textAreaById(id: string): HTMLTextAreaElement;
    buttonById(id: string): HTMLButtonElement;
    selectById(id: string): HTMLSelectElement;
    empty(element: HTMLElement): void;
}


export const createMainDomLookup = function(
    document: Document
): MainDomLookup {
    const byId = function(id: string): HTMLElement {
        const element = document.getElementById(id);

        if (!element) {
            throw new Error("Missing renderer element: " + id);
        }

        return element;
    };

    return {
        byId,
        inputById: function(id) {
            return byId(id) as HTMLInputElement;
        },
        textAreaById: function(id) {
            return byId(id) as HTMLTextAreaElement;
        },
        buttonById: function(id) {
            return byId(id) as HTMLButtonElement;
        },
        selectById: function(id) {
            return byId(id) as HTMLSelectElement;
        },
        empty: function(element) {
            element.textContent = "";
        }
    };
};
