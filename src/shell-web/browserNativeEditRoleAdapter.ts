export interface BrowserNativeEditRoleAdapter {
    captureTarget(): void;
    isSupported(role: unknown): boolean;
    execute(role: unknown): Promise<boolean>;
}


const supportedRoles = new Set([
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "selectAll"
]);


const readDeepActiveElement = function(
    documentRef: Document
): HTMLElement | null {
    let activeDocument = documentRef;
    let activeElement = activeDocument.activeElement;

    while (activeElement?.tagName === "IFRAME") {
        try {
            const nestedDocument = (
                activeElement as HTMLIFrameElement
            ).contentDocument;

            if (!nestedDocument?.activeElement) {
                break;
            }

            activeDocument = nestedDocument;
            activeElement = activeDocument.activeElement;
        }
        catch {
            break;
        }
    }

    if (activeElement?.nodeType !== 1) {
        return null;
    }

    return activeElement as HTMLElement;
};


const dispatchClipboardPaste = function(
    target: HTMLElement,
    text: string
): boolean {
    if (typeof ClipboardEvent !== "function" || typeof DataTransfer !== "function") {
        return false;
    }

    const clipboardData = new DataTransfer();

    clipboardData.setData("text/plain", text);

    return !target.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData
    }));
};


export const createBrowserNativeEditRoleAdapter = function(
    documentRef: Document,
    navigatorRef: Navigator
): BrowserNativeEditRoleAdapter {
    let target: HTMLElement | null = null;

    const restoreTarget = function(): HTMLElement | null {
        if (!target?.isConnected) {
            target = null;
        }

        target?.focus();

        return target;
    };

    return {
        captureTarget: function(): void {
            target = readDeepActiveElement(documentRef);
        },
        isSupported: function(role): boolean {
            return supportedRoles.has(String(role || "").trim());
        },
        execute: async function(role): Promise<boolean> {
            const command = String(role || "").trim();
            const activeTarget = restoreTarget();
            const activeDocument = activeTarget?.ownerDocument || documentRef;

            if (!supportedRoles.has(command)) {
                return false;
            }

            if (
                command === "selectAll"
                && activeTarget
                && typeof (activeTarget as HTMLElement & {
                    select?: () => void;
                }).select === "function"
            ) {
                (activeTarget as HTMLElement & {
                    select(): void;
                }).select();
                return true;
            }

            if (command !== "paste") {
                return activeDocument.execCommand(command);
            }

            if (!navigatorRef.clipboard?.readText) {
                return activeDocument.execCommand("paste");
            }

            const text = await navigatorRef.clipboard.readText();

            if (activeTarget && dispatchClipboardPaste(activeTarget, text)) {
                return true;
            }

            restoreTarget();

            return activeDocument.execCommand("insertText", false, text);
        }
    };
};
