export interface ScriptToolbarLabels {
    newFile: string;
    newFileTooltip: string;
    openFile: string;
    openFileTooltip: string;
    run: string;
    runTooltip: string;
    functions: string;
    noFunctions: string;
    helpForSelection: string;
    save: string;
    saveAs: string;
}


export interface ScriptToolbarActions {
    createFile(): void;
    openFile(): void;
    run(): void;
    toggleOutline(event: MouseEvent): void;
    showHelp(): void;
    save(): void;
    saveAs(): void;
}


export const createScriptToolbarLabels = function(
    translate: (key: string) => string
): ScriptToolbarLabels {
    return {
        newFile: translate("New"),
        newFileTooltip: translate("New File"),
        openFile: translate("Open"),
        openFileTooltip: translate("Open File"),
        run: translate("Run"),
        runTooltip: translate("Run Script"),
        functions: translate("Functions"),
        noFunctions: translate("No functions"),
        helpForSelection: translate("Help for Selection"),
        save: translate("Save"),
        saveAs: translate("Save As")
    };
};


export interface ScriptToolbarView {
    readonly element: HTMLDivElement;
    readonly outlineButton: HTMLButtonElement;
    updateLabels(labels: ScriptToolbarLabels): void;
    updateDocumentState(hasDocument: boolean, functionCount: number): void;
}


const createToolbarButton = function(
    label: string,
    iconClass: string,
    onClick: (event: MouseEvent) => void,
    options?: {
        title?: string;
        iconOnly?: boolean;
    }
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dm-script-btn${options?.iconOnly ? " icon-only" : ""}`;

    if (options?.title) {
        button.setAttribute("data-tooltip", options.title);
        button.setAttribute("aria-label", options.title);
    }

    const icon = document.createElement("span");
    icon.className = `codicon ${iconClass}`;
    button.appendChild(icon);

    if (!options?.iconOnly) {
        const text = document.createElement("span");
        text.textContent = label;
        button.appendChild(text);
    }

    button.addEventListener("click", onClick);
    return button;
};


const createDivider = function(): HTMLSpanElement {
    const divider = document.createElement("span");
    divider.className = "dm-divider";
    return divider;
};


const setButtonLabel = function(
    button: HTMLButtonElement,
    label: string,
    tooltip: string
): void {
    button.setAttribute("data-tooltip", tooltip);
    button.setAttribute("aria-label", tooltip);
    const text = button.querySelector<HTMLSpanElement>("span:nth-child(2)");

    if (text) {
        text.textContent = label;
    }
};


export const createScriptToolbarView = function(
    labels: ScriptToolbarLabels,
    actions: ScriptToolbarActions
): ScriptToolbarView {
    const toolbar = document.createElement("div");
    toolbar.className = "dm-script-toolbar";

    const newButton = createToolbarButton(
        labels.newFile,
        "codicon-add",
        actions.createFile,
        { title: labels.newFileTooltip }
    );
    newButton.classList.add("dm-script-btn-new");
    toolbar.appendChild(newButton);
    toolbar.appendChild(createDivider());

    const openButton = createToolbarButton(
        labels.openFile,
        "codicon-folder-opened",
        actions.openFile,
        { title: labels.openFileTooltip }
    );
    toolbar.appendChild(openButton);
    toolbar.appendChild(createDivider());

    const outlineButton = createToolbarButton(
        labels.functions,
        "codicon-symbol-function",
        actions.toggleOutline,
        { title: labels.functions }
    );
    outlineButton.classList.add("dm-script-outline-btn");
    toolbar.appendChild(outlineButton);

    const helpButton = createToolbarButton(
        "",
        "codicon-question",
        actions.showHelp,
        {
            iconOnly: true,
            title: labels.helpForSelection
        }
    );
    toolbar.appendChild(helpButton);
    toolbar.appendChild(createDivider());

    const runButton = createToolbarButton(
        labels.run,
        "codicon-play",
        actions.run,
        { title: labels.runTooltip }
    );
    runButton.classList.add("dm-script-btn-run");
    toolbar.appendChild(runButton);

    const spacer = document.createElement("div");
    spacer.style.flex = "1 1 auto";
    toolbar.appendChild(spacer);

    const saveButton = createToolbarButton(
        "",
        "codicon-save",
        actions.save,
        {
            iconOnly: true,
            title: labels.save
        }
    );
    toolbar.appendChild(saveButton);

    const saveAsButton = createToolbarButton(
        "",
        "codicon-save-as",
        actions.saveAs,
        {
            iconOnly: true,
            title: labels.saveAs
        }
    );
    toolbar.appendChild(saveAsButton);

    let currentLabels = labels;

    const updateLabels = function(nextLabels: ScriptToolbarLabels): void {
        currentLabels = nextLabels;
        setButtonLabel(
            newButton,
            nextLabels.newFile,
            nextLabels.newFileTooltip
        );
        setButtonLabel(
            openButton,
            nextLabels.openFile,
            nextLabels.openFileTooltip
        );
        setButtonLabel(
            runButton,
            nextLabels.run,
            nextLabels.runTooltip
        );
        helpButton.setAttribute(
            "data-tooltip",
            nextLabels.helpForSelection
        );
        helpButton.setAttribute(
            "aria-label",
            nextLabels.helpForSelection
        );
        saveButton.setAttribute("data-tooltip", nextLabels.save);
        saveButton.setAttribute("aria-label", nextLabels.save);
        saveAsButton.setAttribute("data-tooltip", nextLabels.saveAs);
        saveAsButton.setAttribute("aria-label", nextLabels.saveAs);
    };

    const updateDocumentState = function(
        hasDocument: boolean,
        functionCount: number
    ): void {
        runButton.disabled = !hasDocument;
        saveButton.disabled = !hasDocument;
        saveAsButton.disabled = !hasDocument;

        const hasFunctions = functionCount > 0;
        const outlineText = hasFunctions
            ? currentLabels.functions
            : currentLabels.noFunctions;
        outlineButton.disabled = !hasFunctions;
        outlineButton.setAttribute("data-tooltip", outlineText);
        outlineButton.setAttribute("aria-label", outlineText);

        const label = outlineButton.querySelector<HTMLSpanElement>(
            "span:nth-child(2)"
        );

        if (label) {
            label.textContent = outlineText;
        }
    };

    return {
        element: toolbar,
        outlineButton,
        updateLabels,
        updateDocumentState
    };
};
