export type DatasetEditorTab = "data" | "variables";

export interface DatasetEditorTitleState {
    datasetName: string;
    rowCount: number;
    columnCount: number;
}

export interface DatasetEditorChromeView {
    translateMenus: () => void;
    translateChrome: () => void;
    renderTitle: () => void;
    syncDatasetSelector: (
        datasetNames: string[],
        currentDatasetName: string
    ) => void;
    showFooterNotice: (
        message: string,
        timeoutMs?: number
    ) => void;
    setActiveTab: (tab: DatasetEditorTab) => void;
    renderDataStatus: (message: string) => void;
    renderVariablesStatus: (message: string) => void;
}

export interface DatasetEditorChromeOptions {
    document: Document;
    window: Window;
    translate: (key: string) => string;
    readTitleState: () => DatasetEditorTitleState;
    onVariablesActivated: () => void;
}

const MENU_LABELS: Record<string, string> = {
    "header:copy-values": "Copy values",
    "header:copy-labels": "Copy values and labels",
    "header:paste": "Paste",
    "header:sort-asc": "Sort ascending",
    "header:sort-desc": "Sort descending",
    "header:add-before": "Add column before",
    "header:add-after": "Add column after",
    "header:rename": "Rename column",
    "header:remove": "Remove",
    "variable-row:add-before": "Add row before",
    "variable-row:add-after": "Add row after",
    "variable-row:remove": "Remove row",
    "cell:copy": "Copy",
    "cell:paste": "Paste",
    "row:rename": "Rename row",
    "row:add-before": "Add row before",
    "row:add-after": "Add row after",
    "row:remove": "Delete row"
};

export const escapeDatasetEditorHtml = function(
    value: unknown
): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
};

