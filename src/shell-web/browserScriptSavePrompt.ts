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


export const showBrowserMessageBox = function(
    labels: {
        title: string; message: string; detail?: string;
        buttons: string[]; cancelId: number; defaultId: number;
    },
    documentRef: Document = document
): Promise<{ response: number }> {
    return new Promise((resolve) => {
        const layer = documentRef.createElement("div");
        const dialog = documentRef.createElement("section");
        const titlebar = documentRef.createElement("div");
        const title = documentRef.createElement("div");
        const close = documentRef.createElement("button");
        const body = documentRef.createElement("div");
        const actions = documentRef.createElement("div");
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
        close.setAttribute("aria-label", labels.buttons[labels.cancelId]);
        body.className = "dialogforge-web-confirm__body";
        body.textContent = labels.message;
        if (labels.detail) {
            const detail = documentRef.createElement("p");
            detail.textContent = labels.detail;
            detail.style.whiteSpace = "pre-line";
            body.appendChild(detail);
        }
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

        const finish = function(response: number): void {
            if (settled) {
                return;
            }

            settled = true;
            documentRef.removeEventListener("keydown", handleKeyDown, true);
            layer.remove();
            resolve({ response });
        };

        const handleKeyDown = function(event: KeyboardEvent): void {
            if (event.key !== "Escape") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            finish(labels.cancelId);
        };

        close.addEventListener("click", () => finish(labels.cancelId));
        const buttons = labels.buttons.map((label, index) => {
            const button = documentRef.createElement("button");
            prepareButton(button, label, index === labels.defaultId);
            button.addEventListener("click", () => finish(index));
            return button;
        });
        documentRef.addEventListener("keydown", handleKeyDown, true);

        titlebar.append(title, close);
        actions.append(...buttons);
        dialog.append(titlebar, body, actions);
        layer.appendChild(dialog);
        documentRef.body.appendChild(layer);
        buttons[labels.defaultId].focus();
    });
};


export const showBrowserScriptSavePrompt = async function(
    labels: BrowserScriptSavePromptLabels,
    documentRef: Document = document
): Promise<ScriptSaveDecision> {
    const result = await showBrowserMessageBox({
        title: labels.title, message: labels.message,
        buttons: [labels.cancel, labels.dontSave, labels.save],
        cancelId: 0, defaultId: 2
    }, documentRef);

    if (result.response === 2) {
        return "save";
    }
    if (result.response === 1) {
        return "dont-save";
    }
    return "cancel";
};
