export interface MainDialogCommandPreviewControllerOptions {
    document: Document;
    window: Window;
    colorize(target: HTMLElement, text: string): Promise<void>;
    writeClipboardText(text: string): Promise<void> | void;
    insertScriptEditorCode(text: string): Promise<void> | void;
}


export interface MainDialogCommandPreviewController {
    bind(): void;
    render(command: string): void;
}


const normalizeCommandText = function(value: unknown): string {
    return String(value ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n+$/, "");
};


export const createMainDialogCommandPreviewController = function(
    options: MainDialogCommandPreviewControllerOptions
): MainDialogCommandPreviewController {
    let bound = false;
    let visible = false;
    let renderSequence = 0;
    let latestCommand = "";
    let dragging = false;

    const getElements = function() {
        return {
            root: options.document.documentElement,
            body: options.document.body,
            container: options.document.getElementById("visibleCommandPanel"),
            pane: options.document.getElementById("commandPane"),
            command: options.document.getElementById("command"),
            splitter: options.document.getElementById("mainSplitter"),
            copyButton: options.document.getElementById(
                "commandPreviewToConsole"
            ) as HTMLButtonElement | null,
            scriptButton: options.document.getElementById(
                "commandPreviewToScriptEditor"
            ) as HTMLButtonElement | null
        };
    };
    const isManuallySized = function(): boolean {
        const { root } = getElements();

        return root.dataset.commandPaneSizeMode === "manual";
    };
    const setSizeMode = function(mode: "auto" | "manual"): void {
        const { root } = getElements();
        root.dataset.commandPaneSizeMode = mode;
    };
    const setHeight = function(height: number): void {
        const { root, pane } = getElements();
        const next = Math.max(1, Math.round(Number(height) || 0));

        root.style.setProperty("--main-command-height", next + "px");

        if (pane) {
            pane.style.flexBasis = next + "px";
            pane.style.height = next + "px";
        }
    };
    const clampHeight = function(height: number): number {
        const { command, container } = getElements();

        if (!command) {
            return 80;
        }

        const rootStyle = options.window.getComputedStyle(
            options.document.documentElement
        );
        const minValue = parseFloat(
            rootStyle.getPropertyValue("--main-command-min-height") || "56"
        );
        const minimum = Math.max(40, Math.round(minValue || 56));
        const availableHeight =
            container?.getBoundingClientRect().height
            || options.window.innerHeight
            || 800;
        const maximum = Math.max(
            minimum,
            Math.round(availableHeight * 0.55)
        );

        return Math.max(
            minimum,
            Math.min(maximum, Math.ceil(Number(height) || 0))
        );
    };
    const measureContentHeight = function(content: {
        text?: string;
        html?: string;
    }): number {
        const { command } = getElements();

        if (!command) {
            return 80;
        }

        const probe = options.document.createElement("div");
        const style = options.window.getComputedStyle(command);
        const properties = [
            "boxSizing",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
            "borderTopWidth",
            "borderRightWidth",
            "borderBottomWidth",
            "borderLeftWidth",
            "borderTopStyle",
            "borderRightStyle",
            "borderBottomStyle",
            "borderLeftStyle",
            "borderTopColor",
            "borderRightColor",
            "borderBottomColor",
            "borderLeftColor",
            "whiteSpace",
            "wordBreak",
            "overflowWrap",
            "fontFamily",
            "fontSize",
            "lineHeight",
            "letterSpacing",
            "fontWeight",
            "fontStyle"
        ] as const;

        probe.style.position = "absolute";
        probe.style.left = "-100000px";
        probe.style.top = "0";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        probe.style.width = Math.max(
            1,
            Math.ceil(command.getBoundingClientRect().width)
        ) + "px";
        probe.style.minHeight = "0";
        probe.style.height = "auto";

        for (const property of properties) {
            probe.style[property] = style[property];
        }

        if (typeof content.html === "string") {
            probe.innerHTML = content.html;
        } else {
            probe.textContent = String(content.text || "");
        }

        options.document.body.appendChild(probe);
        const height = Math.ceil(probe.getBoundingClientRect().height);
        probe.remove();

        return clampHeight(height);
    };
    const syncAutoHeight = function(): void {
        const { command } = getElements();

        if (!visible || isManuallySized() || !command) {
            return;
        }

        setHeight(measureContentHeight({ html: command.innerHTML }));
    };
    const queueAutoHeightSync = function(): void {
        if (!visible || isManuallySized()) {
            return;
        }

        options.window.requestAnimationFrame(function(): void {
            options.window.requestAnimationFrame(syncAutoHeight);
        });
    };
    const setVisible = function(nextVisible: boolean, text: string): void {
        const { body } = getElements();

        if (nextVisible) {
            body.classList.remove("command-pane-hidden");

            if (!isManuallySized()) {
                setHeight(measureContentHeight({ text }));
                queueAutoHeightSync();
            }
        } else {
            body.classList.add("command-pane-hidden");
        }

        visible = nextVisible;
    };
    const updateActions = function(): void {
        const { copyButton, scriptButton } = getElements();
        const enabled = latestCommand.trim().length > 0;

        if (copyButton) {
            copyButton.disabled = !enabled;
        }

        if (scriptButton) {
            scriptButton.disabled = !enabled;
        }
    };
    const renderSyntax = function(
        commandElement: HTMLElement,
        text: string
    ): void {
        const sequence = ++renderSequence;
        commandElement.textContent = text;
        commandElement.dataset.commandSyntaxSeq = String(sequence);
        queueAutoHeightSync();

        if (!text.trim()) {
            return;
        }

        void options.colorize(commandElement, text).then(function(): void {
            if (
                commandElement.dataset.commandSyntaxSeq
                !== String(sequence)
            ) {
                return;
            }

            queueAutoHeightSync();
        }).catch(function(): void {
            if (
                commandElement.dataset.commandSyntaxSeq
                === String(sequence)
            ) {
                commandElement.textContent = text;
            }

            queueAutoHeightSync();
        });
    };
    const clearDragging = function(): void {
        dragging = false;
        options.window.removeEventListener("mousemove", handleDrag);
        options.window.removeEventListener("mouseup", clearDragging);
    };
    const clampDragPosition = function(clientY: number): number {
        const { container, splitter } = getElements();

        if (!container || !splitter) {
            return 120;
        }

        const rect = container.getBoundingClientRect();
        const splitterHeight =
            splitter.getBoundingClientRect().height || 2;
        const maximum = Math.max(
            120,
            rect.height - splitterHeight - 180
        );
        const position = clientY - rect.top - splitterHeight / 2;

        return Math.max(120, Math.min(maximum, position));
    };
    const handleDrag = function(event: MouseEvent): void {
        if (!dragging) {
            return;
        }

        setSizeMode("manual");
        setHeight(clampDragPosition(event.clientY));
    };
    const bind = function(): void {
        if (bound) {
            return;
        }

        bound = true;
        setSizeMode("auto");

        const {
            splitter,
            copyButton,
            scriptButton
        } = getElements();

        copyButton?.addEventListener("click", function(event): void {
            event.preventDefault();

            if (latestCommand.trim()) {
                void options.writeClipboardText(latestCommand);
            }
        });
        scriptButton?.addEventListener("click", function(event): void {
            event.preventDefault();

            if (latestCommand.trim()) {
                void options.insertScriptEditorCode(latestCommand);
            }
        });
        splitter?.addEventListener("mousedown", function(event): void {
            event.preventDefault();
            dragging = true;
            options.window.addEventListener("mousemove", handleDrag);
            options.window.addEventListener("mouseup", clearDragging);
        });
        options.window.addEventListener("blur", clearDragging);
        options.window.addEventListener("mouseleave", clearDragging);
        updateActions();
    };
    const render = function(command: string): void {
        const { command: commandElement } = getElements();
        const text = normalizeCommandText(command);
        latestCommand = text;

        if (commandElement) {
            renderSyntax(commandElement, text);
        }

        setVisible(text.trim().length > 0, text);
        updateActions();
    };

    return {
        bind,
        render
    };
};