export const createDatasetEditorChromeView = function(
    options: DatasetEditorChromeOptions
): DatasetEditorChromeView {
    const document = options.document;
    let footerNotice = "";
    let footerTimer: number | null = null;

    const byId = function<T extends HTMLElement>(
        id: string
    ): T | null {
        return document.getElementById(id) as T | null;
    };
    const translateMenu = function(
        selector: string,
        attribute: string,
        prefix: string
    ): void {
        document.querySelectorAll<HTMLElement>(
            selector
        ).forEach(function(button): void {
            const action = String(
                button.getAttribute(attribute) || ""
            ).trim();
            const key = MENU_LABELS[prefix + action];

            if (key) {
                button.textContent = options.translate(key);
            }
        });
    };
    const translateMenus = function(): void {
        translateMenu(
            "[data-header-menu-action]",
            "data-header-menu-action",
            "header:"
        );
        translateMenu(
            "[data-row-menu-action]",
            "data-row-menu-action",
            "row:"
        );
        translateMenu(
            "[data-variable-row-menu-action]",
            "data-variable-row-menu-action",
            "variable-row:"
        );
        translateMenu(
            "[data-cell-menu-action]",
            "data-cell-menu-action",
            "cell:"
        );
    };

    const translateChrome = function(): void {
        const datasetLabel =
            document.querySelector<HTMLLabelElement>(
                "label[for=\"datasetEditorDatasetSelect\"]"
            );
        const dataTab = byId<HTMLButtonElement>(
            "datasetEditorTabData"
        );
        const variablesTab = byId<HTMLButtonElement>(
            "datasetEditorTabVariables"
        );
        const cancel = byId<HTMLButtonElement>(
            "datasetValueLabelsCancel"
        );
        const save = byId<HTMLButtonElement>(
            "datasetValueLabelsSave"
        );

        if (datasetLabel) {
            datasetLabel.textContent =
                options.translate("Dataset:");
        }
        if (dataTab) {
            dataTab.textContent = options.translate("Data");
        }
        if (variablesTab) {
            variablesTab.textContent =
                options.translate("Variables");
        }
        if (cancel) {
            cancel.textContent = options.translate("Cancel");
        }
        if (save) {
            save.textContent = options.translate("Save");
        }
    };
    const renderTitle = function(): void {
        const state = options.readTitleState();
        const title = byId<HTMLElement>(
            "datasetEditorTitle"
        );
        const subtitle = byId<HTMLElement>(
            "datasetEditorSubtitle"
        );
        const footer = byId<HTMLElement>(
            "datasetEditorFooterNote"
        );

        if (title) {
            title.textContent = state.datasetName
                ? state.datasetName
                : options.translate("Dataset Editor");
        }
        if (subtitle) {
            subtitle.textContent = state.datasetName
                ? state.rowCount
                    + " "
                    + options.translate(
                        state.rowCount === 1
                            ? "row"
                            : "rows"
                    )
                    + " • "
                    + state.columnCount
                    + " "
                    + options.translate(
                        state.columnCount === 1
                            ? "column"
                            : "columns"
                    )
                : "\u00A0";
        }
        if (footer) {
            footer.textContent = footerNotice;
        }

        document.title = state.datasetName
            ? state.datasetName
                + " - "
                + options.translate("Dataset Editor")
            : options.translate("Dataset Editor");
    };
    const syncDatasetSelector = function(
        datasetNames: string[],
        currentDatasetName: string
    ): void {
        const select = byId<HTMLSelectElement>(
            "datasetEditorDatasetSelect"
        );

        if (!select) {
            return;
        }

        const previousValue = String(select.value || "");
        const names = datasetNames.slice();

        if (
            currentDatasetName
            && !names.includes(currentDatasetName)
        ) {
            names.unshift(currentDatasetName);
        }

        select.innerHTML = "";
        names.forEach(function(name): void {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

        const nextValue =
            currentDatasetName
            || previousValue
            || names[0]
            || "";

        if (nextValue) {
            select.value = nextValue;
        }

        select.disabled = names.length <= 1;
    };
    const showFooterNotice = function(
        message: string,
        timeoutMs = 2800
    ): void {
        footerNotice = String(message || "").trim();

        if (footerTimer !== null) {
            options.window.clearTimeout(footerTimer);
            footerTimer = null;
        }

        renderTitle();

        if (!footerNotice || timeoutMs <= 0) {
            return;
        }

        footerTimer = options.window.setTimeout(
            function(): void {
                footerTimer = null;
                footerNotice = "";
                renderTitle();
            },
            timeoutMs
        );
    };
    const setActiveTab = function(
        tab: DatasetEditorTab
    ): void {
        const dataTab = byId<HTMLButtonElement>(
            "datasetEditorTabData"
        );
        const variablesTab = byId<HTMLButtonElement>(
            "datasetEditorTabVariables"
        );
        const dataPanel = byId<HTMLElement>(
            "datasetEditorPanelData"
        );
        const variablesPanel = byId<HTMLElement>(
            "datasetEditorPanelVariables"
        );
        const dataActive = tab === "data";

        dataTab?.classList.toggle("is-active", dataActive);
        variablesTab?.classList.toggle(
            "is-active",
            !dataActive
        );
        dataTab?.setAttribute(
            "aria-selected",
            dataActive ? "true" : "false"
        );
        variablesTab?.setAttribute(
            "aria-selected",
            dataActive ? "false" : "true"
        );
        dataPanel?.classList.toggle(
            "is-active",
            dataActive
        );
        variablesPanel?.classList.toggle(
            "is-active",
            !dataActive
        );

        if (!dataActive) {
            options.onVariablesActivated();
        }

        renderTitle();
    };
    const renderStatus = function(
        hostId: string,
        message: string
    ): void {
        const host = byId<HTMLElement>(hostId);

        if (host) {
            host.innerHTML =
                "<div class=\"dataset-sheet__status\">"
                + escapeDatasetEditorHtml(message)
                + "</div>";
        }
    };

    return {
        translateMenus,
        translateChrome,
        renderTitle,
        syncDatasetSelector,
        showFooterNotice,
        setActiveTab,
        renderDataStatus: function(message: string): void {
            renderStatus("datasetEditorDataScroll", message);
        },
        renderVariablesStatus: function(
            message: string
        ): void {
            renderStatus(
                "datasetEditorVariablesScroll",
                message
            );
        }
    };
};
