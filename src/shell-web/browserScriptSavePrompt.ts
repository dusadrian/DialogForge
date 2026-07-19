import type {
    ScriptSaveDecision
} from "../script-editor/files/scriptFilePersistence";


export interface BrowserScriptSavePromptLabels {
    title: string;
    message: string;
    save: string;
    dontSave: string;
    cancel: string;
}


export const showBrowserScriptSavePrompt = function(
    labels: BrowserScriptSavePromptLabels,
    documentRef: Document = document
): Promise<ScriptSaveDecision> {
    return new Promise((resolve) => {
        const layer = documentRef.createElement("div");
        const dialog = documentRef.createElement("section");
        const titlebar = documentRef.createElement("div");
        const title = documentRef.createElement("div");
        const close = documentRef.createElement("button");
        const body = documentRef.createElement("div");
        const actions = documentRef.createElement("div");
        const cancel = documentRef.createElement("button");
        const dontSave = documentRef.createElement("button");
        const save = documentRef.createElement("button");
        let settled = false;

        layer.className = "dialogforge-web-dialog-layer dialogforge-web-confirm-layer";
        dialog.className = "dialogforge-web-dialog dialogforge-web-confirm";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", labels.title);
        titlebar.className = "dialogforge-web-dialog__titlebar";
        title.className = "dialogforge-web-dialog__title";
        title.textContent = labels.title;
        close.className = "dialogforge-web-dialog__close";
        close.type = "button";
        close.setAttribute("aria-label", labels.cancel);
        body.className = "dialogforge-web-confirm__body";
        body.textContent = labels.message;
        actions.className = "dialogforge-web-confirm__actions";

        const prepareButton = function(
            button: HTMLButtonElement,
            label: string,
            primary = false
        ): void {
            button.type = "button";
            button.className = "dialogforge-web-confirm__button"
                + (primary ? " dialogforge-web-confirm__button--primary" : "");
            button.textContent = label;
        };

        prepareButton(cancel, labels.cancel);
        prepareButton(dontSave, labels.dontSave);
        prepareButton(save, labels.save, true);

        const finish = function(decision: ScriptSaveDecision): void {
            if (settled) {
                return;
            }

            settled = true;
            documentRef.removeEventListener("keydown", handleKeyDown, true);
            layer.remove();
            resolve(decision);
        };

        const handleKeyDown = function(event: KeyboardEvent): void {
            if (event.key !== "Escape") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            finish("cancel");
        };

        close.addEventListener("click", () => finish("cancel"));
        cancel.addEventListener("click", () => finish("cancel"));
        dontSave.addEventListener("click", () => finish("dont-save"));
        save.addEventListener("click", () => finish("save"));
        documentRef.addEventListener("keydown", handleKeyDown, true);

        titlebar.append(title, close);
        actions.append(cancel, dontSave, save);
        dialog.append(titlebar, body, actions);
        layer.appendChild(dialog);
        documentRef.body.appendChild(layer);
        save.focus();
    });
};
