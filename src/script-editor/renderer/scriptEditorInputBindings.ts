import type * as Monaco from "monaco-editor";


export interface ScriptEditorInputActions {
    run(): void;
    save(): void;
    saveAs(): void;
    open(): void;
    create(): void;
    help(): void;
    paste(): void;
    pasteText(text: string): void;
    scrollChanged(): void;
    dismissPopups(): void;
}


const matchesFontIncreaseShortcut = function(
    event: Monaco.IKeyboardEvent
): boolean {
    const key = String(event.browserEvent?.key || "");
    const code = String(event.browserEvent?.code || "");

    return key === "+"
        || key === "="
        || key === "Add"
        || code === "Equal"
        || code === "NumpadAdd";
};


const matchesFontDecreaseShortcut = function(
    event: Monaco.IKeyboardEvent
): boolean {
    const key = String(event.browserEvent?.key || "");
    const code = String(event.browserEvent?.code || "");

    return key === "-"
        || key === "_"
        || key === "Subtract"
        || code === "Minus"
        || code === "NumpadSubtract";
};


const matchesFontResetShortcut = function(
    event: Monaco.IKeyboardEvent
): boolean {
    const key = String(event.browserEvent?.key || "");
    const code = String(event.browserEvent?.code || "");

    return key === "0"
        || code === "Digit0"
        || code === "Numpad0";
};


export const bindScriptEditorInput = function(
    monaco: typeof Monaco,
    editor: Monaco.editor.IStandaloneCodeEditor,
    actions: ScriptEditorInputActions
): void {
    editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        actions.run
    );
    editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        actions.save
    );
    editor.addCommand(
        monaco.KeyMod.CtrlCmd
            | monaco.KeyMod.Shift
            | monaco.KeyCode.KeyS,
        actions.saveAs
    );
    editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO,
        actions.open
    );
    editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN,
        actions.create
    );
    editor.addCommand(monaco.KeyCode.F1, actions.help);
    editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV,
        actions.paste
    );
    editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyCode.Insert,
        actions.paste
    );
    editor.onKeyDown((event) => {
        try {
            const controlOrCommand = !!(event.ctrlKey || event.metaKey);

            if (
                controlOrCommand
                && !event.altKey
                && (
                    matchesFontIncreaseShortcut(event)
                    || matchesFontDecreaseShortcut(event)
                    || matchesFontResetShortcut(event)
                )
            ) {
                return;
            }
        } catch {}
    });
    editor.onDidScrollChange(actions.scrollChanged);

    try {
        const domNode = editor.getDomNode();

        if (domNode) {
            domNode.addEventListener("paste", (event) => {
                try {
                    const text = String(
                        event.clipboardData?.getData("text/plain") || ""
                    );

                    if (!text) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    actions.pasteText(text);
                } catch {}
            }, true);
        }
    } catch {}

    document.addEventListener("click", actions.dismissPopups);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            actions.dismissPopups();
        }
    });
}
