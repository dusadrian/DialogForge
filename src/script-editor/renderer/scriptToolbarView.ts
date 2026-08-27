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
    shareLive: string;
    joinLive: string;
    handsRaised: string;
    raiseHand: string;
    lowerHand: string;
    stopSpotlight: string;
}


export interface ScriptToolbarActions {
    createFile(): void;
    openFile(): void;
    run(): void;
    toggleOutline(event: MouseEvent): void;
    showHelp(): void;
    save(): void;
    saveAs(): void;
    shareLive(): void;
    joinLive(): void;
    showRaisedHands(): void;
    toggleHand(): void;
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
        saveAs: translate("Save As"),
        shareLive: translate("Share live"),
        joinLive: translate("Join live script"),
        handsRaised: translate("Hands raised"),
        raiseHand: translate("Raise hand"),
        lowerHand: translate("Lower hand"),
        stopSpotlight: translate("Stop spotlight")
    };
};


export interface ScriptToolbarView {
    readonly element: HTMLDivElement;
    readonly outlineButton: HTMLButtonElement;
    updateLabels(labels: ScriptToolbarLabels): void;
    updateDocumentState(
        hasDocument: boolean,
        functionCount: number,
        canSave?: boolean
    ): void;
    updateLiveState(input: {
        available: boolean;
        canHost?: boolean;
        canJoin?: boolean;
        isParticipant: boolean;
        participantSessionActive?: boolean;
        isHosting: boolean;
        canManageRaisedHands: boolean;
        hasRaisedHands: boolean;
        hasSpotlight: boolean;
        activeDocumentLocal: boolean;
        handState: "idle" | "raised" | "spotlight";
        hasOfferedDocument: boolean;
    }): void;
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
    }

    const accessibleLabel = options?.title || label;

    if (accessibleLabel) {
        button.setAttribute("aria-label", accessibleLabel);
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
    tooltip = ""
): void {
    if (tooltip) {
        button.setAttribute("data-tooltip", tooltip);
    }
    else {
        button.removeAttribute("data-tooltip");
    }

    button.setAttribute("aria-label", tooltip || label);
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
    toolbar.appendChild(createDivider());

    const shareLiveButton = createToolbarButton(
        labels.shareLive,
        "codicon-broadcast",
        actions.shareLive
    );
    shareLiveButton.classList.add("dm-script-btn-share-live");
    toolbar.appendChild(shareLiveButton);

    const joinLiveButton = createToolbarButton(
        labels.joinLive,
        "codicon-sign-in",
        actions.joinLive
    );
    joinLiveButton.classList.add("dm-script-btn-join-live");
    toolbar.appendChild(joinLiveButton);

    const handsRaisedButton = createToolbarButton(
        labels.handsRaised,
        "codicon-feedback",
        actions.showRaisedHands,
        { title: labels.handsRaised }
    );
    handsRaisedButton.classList.add("dm-script-btn-hands-raised");
    handsRaisedButton.hidden = true;
    toolbar.appendChild(handsRaisedButton);

    const raiseHandButton = createToolbarButton(
        labels.raiseHand,
        "codicon-feedback",
        actions.toggleHand
    );
    raiseHandButton.classList.add("dm-script-btn-raise-hand");
    raiseHandButton.hidden = true;
    toolbar.appendChild(raiseHandButton);

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
        setButtonLabel(
            shareLiveButton,
            nextLabels.shareLive
        );
        setButtonLabel(
            joinLiveButton,
            nextLabels.joinLive
        );
        setButtonLabel(
            handsRaisedButton,
            nextLabels.handsRaised,
            nextLabels.handsRaised
        );
        const handLabel = raiseHandButton.dataset.state === "spotlight"
            ? nextLabels.stopSpotlight
            : raiseHandButton.dataset.state === "raised"
                ? nextLabels.lowerHand
                : nextLabels.raiseHand;
        setButtonLabel(raiseHandButton, handLabel);
    };

    const updateDocumentState = function(
        hasDocument: boolean,
        functionCount: number,
        canSave = true
    ): void {
        runButton.disabled = !hasDocument;
        saveButton.disabled = !hasDocument || !canSave;
        saveAsButton.disabled = !hasDocument || !canSave;

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

    const updateLiveState = function(input: {
        available: boolean;
        canHost?: boolean;
        canJoin?: boolean;
        isParticipant: boolean;
        participantSessionActive?: boolean;
        isHosting: boolean;
        canManageRaisedHands: boolean;
        hasRaisedHands: boolean;
        hasSpotlight: boolean;
        activeDocumentLocal: boolean;
        handState: "idle" | "raised" | "spotlight";
        hasOfferedDocument: boolean;
    }): void {
        shareLiveButton.disabled = !input.available
            || (!input.isParticipant && input.canHost === false);
        joinLiveButton.disabled = !input.available
            || input.canJoin === false
            || (input.participantSessionActive ?? input.isParticipant);
        shareLiveButton.dataset.state = input.isParticipant
            ? "participant"
            : input.isHosting
                ? "hosting"
                : "idle";
        handsRaisedButton.hidden = !input.canManageRaisedHands;
        handsRaisedButton.dataset.state = input.hasSpotlight
            ? "spotlight"
            : input.hasRaisedHands
                ? "raised"
                : "idle";
        raiseHandButton.hidden = !input.participantSessionActive;
        raiseHandButton.disabled = !input.activeDocumentLocal
            || (input.hasOfferedDocument && input.handState === "idle");
        const handLabel = input.handState === "spotlight"
            ? currentLabels.stopSpotlight
            : input.handState === "raised"
                ? currentLabels.lowerHand
                : currentLabels.raiseHand;
        setButtonLabel(raiseHandButton, handLabel);
        raiseHandButton.dataset.state = input.handState;
    };

    return {
        element: toolbar,
        outlineButton,
        updateLabels,
        updateDocumentState,
        updateLiveState
    };
};
