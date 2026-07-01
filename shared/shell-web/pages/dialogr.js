import {
    clearFilterState as clearSharedFilterState,
    clearSplitByState as clearSharedSplitByState,
    clearWeightByState as clearSharedWeightByState,
    createDialogBindingState,
    getFilterState as getSharedFilterState,
    getSplitByState as getSharedSplitByState,
    getWeightByState as getSharedWeightByState,
    inheritSubsetDatasetState as inheritSharedSubsetDatasetState,
    setFilterState as setSharedFilterState,
    setSplitByState as setSharedSplitByState,
    setWeightByState as setSharedWeightByState
} from "/browser-esm/shared/dialog-runtime/custom-js/dialogBindings.js";

const state = {
    composition: null,
    runtime: null,
    runtimeStartPromise: null,
    runtimeReady: false,
    runtimeStarting: false,
    console: null,
    commandPreviewText: "",
    commandPreviewDialogId: "",
    commandPreviewColorizer: null,
    commandPaneSizeMode: "auto",
    commandPaneVisible: false,
    productStateChips: [],
    dialogBindingState: createDialogBindingState(),
    commandHistory: null,
    loadedRuntimePackages: new Set(),
    importFiles: new Map(),
    importFileSequence: 0,
    workingDirectoryPath: "/web/DialogR",
    homeDirectoryPath: "/web",
    activeDatasetName: "",
    workspacePaneWidth: 280,
    consolePaneWidth: 0,
    plotViewer: {
        layer: null,
        frame: null,
        objectUrls: [],
        frameReady: false,
        renderToken: 0,
        renderWaiters: [],
        graphicsWarmupPromise: null,
        graphicsWarm: false,
        payload: {
            status: "waiting",
            message: "Plots created in R will appear here when the WebR graphics bridge is active.",
            url: "",
            urls: [],
            count: 0
        }
    },
    helpViewer: {
        layer: null,
        frame: null
    },
    dataEditor: {
        layer: null,
        datasetName: "",
        activeTab: "data",
        selectedCell: null,
        selectedColumn: "",
        selectedRow: 0,
        editingColumnName: "",
        editingRowIndex: 0,
        selectedVariableIndex: 0,
        variableSelection: {
            selectedRowIndex: -1,
            activeRowIndex: -1,
            activeCell: null,
            range: null
        },
        contextMenu: {
            kind: "",
            target: null
        },
        cache: new Map(),
        variableColumnWidths: {
            index: 48,
            name: 160,
            type: 120,
            width: 80,
            decimals: 90,
            label: 220,
            values: 420,
            align: 120,
            measure: 120
        }
    },
    scriptEditor: {
        layer: null,
        editor: null,
        model: null,
        closeConfirmLayer: null,
        closeConfirmPromise: null,
        dirty: false,
        fileName: "Untitled.R",
        fileHandle: null,
        ignoreChanges: false,
        monaco: null,
        scriptStatement: null,
        tabs: [],
        activeTabId: "",
        sessionRestoring: false,
        sessionPersistTimer: null
    },
    workspaceContextMenu: {
        element: null,
        itemName: ""
    },
    workspaceCollapsedGroups: new Set(),
    workspacePreviousFingerprints: new Map(),
    workspaceRecentTimer: null,
    workspaceObjects: {}
};

const WORKSPACE_RECENT_MS = 2200;

const dialogRuntimePackageRequirements = {
    frequencies: ["admisc", "declared"],
    summaries: ["admisc", "declared"],
    independentsamplesttest: ["statistics"]
};

const elements = {
    menuBar: document.getElementById("webMenuBar"),
    workspaceSummary: document.getElementById("workspaceSummary")
};

const normalizeCommandText = function(value) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
};

const normalizeConstructedCommandText = function(value) {
    return normalizeCommandText(value).replace(/\n+$/g, "");
};

const escapeHtml = function(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
};

const historyStorageKey = function() {
    const product = String(state.composition?.product?.id || "DialogR");
    const runtime = String(state.composition?.runtime?.id || "webr");

    return `dialogforge.web.console.history.${product}.${runtime}`;
};

const readStoredCommandHistory = function() {
    try {
        const raw = window.localStorage.getItem(historyStorageKey());
        const parsed = JSON.parse(raw || "[]");

        return Array.isArray(parsed)
            ? parsed.map(normalizeCommandText).map((entry) => entry.trim()).filter(Boolean).slice(-500)
            : [];
    }
    catch {
        return [];
    }
};

const writeStoredCommandHistory = function(history) {
    try {
        window.localStorage.setItem(
            historyStorageKey(),
            JSON.stringify(Array.isArray(history) ? history.slice(-500) : [])
        );
    }
    catch {}
};

const recordCommandHistory = function(command) {
    state.commandHistory?.record?.(command);
};

const transcript = function() {
    return state.console?.coordinator?.getTranscript?.() || null;
};

const appendTranscript = function(text, className = "") {
    const activityId = `web_message_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const streamName = className.includes("stderr") ? "stderr" : "stdout";

    transcript()?.recordRuntimeMessageStream?.({
        id: `${activityId}_stream`,
        parent_id: activityId,
        name: streamName,
        text: String(text || "")
    });
};

const createVisibleCommandActivity = function(text, activityId = "") {
    const id = activityId || `web_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const commandText = normalizeConstructedCommandText(text);
    const consoleTranscript = transcript();

    consoleTranscript?.recordRuntimeMessageInput?.({
        id: `${id}_input`,
        parent_id: id,
        code: commandText
    });
    recordCommandHistory(commandText);
    consoleTranscript?.recordRuntimeMessageState?.({
        parent_id: id,
        state: "busy"
    });

    return {
        id,
        commandText
    };
};

const finishVisibleCommandActivity = function(activityId, stateName) {
    transcript()?.recordRuntimeMessageState?.({
        parent_id: activityId,
        state: stateName
    });
};

const workspaceEntries = function() {
    return Object.values(state.workspaceObjects || {})
        .filter((entry) => entry && typeof entry === "object" && entry.name)
        .sort((left, right) => String(left.name).localeCompare(String(right.name)));
};

const workspaceObjectNames = function() {
    return workspaceEntries().map((entry) => entry.name);
};

const notifyBrowserDialogsWorkspaceChanged = function() {
    document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
        frame.contentWindow?.postMessage({
            source: "dialogforge.browser-dialog-host",
            type: "workspaceChanged",
            objects: workspaceObjectNames(),
            activeDataset: state.activeDatasetName || ""
        }, window.location.origin);
    });
};

const readBrowserConsoleStateChips = function(dataset) {
    const datasetName = String(dataset || "").trim();
    const weightState = getSharedWeightByState(state.dialogBindingState, datasetName);
    const splitState = getSharedSplitByState(state.dialogBindingState, datasetName);
    const weight = weightState && typeof weightState === "object"
        ? String(weightState.weighting || "").trim()
        : "";
    const split = splitState && typeof splitState === "object" && Array.isArray(splitState.grouping)
        ? splitState.grouping.map((name) => String(name || "").trim()).filter(Boolean).join(", ")
        : "";

    return [
        {
            id: "weight-variable",
            labelKey: "Weight",
            accessibilityLabelKey: "Weight variable",
            value: weight
        },
        {
            id: "split-variables",
            labelKey: "Split",
            accessibilityLabelKey: "Split variables",
            value: split
        }
    ];
};

const refreshBrowserConsoleStateChips = function(dataset = state.activeDatasetName) {
    state.productStateChips = readBrowserConsoleStateChips(dataset);
    state.console?.toolbar?.render?.();
};

const notifyBrowserDialogsStateChanged = function(dataset = state.activeDatasetName) {
    document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
        frame.contentWindow?.postMessage({
            source: "dialogforge.browser-dialog-host",
            type: "dialogStateChanged",
            activeDataset: state.activeDatasetName || "",
            dataset: String(dataset || "")
        }, window.location.origin);
    });
};

const refreshWebRWorkspaceSurfaces = async function() {
    await refreshWebRWorkspacePane();
    notifyBrowserDialogsWorkspaceChanged();
    refreshBrowserConsoleStateChips();
};

const workspaceColumnNames = function(objectName) {
    const object = state.workspaceObjects[String(objectName || "")];

    return Array.isArray(object?.columns)
        ? object.columns
        : [];
};

const workspaceColumnEntries = function(objectName) {
    const object = state.workspaceObjects[String(objectName || "")];

    if (Array.isArray(object?.columnEntries) && object.columnEntries.length) {
        return object.columnEntries;
    }

    return workspaceColumnNames(objectName).map((name) => ({ name }));
};

const workspaceBroomSvg = function() {
    return [
        '<svg class="workspace-broom-icon" viewBox="0 0 9.3000004 9.3000002" xmlns="http://www.w3.org/2000/svg" focusable="false">',
        '<g transform="translate(-110.41606,-147.96284)">',
        '<path d="m 115.78808,149.31078 2.81097,2.51235 c -0.26593,2.29224 -1.56893,3.73539 -2.83636,4.78824 -3.81958,-0.2388 -4.86774,-2.17239 -5.05852,-4.8929 1.6748,-0.32835 3.21824,-0.8525 5.08391,-2.40769" />',
        '<path d="m 111.35884,154.02375 c 0.80061,-0.17938 1.56161,-0.52596 2.13669,-1.07683" />',
        '<path d="m 112.93228,155.82813 c 0.86208,-0.27179 1.76923,-0.71851 2.44111,-1.54509" />',
        '<path d="m 114.36124,150.41474 3.67783,3.28014" />',
        '<path d="m 117.28494,150.59061 2.15465,-2.02803" />',
        "</g>",
        "</svg>"
    ].join("");
};

const formatWorkspaceSummary = function(object) {
    const columns = Array.isArray(object.columns) ? object.columns.length : 0;

    if (object.kind === "data.frame") {
        return `[${object.rows || 0} rows x ${columns} columns]`;
    }

    if (object.rows) {
        return `[${object.rows}]`;
    }

    return object.kind || "object";
};

const workspaceGroupDefinitions = function() {
    return [
        { id: "datasets", title: "Datasets", items: [] },
        { id: "matrices", title: "Matrices / Arrays", items: [] },
        { id: "vectors", title: "Values", items: [] },
        { id: "functions", title: "Functions", items: [] },
        { id: "classes", title: "Classes", items: [] }
    ];
};

const workspaceObjectFingerprint = function(object) {
    return JSON.stringify({
        kind: object.kind,
        rows: object.rows,
        columns: Array.isArray(object.columns) ? object.columns.length : 0,
        summary: formatWorkspaceSummary(object)
    });
};

const workspaceGroupForObject = function(object) {
    const kind = String(object.kind || "").toLowerCase();

    if (kind === "data.frame") {
        return "datasets";
    }

    if (kind === "matrix" || kind === "array" || kind === "table") {
        return "matrices";
    }

    if (kind === "function") {
        return "functions";
    }

    if (kind === "class") {
        return "classes";
    }

    return "vectors";
};

const buildWorkspaceGroups = function(entries) {
    const groups = workspaceGroupDefinitions();
    const byId = new Map(groups.map((group) => [group.id, group]));
    const nextFingerprints = new Map();

    for (const object of entries) {
        const fingerprint = workspaceObjectFingerprint(object);
        const previous = state.workspacePreviousFingerprints.get(object.name);
        const group = byId.get(workspaceGroupForObject(object)) || byId.get("vectors");

        nextFingerprints.set(object.name, fingerprint);

        if (group) {
            group.items.push({
                ...object,
                isRecent: !previous || previous !== fingerprint
            });
        }
    }

    state.workspacePreviousFingerprints = nextFingerprints;

    return groups.filter((group) => group.items.length > 0);
};

const createWorkspaceVariableRow = function(object) {
    const row = document.createElement("div");
    const button = document.createElement("button");
    const nameWrap = document.createElement("span");
    const main = document.createElement("span");
    const summary = document.createElement("span");
    const deleteButton = document.createElement("button");
    const deleteIcon = document.createElement("span");
    const isActive = object.name === state.activeDatasetName && object.kind === "data.frame";

    row.className = `workspace-variable-row${object.isRecent ? " recent" : ""}${isActive ? " active-dataset" : ""}`;
    row.dataset.workspaceVariableRow = object.name;
    button.type = "button";
    button.className = "workspace-variable";
    button.dataset.workspaceVariable = object.name;
    nameWrap.className = "workspace-variable-name-wrap";
    main.className = "workspace-variable-main";
    main.textContent = object.name;
    nameWrap.appendChild(main);

    if (isActive) {
        const badge = document.createElement("span");

        badge.className = "workspace-active-dataset-badge";
        badge.textContent = "Active";
        badge.setAttribute("aria-label", "Active dataset");
        nameWrap.appendChild(badge);
    }

    summary.className = "workspace-variable-summary";
    summary.textContent = formatWorkspaceSummary(object);
    button.append(nameWrap, summary);

    deleteButton.type = "button";
    deleteButton.className = "workspace-variable-delete";
    deleteButton.dataset.workspaceDelete = object.name;
    deleteButton.setAttribute("aria-label", "Delete Object");
    deleteIcon.className = "codicon codicon-trash";
    deleteIcon.setAttribute("aria-hidden", "true");
    deleteButton.appendChild(deleteIcon);
    row.append(button, deleteButton);

    return row;
};

const hideWorkspaceContextMenu = function() {
    state.workspaceContextMenu.itemName = "";

    if (state.workspaceContextMenu.element) {
        state.workspaceContextMenu.element.hidden = true;
    }
};

const positionWorkspaceContextMenu = function(event) {
    const menu = state.workspaceContextMenu.element;

    if (!menu || !elements.workspaceSummary) {
        return;
    }

    menu.hidden = false;

    const hostRect = elements.workspaceSummary.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(
        Math.max(0, event.clientX - hostRect.left),
        Math.max(0, hostRect.width - menuRect.width - 4)
    );
    const top = Math.min(
        Math.max(0, event.clientY - hostRect.top),
        Math.max(0, hostRect.height - menuRect.height - 4)
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
};

const createWorkspaceContextMenu = function() {
    const menu = document.createElement("div");
    const makeActive = document.createElement("button");

    menu.className = "workspace-context-menu";
    menu.hidden = true;
    makeActive.type = "button";
    makeActive.className = "workspace-context-menu-item";
    makeActive.dataset.workspaceContextAction = "make-active";
    makeActive.textContent = "Make active";
    menu.appendChild(makeActive);

    return menu;
};

const executeWorkspaceRemove = async function(name) {
    const objectName = String(name || "").trim();

    if (!objectName) {
        return;
    }

    await executeVisibleCommand(`rm(list = ${JSON.stringify(objectName)})`);
};

const executeWorkspaceClear = async function() {
    await executeVisibleCommand("rm(list = ls())");
};

const setActiveWorkspaceDataset = function(name) {
    const datasetName = String(name || "").trim();
    const object = state.workspaceObjects[datasetName];

    if (!datasetName || object?.kind !== "data.frame") {
        return;
    }

    if (state.activeDatasetName === datasetName) {
        return;
    }

    state.activeDatasetName = datasetName;
    renderWorkspacePane();
    refreshBrowserConsoleStateChips(datasetName);
};

const renderWorkspacePane = function() {
    if (!elements.workspaceSummary) {
        return;
    }

    const entries = workspaceEntries();
    const shell = document.createElement("div");
    const header = document.createElement("div");
    const title = document.createElement("div");
    const actions = document.createElement("div");
    const clearButton = document.createElement("button");
    const clearIcon = document.createElement("span");
    const body = document.createElement("div");

    elements.workspaceSummary.replaceChildren();
    hideWorkspaceContextMenu();

    shell.className = "workspace-pane-shell";
    header.className = "workspace-pane-header";
    title.className = "workspace-pane-title";
    title.textContent = "Workspace";
    actions.className = "workspace-pane-actions";
    clearButton.type = "button";
    clearButton.className = "workspace-pane-action";
    clearButton.dataset.workspaceClear = "true";
    clearButton.dataset.tooltip = "Clear Workspace";
    clearButton.setAttribute("aria-label", "Clear Workspace");
    clearButton.disabled = entries.length === 0;
    clearIcon.className = "workspace-pane-action-icon";
    clearIcon.setAttribute("aria-hidden", "true");
    clearIcon.innerHTML = workspaceBroomSvg();
    clearButton.appendChild(clearIcon);
    actions.appendChild(clearButton);
    header.append(title, actions);
    body.className = "workspace-pane-body";
    state.workspaceContextMenu.element = createWorkspaceContextMenu();
    shell.append(header, body, state.workspaceContextMenu.element);

    if (!entries.length) {
        const empty = document.createElement("div");

        empty.className = "workspace-pane-empty";
        empty.textContent = "No objects in workspace";
        body.appendChild(empty);
        elements.workspaceSummary.appendChild(shell);
        return;
    }

    const groups = buildWorkspaceGroups(entries);

    for (const group of groups) {
        const expanded = !state.workspaceCollapsedGroups.has(group.id);
        const section = document.createElement("section");
        const sectionHeader = document.createElement("button");
        const chevron = document.createElement("span");
        const sectionTitle = document.createElement("span");
        const count = document.createElement("span");
        const items = document.createElement("div");

        section.className = "workspace-group";
        section.dataset.workspaceGroup = group.id;
        sectionHeader.type = "button";
        sectionHeader.className = "workspace-group-header";
        sectionHeader.dataset.workspaceGroupToggle = group.id;
        sectionHeader.setAttribute("aria-expanded", expanded ? "true" : "false");
        chevron.className = "workspace-group-chevron";
        chevron.textContent = expanded ? "▾" : "▸";
        sectionTitle.className = "workspace-group-title";
        sectionTitle.textContent = group.title;
        count.className = "workspace-group-count";
        count.textContent = String(group.items.length);
        sectionHeader.append(chevron, sectionTitle, count);
        items.className = "workspace-group-items";
        items.hidden = !expanded;

        if (expanded) {
            for (const object of group.items) {
                items.appendChild(createWorkspaceVariableRow(object));
            }
        }

        section.append(sectionHeader, items);
        body.appendChild(section);
    }

    if (state.workspaceRecentTimer) {
        clearTimeout(state.workspaceRecentTimer);
        state.workspaceRecentTimer = null;
    }

    if (groups.some((group) => group.items.some((item) => item.isRecent))) {
        state.workspaceRecentTimer = setTimeout(() => {
            state.workspaceRecentTimer = null;
            renderWorkspacePane();
        }, WORKSPACE_RECENT_MS + 40);
    }

    elements.workspaceSummary.appendChild(shell);
};

const installWorkspacePaneActions = function() {
    elements.workspaceSummary?.addEventListener("dblclick", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const variableButton = target?.closest("[data-workspace-variable]");
        const datasetName = variableButton?.dataset.workspaceVariable || "";
        const object = state.workspaceObjects[datasetName];

        if (!datasetName || object?.kind !== "data.frame") {
            return;
        }

        event.preventDefault();
        openDataEditorModal(datasetName).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });

    elements.workspaceSummary?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target) {
            return;
        }

        const contextAction = target.closest("[data-workspace-context-action]");
        if (contextAction) {
            event.preventDefault();

            const itemName = state.workspaceContextMenu.itemName;

            hideWorkspaceContextMenu();
            setActiveWorkspaceDataset(itemName);
            return;
        }

        if (!target.closest(".workspace-context-menu")) {
            hideWorkspaceContextMenu();
        }

        const clearButton = target.closest("[data-workspace-clear]");
        if (clearButton) {
            event.preventDefault();
            if (!clearButton.disabled) {
                executeWorkspaceClear().catch((error) => {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                });
            }
            return;
        }

        const deleteButton = target.closest("[data-workspace-delete]");
        if (deleteButton) {
            event.preventDefault();
            event.stopPropagation();
            executeWorkspaceRemove(deleteButton.dataset.workspaceDelete).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
            return;
        }

        const variableButton = target.closest("[data-workspace-variable]");

        if (variableButton) {
            setActiveWorkspaceDataset(variableButton.dataset.workspaceVariable);
            return;
        }

        const groupButton = target.closest("[data-workspace-group-toggle]");
        if (groupButton) {
            event.preventDefault();
            const section = groupButton.closest("[data-workspace-group]");
            const items = section?.querySelector(".workspace-group-items");
            const expanded = groupButton.getAttribute("aria-expanded") !== "false";
            const chevron = groupButton.querySelector(".workspace-group-chevron");
            const id = groupButton.dataset.workspaceGroupToggle || "";

            groupButton.setAttribute("aria-expanded", expanded ? "false" : "true");
            if (id) {
                if (expanded) {
                    state.workspaceCollapsedGroups.add(id);
                }
                else {
                    state.workspaceCollapsedGroups.delete(id);
                }
            }
            if (items) {
                items.hidden = expanded;
            }
            if (chevron) {
                chevron.textContent = expanded ? "▸" : "▾";
            }
        }
    });

    elements.workspaceSummary?.addEventListener("contextmenu", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const variableButton = target?.closest("[data-workspace-variable]");
        const objectName = variableButton?.dataset.workspaceVariable || "";
        const object = state.workspaceObjects[objectName];

        if (!variableButton || object?.kind !== "data.frame") {
            hideWorkspaceContextMenu();
            return;
        }

        event.preventDefault();
        state.workspaceContextMenu.itemName = objectName;
        positionWorkspaceContextMenu(event);
    });

    document.addEventListener("click", (event) => {
        if (!elements.workspaceSummary?.contains(event.target)) {
            hideWorkspaceContextMenu();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            hideWorkspaceContextMenu();
        }
    });
};

const parseWorkspaceSnapshot = function(text) {
    const entries = {};

    const readFlags = function(value) {
        const flags = {};

        for (const flag of String(value || "").split("/")) {
            const key = flag.trim();

            if (key) {
                flags[key] = true;
            }
        }

        return flags;
    };

    for (const line of String(text || "").split("\n")) {
        const parts = line.split("\t");
        const name = String(parts[0] || "").trim();

        if (!name) {
            continue;
        }

        const columns = String(parts[3] || "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
        const columnFlags = String(parts[4] || "")
            .split(",")
            .map(readFlags);

        entries[name] = {
            name,
            kind: String(parts[1] || "object").trim() || "object",
            rows: Number(parts[2] || 0) || 0,
            columns,
            columnEntries: columns.map((columnName, index) => ({
                name: columnName,
                ...(columnFlags[index] || {})
            }))
        };
    }

    return entries;
};

const parseFastWorkspaceSnapshot = function(text) {
    const entries = {};

    for (const line of String(text || "").split("\n")) {
        const parts = line.split("\t");
        const name = String(parts[0] || "").trim();

        if (!name) {
            continue;
        }

        const kind = String(parts[1] || "object").trim() || "object";
        const rows = Number(parts[2] || 0) || 0;
        const columnCount = Number(parts[3] || 0) || 0;
        const existing = state.workspaceObjects[name];
        const existingColumns = Array.isArray(existing?.columns) ? existing.columns : [];
        const columns = columnCount > 0
            ? Array.from({ length: columnCount }, (_value, index) => {
                return existingColumns[index] || `V${index + 1}`;
            })
            : [];

        entries[name] = {
            ...(existing || {}),
            name,
            kind,
            rows,
            columns,
            columnEntries: Array.isArray(existing?.columnEntries) && existing.columnEntries.length === columnCount
                ? existing.columnEntries
                : columns.map((columnName) => ({ name: columnName }))
        };
    }

    return entries;
};

const refreshWebRWorkspacePaneFast = async function() {
    if (!state.runtimeReady || !state.runtime?.evalRString) {
        renderWorkspacePane();
        return;
    }

    const text = await state.runtime.evalRString([
        "local({",
        "  names <- ls(envir = .GlobalEnv)",
        "  if (!length(names)) return(\"\")",
        "  paste(vapply(names, function(name) {",
        "    object <- get(name, envir = .GlobalEnv)",
        "    kind <- class(object)[1]",
        "    rows <- if (is.data.frame(object) || is.matrix(object)) nrow(object) else length(object)",
        "    columns <- if (is.data.frame(object) || is.matrix(object)) ncol(object) else 0L",
        "    paste(name, kind, rows, columns, sep = \"\\t\")",
        "  }, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n"));

    state.workspaceObjects = parseFastWorkspaceSnapshot(text);

    if (!state.workspaceObjects[state.activeDatasetName]) {
        const firstDataFrame = workspaceEntries().find((entry) => entry.kind === "data.frame");

        state.activeDatasetName = firstDataFrame?.name || "";
    }

    renderWorkspacePane();
};

const refreshWebRWorkspaceMetadataInBackground = function() {
    refreshWebRWorkspaceSurfaces().catch((error) => {
        console.error(error);
    });
};

const refreshWebRWorkspacePane = async function() {
    if (!state.runtimeReady || !state.runtime?.evalRString) {
        renderWorkspacePane();
        return;
    }

    const text = await state.runtime.evalRString([
        "local({",
        "  names <- ls(envir = .GlobalEnv)",
        "  if (!length(names)) return(\"\")",
        "  paste(vapply(names, function(name) {",
        "    object <- get(name, envir = .GlobalEnv)",
        "    kind <- class(object)[1]",
        "    rows <- if (is.data.frame(object) || is.matrix(object)) nrow(object) else length(object)",
        "    columns <- if (is.data.frame(object) || is.matrix(object)) paste(colnames(object), collapse = \",\") else \"\"",
        "    flags <- \"\"",
        "    if (is.data.frame(object)) {",
        "      flags <- paste(vapply(object, function(column) {",
        "        flag <- character(0)",
        "        declared_namespace <- if (requireNamespace(\"declared\", quietly = TRUE)) asNamespace(\"declared\") else NULL",
        "        source <- if (!is.null(declared_namespace) && inherits(column, \"declared\")) {",
        "          tryCatch(get(\"undeclare\", envir = declared_namespace)(column, drop = TRUE), error = function(error) column)",
        "        } else column",
        "        labels <- tryCatch(attr(column, \"labels\", exact = TRUE), error = function(error) NULL)",
        "        measure_attribute <- tryCatch(attr(column, \"measurement\", exact = TRUE), error = function(error) NULL)",
        "        measure <- if (is.null(measure_attribute) || !length(measure_attribute)) \"\" else trimws(as.character(measure_attribute[[1]]))",
        "        if (!nzchar(measure) && !is.null(declared_namespace)) {",
        "          likely_measure <- tryCatch(get(\"likely_measurement\", envir = declared_namespace)(column), error = function(error) \"\")",
        "          measure <- if (is.null(likely_measure) || !length(likely_measure)) \"\" else trimws(as.character(likely_measure[[1]]))",
        "        }",
        "        if (identical(measure, \"quantitative\")) measure <- \"interval\"",
        "        if (identical(measure, \"categorical\")) measure <- if (is.ordered(source)) \"ordinal\" else \"nominal\"",
        "        category_count <- if (!is.null(labels) && length(labels)) length(as.character(labels)) else if (is.factor(source)) length(levels(source)) else 0L",
        "        is_date <- inherits(source, \"Date\")",
        "        is_character <- is.character(source)",
        "        is_categorical <- is.factor(source) || is_character || is.logical(source) || (!is.null(labels) && length(labels) > 0L) || identical(measure, \"nominal\") || identical(measure, \"ordinal\")",
        "        intrinsic_numeric <- !is_date && (is.numeric(source) || is.integer(source) || is.logical(source))",
        "        ordinal_numeric <- identical(measure, \"ordinal\") && category_count >= 7L",
        "        nominal_non_numeric <- identical(measure, \"nominal\") && category_count > 0L",
        "        is_numeric <- (isTRUE(intrinsic_numeric) && !isTRUE(nominal_non_numeric)) || isTRUE(ordinal_numeric)",
        "        if (is_numeric) flag <- c(flag, \"numeric\")",
        "        if (is_categorical) flag <- c(flag, \"categorical\", \"factor\")",
        "        if (is_character) flag <- c(flag, \"character\")",
        "        if (is.logical(source) || category_count == 2L) flag <- c(flag, \"binary\")",
        "        if (is_date) flag <- c(flag, \"date\")",
        "        paste(flag, collapse = \"/\")",
        "      }, character(1)), collapse = \",\")",
        "    }",
        "    paste(name, kind, rows, columns, flags, sep = \"\\t\")",
        "  }, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n"));

    state.workspaceObjects = parseWorkspaceSnapshot(text);

    if (!state.workspaceObjects[state.activeDatasetName]) {
        const firstDataFrame = workspaceEntries().find((entry) => entry.kind === "data.frame");

        state.activeDatasetName = firstDataFrame?.name || "";
    }

    renderWorkspacePane();
};

const cleanDatasetEditorCell = function(value) {
    return String(value ?? "").replace(/\r/g, " ").replace(/\n/g, " ");
};

const DATA_EDITOR_ROW_HEIGHT = 26;
const DATA_EDITOR_HEADER_HEIGHT = 27;
const DATA_EDITOR_INDEX_COLUMN_WIDTH = 58;
const DATA_EDITOR_COLUMN_WIDTH = 112;
const DATA_EDITOR_OVERSCAN_ROWS = 20;
const DATA_EDITOR_OVERSCAN_COLUMNS = 4;
const DATA_EDITOR_INITIAL_ROWS = 40;
const DATA_EDITOR_INITIAL_COLUMNS = 32;
const DATA_EDITOR_VARIABLE_OVERSCAN_ROWS = 20;

const splitDatasetEditorValues = function(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const decodeDatasetEditorPart = function(value) {
    try {
        return decodeURIComponent(String(value || ""));
    }
    catch (_error) {
        return String(value || "");
    }
};

const parseDatasetEditorCategoryState = function(text) {
    const source = String(text || "");

    if (!source) {
        return [];
    }

    return source.split("\u001e").map((entry) => {
        const parts = entry.split("\u001f");

        return {
            value: decodeDatasetEditorPart(parts[0] || ""),
            label: decodeDatasetEditorPart(parts[1] || ""),
            isMissing: parts[2] === "true"
        };
    }).filter((entry) => entry.value || entry.label);
};

const parseDatasetEditorMissingRange = function(text) {
    const source = String(text || "");

    if (!source) {
        return null;
    }

    const parts = source.split("\u001f");
    const minimum = decodeDatasetEditorPart(parts[0] || "");
    const maximum = decodeDatasetEditorPart(parts[1] || "");

    if (!minimum || !maximum) {
        return null;
    }

    return {
        min: minimum,
        max: maximum
    };
};

const parseDatasetEditorCellState = function(text) {
    const parts = String(text || "").split("\u001f");

    return {
        display: cleanDatasetEditorCell(decodeDatasetEditorPart(parts[0] || "")),
        declaredMissing: parts[1] === "true"
    };
};

const summarizeDatasetEditorValues = function(categories, missingRange, fallback) {
    const preview = Array.isArray(categories)
        ? categories.slice(0, 2).map((category) => {
            return String(category.label || category.value || "").trim();
        }).filter(Boolean)
        : [];

    if (preview.length) {
        return preview.join(", ");
    }

    if (missingRange?.min && missingRange?.max) {
        return `range ${missingRange.min}:${missingRange.max}`;
    }

    return cleanDatasetEditorCell(fallback);
};

const parseDatasetEditorSnapshot = function(text, datasetName) {
    const snapshot = {
        name: datasetName,
        rowCount: 0,
        columnCount: 0,
        rowStart: 1,
        columnStart: 1,
        allColumns: [],
        columns: [],
        rows: [],
        variables: []
    };

    for (const line of String(text || "").split("\n")) {
        const parts = line.split("\t");
        const kind = parts.shift();

        if (kind === "META") {
            snapshot.rowCount = Number(parts[0] || 0) || 0;
            snapshot.columnCount = Number(parts[1] || 0) || 0;
            continue;
        }

        if (kind === "WINDOW") {
            snapshot.rowStart = Number(parts[0] || 1) || 1;
            snapshot.columnStart = Number(parts[1] || 1) || 1;
            continue;
        }

        if (kind === "ALL_COLUMNS") {
            snapshot.allColumns = parts.map(cleanDatasetEditorCell);
            continue;
        }

        if (kind === "COLUMNS") {
            snapshot.columns = parts.map(cleanDatasetEditorCell);
            continue;
        }

        if (kind === "ROW") {
            snapshot.rows.push({
                index: Number(parts.shift() || 0) || snapshot.rows.length + 1,
                name: cleanDatasetEditorCell(parts.shift() || ""),
                values: parts.map(parseDatasetEditorCellState)
            });
            continue;
        }

        if (kind === "VAR") {
            const categories = parseDatasetEditorCategoryState(parts[9] || "");
            const missingRange = parseDatasetEditorMissingRange(parts[10] || "");

            snapshot.variables.push({
                index: Number(parts[0] || 0) || snapshot.variables.length + 1,
                name: cleanDatasetEditorCell(parts[1] || ""),
                type: cleanDatasetEditorCell(parts[2] || ""),
                width: Number(parts[3] || 0) || 0,
                decimals: Number(parts[4] || 0) || 0,
                label: cleanDatasetEditorCell(parts[5] || ""),
                values: summarizeDatasetEditorValues(categories, missingRange, parts[6] || ""),
                align: cleanDatasetEditorCell(parts[7] || ""),
                measure: cleanDatasetEditorCell(parts[8] || ""),
                categories,
                missingRange,
                declared: parts[11] === "true"
            });
        }
    }

    if (!snapshot.allColumns.length) {
        snapshot.allColumns = snapshot.columns.slice();
    }

    return snapshot;
};

const dataEditorSnapshotPrelude = function() {
    return [
        "  .clean <- function(value) {",
        "    value <- as.character(value)",
        "    value[is.na(value)] <- \"NA\"",
        "    gsub(\"[\\t\\r\\n]\", \" \", value)",
        "  }",
        "  .enc <- function(value) {",
        "    if (is.null(value) || !length(value) || is.na(value[[1]])) value <- \"\"",
        "    utils::URLencode(as.character(value[[1]]), reserved = TRUE)",
        "  }",
        "  .measurement <- function(value) {",
        "    .measure <- attr(value, \"measurement\", exact = TRUE)",
        "    if (is.null(.measure)) .measure <- attr(value, \"measure\", exact = TRUE)",
        "    if (is.null(.measure) || !nzchar(as.character(.measure))) .measure <- if (is.numeric(value) || is.integer(value)) \"scale\" else \"nominal\"",
        "    .measure <- as.character(.measure)",
        "    if (.measure == \"scale\") .measure <- \"interval\"",
        "    .measure",
        "  }",
        "  .alignment <- function(value) {",
        "    .align <- attr(value, \"align\", exact = TRUE)",
        "    if (is.null(.align) || !nzchar(as.character(.align))) .align <- if (is.numeric(value) || is.integer(value)) \"right\" else \"left\"",
        "    as.character(.align)",
        "  }",
        "  .category_state <- function(value) {",
        "    .labels <- attr(value, \"labels\", exact = TRUE)",
        "    .na_values <- attr(value, \"na_values\", exact = TRUE)",
        "    if (!is.null(.labels) && length(.labels)) {",
        "      .values <- as.character(unname(.labels))",
        "      .names <- names(.labels)",
        "      .names[is.na(.names) | !nzchar(.names)] <- .values[is.na(.names) | !nzchar(.names)]",
        "    } else if (is.factor(value)) {",
        "      .values <- levels(value)",
        "      .names <- .values",
        "    } else {",
        "      .values <- character(0)",
        "      .names <- character(0)",
        "    }",
        "    if (!length(.values)) return(\"\")",
        "    paste(vapply(seq_along(.values), function(.index) {",
        "      paste(.enc(.values[[.index]]), .enc(.names[[.index]]), if (is.element(as.character(.values[[.index]]), as.character(.na_values))) \"true\" else \"false\", sep = \"\\u001f\")",
        "    }, character(1)), collapse = \"\\u001e\")",
        "  }",
        "  .range_state <- function(value) {",
        "    .range <- attr(value, \"na_range\", exact = TRUE)",
        "    if (is.null(.range) || length(.range) < 2L) return(\"\")",
        "    paste(.enc(.range[[1]]), .enc(.range[[2]]), sep = \"\\u001f\")",
        "  }",
        "  .declared_index_value <- function(column, row) {",
        "    .index <- attr(column, \"na_index\", exact = TRUE)",
        "    if (is.null(.index) || !length(.index) || !is.element(row, .index)) return(NULL)",
        "    .position <- match(row, .index)",
        "    .names <- names(.index)",
        "    if (is.null(.names) || length(.names) < .position) return(\"\")",
        "    as.character(.names[[.position]])",
        "  }",
        "  .declared_missing <- function(column, cell) {",
        "    .na_values <- attr(column, \"na_values\", exact = TRUE)",
        "    .na_range <- attr(column, \"na_range\", exact = TRUE)",
        "    .value_match <- !is.null(.na_values) && is.element(as.character(cell), as.character(.na_values))",
        "    .range_match <- FALSE",
        "    if (!is.null(.na_range) && length(.na_range) >= 2L) {",
        "      .cell <- suppressWarnings(as.numeric(cell))",
        "      .range <- suppressWarnings(as.numeric(.na_range[seq_len(2L)]))",
        "      .range_match <- !is.na(.cell) && !any(is.na(.range)) && .cell >= min(.range) && .cell <= max(.range)",
        "    }",
        "    isTRUE(.value_match || .range_match)",
        "  }",
        "  .cell_state <- function(column, row) {",
        "    .cell <- column[[row]]",
        "    .declared_value <- if (length(.cell) == 1L && is.na(.cell)) .declared_index_value(column, row) else NULL",
        "    if (!is.null(.declared_value)) return(paste(.enc(.declared_value), \"true\", sep = \"\\u001f\"))",
        "    cell <- .cell",
        "    paste(.enc(.clean(cell)), if (.declared_missing(column, cell)) \"true\" else \"false\", sep = \"\\u001f\")",
        "  }",
        "  .variable_state <- function(.df, .column) {",
        "    .value <- .df[[.column]]",
        "    .type <- class(.value)[1]",
        "    .measure <- .measurement(.value)",
        "    .align <- .alignment(.value)",
        "    .label <- attr(.value, \"label\", exact = TRUE)",
        "    if (is.null(.label)) .label <- \"\"",
        "    .width <- max(1L, suppressWarnings(as.integer(attr(.value, \"width\", exact = TRUE) %||% max(nchar(.clean(.value)), na.rm = TRUE))))",
        "    if (!is.finite(.width)) .width <- 1L",
        "    .decimals <- suppressWarnings(as.integer(attr(.value, \"decimals\", exact = TRUE) %||% 0L))",
        "    if (!is.finite(.decimals)) .decimals <- 0L",
        "    .values <- if (is.factor(.value)) paste(levels(.value), collapse = \", \") else \"\"",
        "    paste(c(\"VAR\", .column, .clean(colnames(.df)[.column]), .clean(.type), .width, .decimals, .clean(.label), .clean(.values), .clean(.align), .clean(.measure), .category_state(.value), .range_state(.value), if (inherits(.value, \"declared\")) \"true\" else \"false\"), collapse = \"\\t\")",
        "  }"
    ];
};

const getDataEditorCache = function(datasetName) {
    const key = String(datasetName || "").trim();
    let cache = state.dataEditor.cache.get(key);

    if (!cache) {
        cache = {
            snapshot: null,
            variables: [],
            variablesLoaded: 0,
            variablesLoading: false,
            variablesViewportLoading: false,
            dataLoading: false,
            loadedWindow: {
                rowStart: 1,
                rowEnd: 0,
                columnStart: 1,
                columnEnd: 0
            },
            pendingDataViewport: null,
            dataScrollTimer: 0,
            variablesScrollTimer: 0
        };
        state.dataEditor.cache.set(key, cache);
    }

    return cache;
};

const readDataEditorSnapshot = async function(
    datasetName,
    rowStart = 1,
    rowCount = DATA_EDITOR_INITIAL_ROWS,
    columnStart = 1,
    columnCount = DATA_EDITOR_INITIAL_COLUMNS
) {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .name <- ${JSON.stringify(String(datasetName || ""))}`,
        `  .row_start <- ${JSON.stringify(Math.max(1, Math.floor(Number(rowStart) || 1)))}`,
        `  .row_count_requested <- ${JSON.stringify(Math.max(1, Math.floor(Number(rowCount) || DATA_EDITOR_INITIAL_ROWS)))}`,
        `  .column_start <- ${JSON.stringify(Math.max(1, Math.floor(Number(columnStart) || 1)))}`,
        `  .column_count_requested <- ${JSON.stringify(Math.max(1, Math.floor(Number(columnCount) || DATA_EDITOR_INITIAL_COLUMNS)))}`,
        "  `%||%` <- function(left, right) if (is.null(left)) right else left",
        ...dataEditorSnapshotPrelude(),
        "  if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) return(\"\")",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df)) return(\"\")",
        "  .row_count <- nrow(.df)",
        "  .column_count <- ncol(.df)",
        "  .columns <- colnames(.df)",
        "  .row_end <- min(.row_count, .row_start + .row_count_requested - 1L)",
        "  .column_end <- min(.column_count, .column_start + .column_count_requested - 1L)",
        "  .row_index <- if (.row_count > 0L && .row_start <= .row_end) seq.int(.row_start, .row_end) else integer(0)",
        "  .column_index <- if (.column_count > 0L && .column_start <= .column_end) seq.int(.column_start, .column_end) else integer(0)",
        "  .lines <- c(",
        "    paste(\"META\", .row_count, .column_count, sep = \"\\t\"),",
        "    paste(\"WINDOW\", if (length(.row_index)) .row_index[[1]] else .row_start, if (length(.column_index)) .column_index[[1]] else .column_start, sep = \"\\t\"),",
        "    paste(c(\"ALL_COLUMNS\", .clean(.columns)), collapse = \"\\t\"),",
        "    paste(c(\"COLUMNS\", .clean(.columns[.column_index])), collapse = \"\\t\")",
        "  )",
        "  if (length(.row_index) && length(.column_index)) {",
        "    .lines <- c(.lines, vapply(.row_index, function(.row) {",
        "      .values <- vapply(.column_index, function(.column) .cell_state(.df[[.column]], .row), character(1))",
        "      paste(c(\"ROW\", .row, .clean(rownames(.df)[.row]), .values), collapse = \"\\t\")",
        "    }, character(1)))",
        "  }",
        "  paste(.lines, collapse = \"\\n\")",
        "})"
    ].join("\n");

    return parseDatasetEditorSnapshot(await runtime.evalRString(command), datasetName);
};

const readDataEditorVariableBatch = async function(datasetName, start, count) {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .name <- ${JSON.stringify(String(datasetName || ""))}`,
        `  .start <- ${JSON.stringify(Math.max(1, Math.floor(Number(start) || 1)))}`,
        `  .count <- ${JSON.stringify(Math.max(1, Math.floor(Number(count) || 64)))}`,
        "  `%||%` <- function(left, right) if (is.null(left)) right else left",
        ...dataEditorSnapshotPrelude(),
        "  if (!exists(.name, envir = .GlobalEnv, inherits = FALSE)) return(\"\")",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df)) return(\"\")",
        "  .column_count <- ncol(.df)",
        "  .end <- min(.column_count, .start + .count - 1L)",
        "  if (.column_count < 1L || .start > .end) return(\"\")",
        "  paste(vapply(seq.int(.start, .end), function(.column) {",
        "    .variable_state(.df, .column)",
        "  }, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n");

    return parseDatasetEditorSnapshot(await runtime.evalRString(command), datasetName).variables;
};

const writeDataEditorCellValue = async function(datasetName, rowIndex, columnName, value) {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .name <- ${JSON.stringify(String(datasetName || ""))}`,
        `  .row <- ${JSON.stringify(Number(rowIndex) || 0)}`,
        `  .column <- ${JSON.stringify(String(columnName || ""))}`,
        `  .value <- ${JSON.stringify(String(value ?? ""))}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || !is.element(.column, colnames(.df))) stop(\"invalid-cell-target\")",
        "  .old <- .df[[.column]]",
        "  .next <- .value",
        "  if (is.factor(.old)) {",
        "    if (!is.element(.next, levels(.old))) levels(.old) <- c(levels(.old), .next)",
        "    .old[.row] <- .next",
        "    .df[[.column]] <- .old",
        "  } else if (is.integer(.old)) {",
        "    .df[[.column]][.row] <- suppressWarnings(as.integer(.next))",
        "  } else if (is.numeric(.old)) {",
        "    .df[[.column]][.row] <- suppressWarnings(as.numeric(.next))",
        "  } else if (is.logical(.old)) {",
        "    .df[[.column]][.row] <- as.logical(.next)",
        "  } else {",
        "    .df[[.column]][.row] <- .next",
        "  }",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");

    await runtime.evalRVoid(command);
    state.dataEditor.cache.delete(String(datasetName || "").trim());
};

const writeDataEditorVariableName = async function(datasetName, columnIndex, value) {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .name <- ${JSON.stringify(String(datasetName || ""))}`,
        `  .column <- ${JSON.stringify(Number(columnIndex) || 0)}`,
        `  .value <- ${JSON.stringify(String(value || ""))}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .column < 1L || .column > ncol(.df) || !nzchar(.value)) stop(\"invalid-variable-name\")",
        "  colnames(.df)[.column] <- make.names(.value, unique = TRUE)",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");

    await runtime.evalRVoid(command);
    state.dataEditor.cache.delete(String(datasetName || "").trim());
};

const writeDataEditorVariableAttribute = async function(datasetName, columnIndex, attributeName, value) {
    const runtime = await ensureRuntime();
    const cleanAttribute = String(attributeName || "");
    const command = [
        "local({",
        `  .name <- ${JSON.stringify(String(datasetName || ""))}`,
        `  .column <- ${JSON.stringify(Number(columnIndex) || 0)}`,
        `  .attribute <- ${JSON.stringify(cleanAttribute)}`,
        `  .value <- ${JSON.stringify(String(value ?? ""))}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .column < 1L || .column > ncol(.df)) stop(\"invalid-variable-target\")",
        "  if (!is.element(.attribute, c(\"label\", \"measure\", \"align\", \"width\", \"decimals\"))) stop(\"invalid-variable-attribute\")",
        "  if (.attribute == \"measure\") {",
        "    attr(.df[[.column]], \"measurement\") <- if (nzchar(.value)) .value else NULL",
        "    attr(.df[[.column]], \"measure\") <- if (nzchar(.value)) .value else NULL",
        "  } else if (.attribute == \"width\" || .attribute == \"decimals\") {",
        "    attr(.df[[.column]], .attribute) <- suppressWarnings(as.integer(.value))",
        "  } else {",
        "    attr(.df[[.column]], .attribute) <- if (nzchar(.value)) .value else NULL",
        "  }",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");

    await runtime.evalRVoid(command);
    state.dataEditor.cache.delete(String(datasetName || "").trim());
};

const writeDataEditorValueLabels = async function(datasetName, columnIndex, categories, missingRange) {
    const runtime = await ensureRuntime();
    const cleanCategories = Array.isArray(categories)
        ? categories.map((entry) => ({
            value: String(entry?.value || "").trim(),
            label: String(entry?.label || "").trim(),
            isMissing: Boolean(entry?.isMissing)
        })).filter((entry) => entry.value)
        : [];
    const categoryValues = cleanCategories.length
        ? cleanCategories.map((entry) => JSON.stringify(entry.value)).join(", ")
        : "";
    const categoryLabels = cleanCategories.length
        ? cleanCategories.map((entry) => JSON.stringify(entry.label || entry.value)).join(", ")
        : "";
    const categoryMissing = cleanCategories.length
        ? cleanCategories.map((entry) => entry.isMissing ? "TRUE" : "FALSE").join(", ")
        : "";
    const rangeMinimum = missingRange?.min ? JSON.stringify(String(missingRange.min)) : "NULL";
    const rangeMaximum = missingRange?.max ? JSON.stringify(String(missingRange.max)) : "NULL";
    const command = [
        "local({",
        `  .name <- ${JSON.stringify(String(datasetName || ""))}`,
        `  .column <- ${JSON.stringify(Number(columnIndex) || 0)}`,
        `  .category_values <- c(${categoryValues})`,
        `  .category_labels <- c(${categoryLabels})`,
        `  .category_missing <- c(${categoryMissing})`,
        `  .range_min <- ${rangeMinimum}`,
        `  .range_max <- ${rangeMaximum}`,
        "  .coerce_like <- function(values, template) {",
        "    if (is.factor(template)) return(as.character(values))",
        "    if (is.integer(template)) return(suppressWarnings(as.integer(values)))",
        "    if (is.numeric(template)) return(suppressWarnings(as.numeric(values)))",
        "    if (is.logical(template)) return(as.logical(values))",
        "    as.character(values)",
        "  }",
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .column < 1L || .column > ncol(.df)) stop(\"invalid-variable-target\")",
        "  .source <- .df[[.column]]",
        "  if (length(.category_values) && any(!nzchar(.category_values))) stop(\"invalid-value-labels\")",
        "  .label_values <- if (length(.category_values)) .coerce_like(.category_values, .source) else NULL",
        "  if (!is.null(.label_values)) names(.label_values) <- .category_labels",
        "  .missing_values <- if (!is.null(.label_values)) .label_values[seq_along(.label_values) <= length(.category_missing) & .category_missing] else NULL",
        "  if (!length(.missing_values)) .missing_values <- NULL",
        "  .missing_range <- NULL",
        "  if (!is.null(.range_min) && !is.null(.range_max) && nzchar(.range_min) && nzchar(.range_max)) {",
        "    .missing_range <- .coerce_like(c(.range_min, .range_max), .source)",
        "  }",
        "  .label <- attr(.source, \"label\", exact = TRUE)",
        "  .measure <- attr(.source, \"measurement\", exact = TRUE)",
        "  if (is.null(.measure)) .measure <- attr(.source, \"measure\", exact = TRUE)",
        "  .rebuilt <- .source",
        "  if (requireNamespace(\"declared\", quietly = TRUE)) {",
        "    if (!is.null(.label_values) || !is.null(.missing_values) || !is.null(.missing_range) || inherits(.source, \"declared\")) {",
        "      .rebuilt <- declared::declared(.source, labels = .label_values, na_values = .missing_values, na_range = .missing_range, label = .label, measurement = .measure)",
        "    }",
        "  } else {",
        "    attr(.rebuilt, \"labels\") <- .label_values",
        "    attr(.rebuilt, \"na_values\") <- .missing_values",
        "    attr(.rebuilt, \"na_range\") <- .missing_range",
        "  }",
        "  attr(.rebuilt, \"labels\") <- .label_values",
        "  attr(.rebuilt, \"na_values\") <- .missing_values",
        "  attr(.rebuilt, \"na_range\") <- .missing_range",
        "  attr(.rebuilt, \"label\") <- .label",
        "  if (!is.null(.measure)) attr(.rebuilt, \"measurement\") <- .measure",
        "  .df[[.column]] <- .rebuilt",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n");

    await runtime.evalRVoid(command);
    state.dataEditor.cache.delete(String(datasetName || "").trim());
};

const readDataEditorColumns = function(snapshot) {
    const columns = Array.isArray(snapshot?.allColumns) && snapshot.allColumns.length
        ? snapshot.allColumns
        : snapshot?.columns || [];

    return columns.map(cleanDatasetEditorCell).filter(Boolean);
};

const dataEditorColumnWidthAt = function(_columnIndex) {
    return DATA_EDITOR_COLUMN_WIDTH;
};

const dataEditorColumnOffset = function(columnIndex) {
    const index = Math.max(1, Math.floor(Number(columnIndex) || 1));

    return DATA_EDITOR_INDEX_COLUMN_WIDTH + (index - 1) * DATA_EDITOR_COLUMN_WIDTH;
};

const readDataEditorViewportPlan = function(host, snapshot) {
    const rowCount = Math.max(0, Number(snapshot?.rowCount || 0));
    const columnCount = Math.max(0, Number(snapshot?.columnCount || 0));
    const viewportHeight = Math.max(host?.clientHeight || 0, DATA_EDITOR_ROW_HEIGHT * 8);
    const viewportWidth = Math.max(host?.clientWidth || 0, DATA_EDITOR_COLUMN_WIDTH * 8);
    const scrollTop = Math.max(0, host?.scrollTop || 0);
    const scrollLeft = Math.max(0, host?.scrollLeft || 0);
    const visibleRowStart = Math.max(1, Math.floor(scrollTop / DATA_EDITOR_ROW_HEIGHT) + 1);
    const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / DATA_EDITOR_ROW_HEIGHT));
    const visibleRowEnd = Math.min(rowCount, visibleRowStart + visibleRowCount - 1);
    const visibleColumnStart = Math.max(
        1,
        Math.floor(Math.max(0, scrollLeft - DATA_EDITOR_INDEX_COLUMN_WIDTH) / DATA_EDITOR_COLUMN_WIDTH) + 1
    );
    const visibleColumnCount = Math.max(1, Math.ceil(viewportWidth / DATA_EDITOR_COLUMN_WIDTH));
    const visibleColumnEnd = Math.min(columnCount, visibleColumnStart + visibleColumnCount - 1);
    const rowStart = Math.max(1, visibleRowStart - DATA_EDITOR_OVERSCAN_ROWS);
    const rowEnd = Math.min(rowCount, visibleRowEnd + DATA_EDITOR_OVERSCAN_ROWS);
    const columnStart = Math.max(1, visibleColumnStart - DATA_EDITOR_OVERSCAN_COLUMNS);
    const columnEnd = Math.min(columnCount, visibleColumnEnd + DATA_EDITOR_OVERSCAN_COLUMNS);

    return {
        rowStart,
        rowCount: Math.max(1, rowEnd - rowStart + 1),
        rowEnd,
        columnStart,
        columnEnd,
        columnCount: Math.max(1, columnEnd - columnStart + 1)
    };
};

const dataEditorLoadedWindowContains = function(loadedWindow, plan) {
    return Boolean(
        loadedWindow
        && Number(loadedWindow.rowStart || 0) <= Number(plan.rowStart || 0)
        && Number(loadedWindow.rowEnd || 0) >= Number(plan.rowEnd || 0)
        && Number(loadedWindow.columnStart || 0) <= Number(plan.columnStart || 0)
        && Number(loadedWindow.columnEnd || 0) >= Number(plan.columnEnd || 0)
    );
};

const createDatasetEditorVirtualSurface = function(snapshot, table, options = {}) {
    const surface = document.createElement("div");
    const rowCount = Math.max(0, Number(options.rowCount ?? snapshot?.rowCount ?? 0));
    const columnCount = Math.max(0, Number(options.columnCount ?? snapshot?.columnCount ?? 0));
    const tableTop = Math.max(0, Number(options.top || 0));
    const tableLeft = Math.max(0, Number(options.left || 0));
    const totalWidth = Math.max(
        DATA_EDITOR_INDEX_COLUMN_WIDTH + columnCount * DATA_EDITOR_COLUMN_WIDTH,
        tableLeft + table.offsetWidth
    );
    const totalHeight = Math.max(
        DATA_EDITOR_HEADER_HEIGHT + rowCount * DATA_EDITOR_ROW_HEIGHT,
        tableTop + table.offsetHeight
    );

    surface.className = "dataset-sheet__virtual-surface";
    surface.style.width = `${totalWidth}px`;
    surface.style.height = `${totalHeight}px`;
    table.classList.add("dataset-grid--virtual");
    table.style.top = `${tableTop}px`;
    table.style.left = `${tableLeft}px`;
    surface.appendChild(table);

    return surface;
};

const createDatasetEditorTableCell = function(tagName, text, className = "") {
    const cell = document.createElement(tagName);

    if (className) {
        cell.className = className;
    }
    cell.textContent = cleanDatasetEditorCell(text);

    return cell;
};

const createDatasetEditorInlineInput = function(value, dataset) {
    const input = document.createElement("input");

    input.className = "dataset-grid__data-input";
    input.value = String(value || "");
    Object.entries(dataset).forEach(([key, entry]) => {
        input.dataset[key] = String(entry);
    });

    return input;
};

const variableSelectionRangeRows = function(rowIndex, key) {
    const selection = state.dataEditor.variableSelection || {};
    const range = selection.range;

    if (
        !range
        || !isVariableMetadataRangeKey(key)
        || String(range.key || "") !== String(key || "")
    ) {
        return [Number(rowIndex) || 0].filter(Boolean);
    }

    const start = Math.min(Number(range.start) || 0, Number(range.end) || 0);
    const end = Math.max(Number(range.start) || 0, Number(range.end) || 0);
    const rows = [];

    for (let index = start; index <= end; index += 1) {
        rows.push(index);
    }

    return rows;
};

const isVariableMetadataRangeKey = function(key) {
    return String(key || "") !== "name";
};

const isVariableCellSelected = function(rowIndex, key) {
    const selection = state.dataEditor.variableSelection || {};
    const activeCell = selection.activeCell;

    if (
        activeCell
        && Number(activeCell.rowIndex || 0) === Number(rowIndex || 0)
        && String(activeCell.key || "") === String(key || "")
    ) {
        return true;
    }

    return variableSelectionRangeRows(rowIndex, key).length > 1
        && variableSelectionRangeRows(rowIndex, key).includes(Number(rowIndex) || 0);
};

const datasetEditorSetVariableCellAttributes = function(cell, variableIndex, key) {
    cell.dataset.variableCell = key;
    cell.dataset.variableRow = String(variableIndex);

    if (isVariableCellSelected(variableIndex, key)) {
        cell.classList.add("is-cell-selected");
    }
};

const datasetEditorSetVariableFieldAttributes = function(field, variableIndex, key) {
    field.dataset.variableField = key;
    field.dataset.variableIndex = String(variableIndex);
    field.dataset.variableRow = String(variableIndex);
};

const renderDatasetEditorDataTable = function(host, snapshot) {
    const table = document.createElement("table");
    const colgroup = document.createElement("colgroup");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const headerRow = document.createElement("tr");
    const rowIndexColumn = document.createElement("col");

    table.className = "dataset-grid dataset-grid--data";
    rowIndexColumn.style.width = `${DATA_EDITOR_INDEX_COLUMN_WIDTH}px`;
    colgroup.appendChild(rowIndexColumn);
    headerRow.appendChild(createDatasetEditorTableCell("th", "", "row-index"));
    snapshot.columns.forEach((column, index) => {
        const col = document.createElement("col");
        const columnIndex = Number(snapshot.columnStart || 1) + index;
        const header = createDatasetEditorTableCell("th", column);

        col.style.width = `${dataEditorColumnWidthAt(columnIndex)}px`;
        colgroup.appendChild(col);
        header.dataset.dataHeader = column;
        if (state.dataEditor.selectedColumn === column) {
            header.classList.add("is-selected");
        }
        if (state.dataEditor.editingColumnName === column) {
            header.replaceChildren(createDatasetEditorInlineInput(column, {
                headerEditor: "true",
                dataColumn: column
            }));
        }
        headerRow.appendChild(header);
    });
    thead.appendChild(headerRow);

    snapshot.rows.forEach((row) => {
        const tr = document.createElement("tr");
        const rowIndexCell = createDatasetEditorTableCell("td", row.name || row.index, "row-index");

        rowIndexCell.dataset.rowName = String(row.index);
        if (Number(state.dataEditor.selectedRow || 0) === Number(row.index || 0)) {
            rowIndexCell.classList.add("is-selected");
        }
        if (Number(state.dataEditor.editingRowIndex || 0) === Number(row.index || 0)) {
            rowIndexCell.classList.add("is-active-cell");
            rowIndexCell.replaceChildren(createDatasetEditorInlineInput(row.name || row.index, {
                rownameEditor: "true",
                dataRow: row.index
            }));
        }
        tr.appendChild(rowIndexCell);
        snapshot.columns.forEach((column, index) => {
            const value = row.values[index];
            const display = value && typeof value === "object"
                ? value.display
                : value;
            const cell = createDatasetEditorTableCell("td", display || "");

            cell.className = "dataset-grid__data-cell";
            if (value && typeof value === "object" && value.declaredMissing) {
                cell.classList.add("is-declared-missing");
            }
            cell.tabIndex = 0;
            cell.dataset.rowIndex = String(row.index);
            cell.dataset.columnName = column;
            cell.dataset.dataCell = "true";
            cell.dataset.dataRow = String(row.index);
            cell.dataset.dataColumn = column;
            cell.dataset.originalValue = display || "";
            if (
                state.dataEditor.selectedColumn === column
                || Number(state.dataEditor.selectedRow || 0) === Number(row.index || 0)
            ) {
                cell.classList.add("is-selected");
            }
            if (
                state.dataEditor.selectedCell
                && state.dataEditor.selectedCell.rowIndex === row.index
                && state.dataEditor.selectedCell.columnName === column
            ) {
                cell.classList.add("is-active-cell", "is-selected");
            }
            tr.appendChild(cell);
        });
        tbody.appendChild(tr);
    });

    table.append(colgroup, thead, tbody);
    host.replaceChildren(createDatasetEditorVirtualSurface(snapshot, table, {
        top: Math.max(0, (Number(snapshot.rowStart || 1) - 1) * DATA_EDITOR_ROW_HEIGHT),
        left: dataEditorColumnOffset(snapshot.columnStart || 1) - DATA_EDITOR_INDEX_COLUMN_WIDTH
    }));
};

const renderDatasetEditorVariablesTable = function(host, snapshot) {
    const table = document.createElement("table");
    const colgroup = document.createElement("colgroup");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const headerRow = document.createElement("tr");
    const headers = [
        { key: "index", label: "#" },
        { key: "name", label: "Name" },
        { key: "type", label: "Type" },
        { key: "width", label: "Width" },
        { key: "decimals", label: "Decimals" },
        { key: "label", label: "Label" },
        { key: "values", label: "Values" },
        { key: "align", label: "Align" },
        { key: "measure", label: "Measure" }
    ];

    table.className = "dataset-grid dataset-grid--variables";
    headers.forEach((header, index) => {
        const column = document.createElement("col");
        const cell = createDatasetEditorTableCell("th", "", index === 0 ? "row-index" : "");
        const label = document.createElement("span");
        const resizeHandle = document.createElement("span");
        const width = Math.max(
            index === 0 ? 40 : 72,
            Number(state.dataEditor.variableColumnWidths[header.key]) || 120
        );

        column.dataset.variableColumn = header.key;
        column.style.width = `${width}px`;
        colgroup.appendChild(column);
        cell.dataset.variableColumn = header.key;
        cell.style.width = `${width}px`;
        label.className = "dataset-grid__column-label";
        label.textContent = header.label;
        resizeHandle.className = "dataset-grid__column-resizer";
        resizeHandle.dataset.variableColumnResize = header.key;
        resizeHandle.setAttribute("aria-hidden", "true");
        cell.append(label, resizeHandle);
        headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);

    snapshot.variables.forEach((variable) => {
        const tr = document.createElement("tr");
        const rowIndexCell = createDatasetEditorTableCell("td", variable.index, "row-index");
        const nameCell = document.createElement("td");
        const typeCell = createDatasetEditorTableCell("td", variable.type);
        const widthCell = document.createElement("td");
        const decimalsCell = document.createElement("td");
        const labelCell = document.createElement("td");
        const valuesCell = document.createElement("td");
        const alignCell = document.createElement("td");
        const measureCell = document.createElement("td");
        const nameInput = document.createElement("input");
        const widthInput = document.createElement("input");
        const decimalsInput = document.createElement("input");
        const measureSelect = document.createElement("select");
        const labelInput = document.createElement("input");
        const alignSelect = document.createElement("select");
        const valuesWrap = document.createElement("div");
        const valuesText = document.createElement("div");
        const valuesButton = document.createElement("button");

        tr.dataset.variableIndex = String(variable.index);
        tr.dataset.variableRow = String(variable.index);
        if (state.dataEditor.selectedVariableIndex === variable.index) {
            tr.classList.add("is-selected");
        }
        rowIndexCell.dataset.variableRowIndex = String(variable.index);
        if (Number(state.dataEditor.variableSelection?.activeRowIndex || 0) === variable.index) {
            rowIndexCell.classList.add("is-active-row-index");
        }
        datasetEditorSetVariableCellAttributes(nameCell, variable.index, "name");
        datasetEditorSetVariableCellAttributes(typeCell, variable.index, "type");
        datasetEditorSetVariableCellAttributes(widthCell, variable.index, "width");
        datasetEditorSetVariableCellAttributes(decimalsCell, variable.index, "decimals");
        datasetEditorSetVariableCellAttributes(labelCell, variable.index, "label");
        datasetEditorSetVariableCellAttributes(valuesCell, variable.index, "values");
        datasetEditorSetVariableCellAttributes(alignCell, variable.index, "align");
        datasetEditorSetVariableCellAttributes(measureCell, variable.index, "measure");
        nameInput.className = "dataset-grid__input";
        datasetEditorSetVariableFieldAttributes(nameInput, variable.index, "name");
        nameInput.value = variable.name;
        widthInput.className = "dataset-grid__input";
        datasetEditorSetVariableFieldAttributes(widthInput, variable.index, "width");
        widthInput.value = String(variable.width || "");
        decimalsInput.className = "dataset-grid__input";
        datasetEditorSetVariableFieldAttributes(decimalsInput, variable.index, "decimals");
        decimalsInput.value = String(variable.decimals || 0);
        alignSelect.className = "dataset-grid__select";
        datasetEditorSetVariableFieldAttributes(alignSelect, variable.index, "align");
        ["left", "right", "center"].forEach((align) => {
            const option = document.createElement("option");

            option.value = align;
            option.textContent = align;
            option.selected = align === variable.align;
            alignSelect.appendChild(option);
        });
        measureSelect.className = "dataset-grid__select";
        datasetEditorSetVariableFieldAttributes(measureSelect, variable.index, "measure");
        ["nominal", "ordinal", "interval", "ratio"].forEach((measure) => {
            const option = document.createElement("option");

            option.value = measure;
            option.textContent = measure;
            option.selected = measure === variable.measure;
            measureSelect.appendChild(option);
        });
        labelInput.className = "dataset-grid__input";
        datasetEditorSetVariableFieldAttributes(labelInput, variable.index, "label");
        labelInput.value = variable.label;
        nameCell.appendChild(nameInput);
        widthCell.appendChild(widthInput);
        decimalsCell.appendChild(decimalsInput);
        labelCell.className = "wrap";
        labelCell.appendChild(labelInput);
        valuesCell.className = "wrap";
        valuesCell.dataset.column = "values";
        valuesCell.dataset.variableColumn = "values";
        valuesWrap.className = "dataset-grid__values-cell";
        valuesText.className = "dataset-grid__values-text";
        valuesText.title = variable.values;
        valuesText.textContent = variable.values;
        valuesButton.className = "dataset-grid__values-button";
        valuesButton.type = "button";
        valuesButton.textContent = "...";
        valuesButton.dataset.variableValuesEditor = String(variable.index);
        valuesButton.dataset.variableCategories = JSON.stringify(variable.categories || []);
        valuesButton.dataset.variableMissingRange = JSON.stringify(variable.missingRange || null);
        valuesButton.dataset.variableDeclared = variable.declared ? "true" : "false";
        valuesButton.setAttribute("aria-label", "Edit values");
        valuesWrap.append(valuesText, valuesButton);
        valuesCell.appendChild(valuesWrap);
        alignCell.appendChild(alignSelect);
        measureCell.appendChild(measureSelect);

        tr.appendChild(rowIndexCell);
        tr.appendChild(nameCell);
        tr.appendChild(typeCell);
        tr.appendChild(widthCell);
        tr.appendChild(decimalsCell);
        tr.appendChild(labelCell);
        tr.appendChild(valuesCell);
        tr.appendChild(alignCell);
        tr.appendChild(measureCell);
        tbody.appendChild(tr);
    });

    table.append(colgroup, thead, tbody);
    host.replaceChildren(createDatasetEditorVirtualSurface(snapshot, table, {
        rowCount: snapshot.columnCount,
        columnCount: headers.length,
        top: Math.max(
            0,
            ((Number(snapshot.variables[0]?.index || snapshot.variableStart || 1) || 1) - 1) * DATA_EDITOR_ROW_HEIGHT
        ),
        left: 0
    }));
};

const setDataEditorTab = function(layer, tabName) {
    const activeTab = tabName === "variables" ? "variables" : "data";

    state.dataEditor.activeTab = activeTab;
    layer.querySelector("#datasetEditorPanelData")?.classList.toggle("is-active", activeTab === "data");
    layer.querySelector("#datasetEditorPanelVariables")?.classList.toggle("is-active", activeTab === "variables");
    layer.querySelector("#datasetEditorTabData")?.classList.toggle("is-active", activeTab === "data");
    layer.querySelector("#datasetEditorTabVariables")?.classList.toggle("is-active", activeTab === "variables");
    layer.querySelector("#datasetEditorTabData")?.setAttribute("aria-selected", activeTab === "data" ? "true" : "false");
    layer.querySelector("#datasetEditorTabVariables")?.setAttribute("aria-selected", activeTab === "variables" ? "true" : "false");
    const footer = layer.querySelector("#datasetEditorFooterNote");

    if (footer) {
        footer.textContent = activeTab === "variables" ? "Variable metadata" : "Spreadsheet view";
    }
};

const renderDataEditorSnapshot = function(layer, snapshot) {
    const select = layer.querySelector("#datasetEditorDatasetSelect");
    const subtitle = layer.querySelector("#datasetEditorSubtitle");
    const dataHost = layer.querySelector("#datasetEditorDataScroll");
    const variablesHost = layer.querySelector("#datasetEditorVariablesScroll");

    if (select) {
        select.replaceChildren(...workspaceEntries().filter((entry) => {
            return entry.kind === "data.frame";
        }).map((entry) => {
            const option = document.createElement("option");

            option.value = entry.name;
            option.textContent = entry.name;
            option.selected = entry.name === snapshot.name;
            return option;
        }));
    }

    if (subtitle) {
        subtitle.textContent = `${snapshot.rowCount} rows x ${snapshot.columnCount} columns`;
    }

    if (dataHost) {
        renderDatasetEditorDataTable(dataHost, snapshot);
    }

    if (variablesHost) {
        if (snapshot.variables.length) {
            renderDatasetEditorVariablesTable(variablesHost, snapshot);
        }
        else {
            variablesHost.replaceChildren(Object.assign(document.createElement("div"), {
                className: "dataset-sheet__status",
                textContent: "Loading variable metadata..."
            }));
        }
    }
};

const renderCurrentDataEditorSnapshot = function(layer) {
    const cache = getDataEditorCache(state.dataEditor.datasetName);

    if (!cache.snapshot) {
        return;
    }

    renderDataEditorSnapshot(layer, mergeDataEditorVariables(cache.snapshot, cache.variables));
};

const mergeDataEditorVariables = function(snapshot, variables) {
    return {
        ...snapshot,
        variables: Array.isArray(variables) ? variables : []
    };
};

const readDataEditorVariableViewport = function(host, snapshot, variables) {
    const variableCount = Math.max(0, Number(snapshot?.columnCount || 0));
    const viewportTop = Math.max(0, host?.scrollTop || 0);
    const viewportHeight = Math.max(host?.clientHeight || 0, DATA_EDITOR_ROW_HEIGHT * 8);
    const visibleStart = Math.max(1, Math.floor(viewportTop / DATA_EDITOR_ROW_HEIGHT) + 1);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / DATA_EDITOR_ROW_HEIGHT));
    const start = Math.max(1, visibleStart - DATA_EDITOR_VARIABLE_OVERSCAN_ROWS);
    const end = Math.min(variableCount, visibleStart + visibleCount + DATA_EDITOR_VARIABLE_OVERSCAN_ROWS);
    const windowVariables = [];

    for (let index = start; index <= end; index += 1) {
        const variable = variables[index - 1];

        if (variable) {
            windowVariables.push(variable);
        }
    }

    return {
        start,
        end,
        count: Math.max(1, end - start + 1),
        variables: windowVariables
    };
};

const renderDataEditorVariablesFromCache = function(layer, datasetName) {
    const cache = getDataEditorCache(datasetName);
    const variablesHost = layer.querySelector("#datasetEditorVariablesScroll");

    if (!variablesHost || !cache.snapshot) {
        return;
    }

    if (!cache.variables.some(Boolean)) {
        variablesHost.replaceChildren(Object.assign(document.createElement("div"), {
            className: "dataset-sheet__status",
            textContent: cache.variablesLoading || cache.variablesViewportLoading
                ? "Loading variable metadata..."
                : "No variable metadata available"
        }));
        return;
    }

    const viewport = readDataEditorVariableViewport(
        variablesHost,
        cache.snapshot,
        cache.variables
    );

    renderDatasetEditorVariablesTable(
        variablesHost,
        {
            ...mergeDataEditorVariables(cache.snapshot, viewport.variables),
            variableStart: viewport.start
        }
    );
};

const loadDataEditorVariableMetadataBatches = async function(layer, datasetName) {
    const cache = getDataEditorCache(datasetName);

    if (!cache.snapshot || cache.variablesLoading) {
        return;
    }

    cache.variablesLoading = true;
    renderDataEditorVariablesFromCache(layer, datasetName);

    try {
        const batchSize = 64;

        while (
            cache.snapshot
            && cache.variablesLoaded < Number(cache.snapshot.columnCount || 0)
        ) {
            const start = cache.variablesLoaded + 1;
            const variables = await readDataEditorVariableBatch(datasetName, start, batchSize);

            if (!variables.length) {
                break;
            }

            variables.forEach((variable) => {
                cache.variables[Number(variable.index || 0) - 1] = variable;
            });
            cache.variablesLoaded = Math.max(
                cache.variablesLoaded,
                start + variables.length - 1
            );

            if (state.dataEditor.layer === layer && state.dataEditor.datasetName === datasetName) {
                renderDataEditorVariablesFromCache(layer, datasetName);
            }

            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
    }
    finally {
        cache.variablesLoading = false;

        if (state.dataEditor.layer === layer && state.dataEditor.datasetName === datasetName) {
            renderDataEditorVariablesFromCache(layer, datasetName);
        }
    }
};

const ensureDataEditorVariableViewportLoaded = async function(layer, datasetName) {
    const cache = getDataEditorCache(datasetName);
    const variablesHost = layer.querySelector("#datasetEditorVariablesScroll");

    if (!cache.snapshot || !variablesHost || cache.variablesViewportLoading) {
        return;
    }

    const viewport = readDataEditorVariableViewport(
        variablesHost,
        cache.snapshot,
        cache.variables
    );
    const isLoaded = function(index) {
        return Boolean(cache.variables[index - 1]);
    };
    let start = viewport.start;

    while (start <= viewport.end && isLoaded(start)) {
        start += 1;
    }

    if (start > viewport.end) {
        renderDataEditorVariablesFromCache(layer, datasetName);
        return;
    }

    let end = start;
    while (end + 1 <= viewport.end && !isLoaded(end + 1)) {
        end += 1;
    }

    cache.variablesViewportLoading = true;

    try {
        const variables = await readDataEditorVariableBatch(
            datasetName,
            start,
            Math.max(1, end - start + 1)
        );

        variables.forEach((variable) => {
            cache.variables[Number(variable.index || 0) - 1] = variable;
        });
    }
    finally {
        cache.variablesViewportLoading = false;
    }

    if (state.dataEditor.layer === layer && state.dataEditor.datasetName === datasetName) {
        renderDataEditorVariablesFromCache(layer, datasetName);
    }
};

const renderCachedDataEditorSnapshot = function(layer, datasetName) {
    const cache = getDataEditorCache(datasetName);

    if (!cache.snapshot) {
        return false;
    }

    renderDataEditorSnapshot(
        layer,
        mergeDataEditorVariables(cache.snapshot, cache.variables)
    );
    loadDataEditorVariableMetadataBatches(layer, datasetName).catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
    return true;
};

const refreshDataEditorModal = async function(layer, datasetName) {
    const cache = getDataEditorCache(datasetName);
    const snapshot = await readDataEditorSnapshot(
        datasetName,
        1,
        DATA_EDITOR_INITIAL_ROWS,
        1,
        DATA_EDITOR_INITIAL_COLUMNS
    );

    if (!snapshot.columns.length) {
        throw new Error(`${datasetName} is not a data frame.`);
    }

    cache.snapshot = mergeDataEditorVariables(snapshot, []);
    cache.loadedWindow = {
        rowStart: snapshot.rowStart,
        rowEnd: snapshot.rowStart + snapshot.rows.length - 1,
        columnStart: snapshot.columnStart,
        columnEnd: snapshot.columnStart + snapshot.columns.length - 1
    };
    renderDataEditorSnapshot(layer, mergeDataEditorVariables(snapshot, cache.variables));
    loadDataEditorVariableMetadataBatches(layer, datasetName).catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
    await refreshWebRWorkspacePane();
};

const ensureDataEditorDataViewportLoaded = async function(layer) {
    const host = layer.querySelector("#datasetEditorDataScroll");
    const datasetName = state.dataEditor.datasetName;
    const cache = getDataEditorCache(datasetName);

    if (!host || !cache.snapshot || cache.dataLoading) {
        if (cache.dataLoading && cache.snapshot) {
            cache.pendingDataViewport = readDataEditorViewportPlan(host, cache.snapshot);
        }
        return;
    }

    const plan = readDataEditorViewportPlan(host, cache.snapshot);

    if (dataEditorLoadedWindowContains(cache.loadedWindow, plan)) {
        return;
    }

    cache.dataLoading = true;
    cache.pendingDataViewport = null;

    try {
        const scrollTop = host.scrollTop;
        const scrollLeft = host.scrollLeft;
        const snapshot = await readDataEditorSnapshot(
            datasetName,
            plan.rowStart,
            plan.rowCount,
            plan.columnStart,
            plan.columnCount
        );

        cache.snapshot = mergeDataEditorVariables(snapshot, []);
        cache.loadedWindow = {
            rowStart: snapshot.rowStart,
            rowEnd: snapshot.rowStart + snapshot.rows.length - 1,
            columnStart: snapshot.columnStart,
            columnEnd: snapshot.columnStart + snapshot.columns.length - 1
        };

        if (
            state.dataEditor.layer === layer
            && state.dataEditor.datasetName === datasetName
        ) {
            renderDataEditorSnapshot(layer, mergeDataEditorVariables(snapshot, cache.variables));
            host.scrollTop = scrollTop;
            host.scrollLeft = scrollLeft;
        }
    }
    finally {
        cache.dataLoading = false;
    }

    if (cache.pendingDataViewport) {
        ensureDataEditorDataViewportLoaded(layer).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    }
};

const startDataEditorCellEdit = function(cell, replacementText = null) {
    if (!cell || cell.querySelector("input")) {
        return;
    }

    const input = document.createElement("input");
    const originalValue = cell.dataset.originalValue || cell.textContent || "";

    input.className = "dataset-grid__data-input";
    input.value = replacementText === null ? originalValue : String(replacementText);
    cell.classList.add("is-editing-cell");
    cell.replaceChildren(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = async function(commit) {
        if (finished) {
            return;
        }
        finished = true;
        const layer = cell.closest(".dialogforge-web-data-editor-layer");
        const datasetName = state.dataEditor.datasetName;
        const nextValue = input.value;

        cell.classList.remove("is-editing-cell");
        if (!commit || nextValue === originalValue) {
            cell.textContent = originalValue;
            return;
        }

        try {
            await writeDataEditorCellValue(
                datasetName,
                Number(cell.dataset.rowIndex || 0),
                cell.dataset.columnName || "",
                nextValue
            );
            if (layer) {
                await refreshDataEditorModal(layer, datasetName);
            }
        }
        catch (error) {
            cell.textContent = originalValue;
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        }
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finish(true).catch(() => {});
        }
        if (event.key === "Escape") {
            event.preventDefault();
            finish(false).catch(() => {});
        }
    });
    input.addEventListener("blur", () => {
        finish(true).catch(() => {});
    }, { once: true });
};

const focusDataEditorInlineInput = function(layer, selector) {
    requestAnimationFrame(() => {
        const input = layer.querySelector(selector);

        if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
        }
    });
};

const startDataEditorColumnHeaderEdit = function(layer, columnName) {
    const cleanColumn = String(columnName || "");

    if (!cleanColumn) {
        return;
    }

    state.dataEditor.editingColumnName = cleanColumn;
    state.dataEditor.editingRowIndex = 0;
    renderCurrentDataEditorSnapshot(layer);
    focusDataEditorInlineInput(
        layer,
        `[data-header-editor="true"][data-data-column="${CSS.escape(cleanColumn)}"]`
    );
};

const startDataEditorRowNameEdit = function(layer, rowIndex) {
    const cleanRowIndex = Number(rowIndex || 0);

    if (!cleanRowIndex) {
        return;
    }

    state.dataEditor.editingColumnName = "";
    state.dataEditor.editingRowIndex = cleanRowIndex;
    renderCurrentDataEditorSnapshot(layer);
    focusDataEditorInlineInput(
        layer,
        `[data-rowname-editor="true"][data-data-row="${CSS.escape(String(cleanRowIndex))}"]`
    );
};

const findSelectedDataEditorCell = function(layer) {
    const selected = state.dataEditor.selectedCell;

    if (!selected) {
        return null;
    }

    return layer.querySelector([
        ".dataset-grid__data-cell",
        `[data-row-index="${CSS.escape(String(selected.rowIndex))}"]`,
        `[data-column-name="${CSS.escape(selected.columnName)}"]`
    ].join(""));
};

const copySelectedDataEditorCell = async function(layer) {
    const cell = findSelectedDataEditorCell(layer);

    if (!cell) {
        return false;
    }

    const text = cell.dataset.originalValue || cell.textContent || "";

    await navigator.clipboard?.writeText(String(text));
    return true;
};

const parseClipboardRows = function(text) {
    const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;

    if (!trimmed) {
        return [];
    }

    return trimmed.split("\n").map((line) => {
        return line.split("\t");
    });
};

const pasteTextIntoSelectedDataEditorCell = async function(layer, text) {
    const selected = state.dataEditor.selectedCell;
    const datasetName = state.dataEditor.datasetName;
    const rows = parseClipboardRows(text);

    if (!selected || !rows.length) {
        return false;
    }

    const headerCells = Array.from(layer.querySelectorAll(".dataset-grid--data thead th"))
        .slice(1)
        .map((cell) => String(cell.textContent || "").trim())
        .filter(Boolean);
    const startColumnIndex = headerCells.indexOf(selected.columnName);

    if (startColumnIndex < 0) {
        return false;
    }

    for (let rowOffset = 0; rowOffset < rows.length; rowOffset += 1) {
        const rowValues = rows[rowOffset] || [];

        for (let columnOffset = 0; columnOffset < rowValues.length; columnOffset += 1) {
            const columnName = headerCells[startColumnIndex + columnOffset];

            if (!columnName) {
                continue;
            }

            await writeDataEditorCellValue(
                datasetName,
                selected.rowIndex + rowOffset,
                columnName,
                rowValues[columnOffset]
            );
        }
    }

    await refreshDataEditorModal(layer, datasetName);
    return true;
};

const isEditableClipboardTarget = function(target) {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest("input, textarea, select, [contenteditable=\"true\"]"));
};

const hideDataEditorContextMenus = function(layer) {
    layer.querySelectorAll(".dataset-editor__menu.is-open").forEach((menu) => {
        menu.classList.remove("is-open");
        menu.hidden = true;
    });
    state.dataEditor.contextMenu = {
        kind: "",
        target: null
    };
};

const positionDataEditorMenu = function(layer, menu, x, y) {
    const inset = 8;
    const root = layer.querySelector("#datasetEditorRoot");
    const bounds = root?.getBoundingClientRect();

    menu.hidden = false;
    menu.classList.add("is-open");

    const menuBounds = menu.getBoundingClientRect();
    const maxLeft = (bounds ? bounds.right : window.innerWidth) - menuBounds.width - inset;
    const maxTop = (bounds ? bounds.bottom : window.innerHeight) - menuBounds.height - inset;

    menu.style.left = `${Math.max(inset, Math.min(x, maxLeft))}px`;
    menu.style.top = `${Math.max(inset, Math.min(y, maxTop))}px`;
};

const showDataEditorContextMenu = function(layer, menuId, target, x, y, options = {}) {
    const menu = layer.querySelector(`#${menuId}`);

    if (!menu) {
        return;
    }

    hideDataEditorContextMenus(layer);
    state.dataEditor.contextMenu = {
        kind: menuId,
        target
    };

    if (menuId === "datasetEditorCellMenu") {
        const copyButton = menu.querySelector('[data-cell-menu-action="copy"]');

        if (copyButton) {
            copyButton.hidden = Boolean(options.pasteOnly);
        }
    }

    positionDataEditorMenu(layer, menu, x, y);
};

const selectDataEditorCell = function(layer, cell) {
    state.dataEditor.selectedCell = {
        rowIndex: Number(cell.dataset.rowIndex || cell.dataset.dataRow || 0),
        columnName: cell.dataset.columnName || cell.dataset.dataColumn || ""
    };
    state.dataEditor.selectedColumn = "";
    state.dataEditor.selectedRow = 0;
    layer.querySelectorAll(".dataset-grid--data .is-active-cell, .dataset-grid--data .is-selected").forEach((entry) => {
        entry.classList.remove("is-active-cell", "is-selected");
    });
    cell.classList.add("is-active-cell", "is-selected");
    cell.focus({ preventScroll: true });
};

const selectDataEditorColumn = function(layer, columnName) {
    const cleanColumn = String(columnName || "");

    state.dataEditor.selectedCell = null;
    state.dataEditor.selectedColumn = cleanColumn;
    state.dataEditor.selectedRow = 0;
    layer.querySelectorAll(".dataset-grid--data .is-active-cell, .dataset-grid--data .is-selected").forEach((entry) => {
        entry.classList.remove("is-active-cell", "is-selected");
    });
    layer.querySelectorAll(`[data-data-header="${CSS.escape(cleanColumn)}"], [data-data-column="${CSS.escape(cleanColumn)}"]`).forEach((entry) => {
        entry.classList.add("is-selected");
    });
};

const selectDataEditorRow = function(layer, rowIndex) {
    const cleanRowIndex = Number(rowIndex || 0);

    state.dataEditor.selectedCell = null;
    state.dataEditor.selectedColumn = "";
    state.dataEditor.selectedRow = cleanRowIndex;
    layer.querySelectorAll(".dataset-grid--data .is-active-cell, .dataset-grid--data .is-selected").forEach((entry) => {
        entry.classList.remove("is-active-cell", "is-selected");
    });
    layer.querySelectorAll(`[data-row-name="${CSS.escape(String(cleanRowIndex))}"], [data-data-row="${CSS.escape(String(cleanRowIndex))}"]`).forEach((entry) => {
        entry.classList.add("is-selected");
    });
};

const setDataEditorVariableSelection = function(layer, rowIndex, key, extendRange = false) {
    const cleanRowIndex = Number(rowIndex || 0);
    const cleanKey = String(key || "");
    const previous = state.dataEditor.variableSelection || {};
    const anchor = previous.activeCell && previous.activeCell.key === cleanKey
        ? previous.activeCell
        : {
            rowIndex: cleanRowIndex,
            key: cleanKey
        };

    state.dataEditor.selectedVariableIndex = cleanRowIndex;
    state.dataEditor.variableSelection = {
        selectedRowIndex: cleanRowIndex,
        activeRowIndex: cleanRowIndex,
        activeCell: {
            rowIndex: cleanRowIndex,
            key: cleanKey
        },
        range: extendRange && isVariableMetadataRangeKey(cleanKey)
            ? {
                key: cleanKey,
                start: Math.min(anchor.rowIndex, cleanRowIndex),
                end: Math.max(anchor.rowIndex, cleanRowIndex)
            }
            : null
    };

    layer.querySelectorAll(".dataset-grid--variables tbody tr.is-selected").forEach((row) => {
        row.classList.remove("is-selected");
    });
    layer.querySelectorAll(".dataset-grid--variables .is-cell-selected, .dataset-grid--variables .is-active-row-index").forEach((entry) => {
        entry.classList.remove("is-cell-selected", "is-active-row-index");
    });
    layer.querySelector(`.dataset-grid--variables tbody tr[data-variable-index="${CSS.escape(String(cleanRowIndex))}"]`)?.classList.add("is-selected");
    layer.querySelector(`[data-variable-row-index="${CSS.escape(String(cleanRowIndex))}"]`)?.classList.add("is-active-row-index");

    variableSelectionRangeRows(cleanRowIndex, cleanKey).forEach((row) => {
        layer.querySelectorAll(`[data-variable-cell="${CSS.escape(cleanKey)}"][data-variable-row="${CSS.escape(String(row))}"]`).forEach((entry) => {
            entry.classList.add("is-cell-selected");
        });
    });
};

const selectedDataEditorVariableRows = function(rowIndex, key) {
    const rows = variableSelectionRangeRows(rowIndex, key);

    return rows.length ? rows : [Number(rowIndex || 0)].filter(Boolean);
};

const dataEditorVariableFieldSelector = function(rowIndex, key) {
    return [
        `[data-variable-field="${CSS.escape(String(key || ""))}"]`,
        `[data-variable-row="${CSS.escape(String(rowIndex || ""))}"]`
    ].join("");
};

const readDataEditorVariableFieldText = function(layer, rowIndex, key) {
    const field = layer.querySelector(dataEditorVariableFieldSelector(rowIndex, key));

    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        return field.value;
    }

    const cell = layer.querySelector([
        `[data-variable-cell="${CSS.escape(String(key || ""))}"]`,
        `[data-variable-row="${CSS.escape(String(rowIndex || ""))}"]`
    ].join(""));

    return String(cell?.textContent || "");
};

const writeDataEditorVariableFieldText = async function(rowIndex, key, value) {
    const datasetName = state.dataEditor.datasetName;
    const cleanKey = String(key || "");

    if (cleanKey === "name") {
        await writeDataEditorVariableName(datasetName, rowIndex, value);
        return;
    }

    if (
        cleanKey === "label"
        || cleanKey === "measure"
        || cleanKey === "align"
        || cleanKey === "width"
        || cleanKey === "decimals"
    ) {
        await writeDataEditorVariableAttribute(datasetName, rowIndex, cleanKey, value);
    }
};

const copyDataEditorContextSelection = async function(layer) {
    const context = state.dataEditor.contextMenu || {};
    const target = context.target || {};

    if (target.kind === "variable") {
        const rows = selectedDataEditorVariableRows(target.rowIndex, target.key);
        const values = rows.map((rowIndex) => {
            return readDataEditorVariableFieldText(layer, rowIndex, target.key);
        });

        await navigator.clipboard?.writeText(values.join("\n"));
        return true;
    }

    return copySelectedDataEditorCell(layer);
};

const pasteDataEditorContextSelection = async function(layer) {
    const context = state.dataEditor.contextMenu || {};
    const target = context.target || {};
    const text = await navigator.clipboard?.readText?.();

    if (!text) {
        return false;
    }

    if (target.kind === "variable") {
        const rows = selectedDataEditorVariableRows(target.rowIndex, target.key);
        const values = parseClipboardRows(text).map((row) => row[0] ?? "");

        for (let index = 0; index < rows.length; index += 1) {
            await writeDataEditorVariableFieldText(
                rows[index],
                target.key,
                values[index] ?? values[0] ?? ""
            );
        }
        await refreshDataEditorModal(layer, state.dataEditor.datasetName);
        return true;
    }

    return pasteTextIntoSelectedDataEditorCell(layer, text);
};

const rStringLiteral = function(value) {
    return JSON.stringify(String(value ?? ""));
};

const runDataEditorMutationCommand = async function(layer, command) {
    const runtime = await ensureRuntime();
    const datasetName = state.dataEditor.datasetName;

    await runtime.evalRVoid(command);
    state.dataEditor.cache.delete(String(datasetName || "").trim());
    await refreshDataEditorModal(layer, datasetName);
    await refreshWebRWorkspacePane();
};

const dataEditorColumnsForCurrentDataset = function() {
    const cache = getDataEditorCache(state.dataEditor.datasetName);

    return readDataEditorColumns(cache.snapshot);
};

const suggestDataEditorColumnName = function(referenceName, position) {
    const columns = dataEditorColumnsForCurrentDataset();
    const referenceIndex = columns.indexOf(String(referenceName || ""));
    const insertIndex = referenceIndex < 0
        ? columns.length + 1
        : referenceIndex + (position === "after" ? 2 : 1);
    let candidate = `column${insertIndex}`;
    let suffix = 2;

    while (columns.includes(candidate)) {
        candidate = `column${insertIndex}_${suffix}`;
        suffix += 1;
    }

    return candidate;
};

const copyDataEditorColumnValues = async function(columnName, includeLabels = false) {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .column <- ${rStringLiteral(columnName)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.column, names(.df))) stop(\"invalid-column-target\")",
        "  .value <- .df[[.column]]",
        "  .labels <- attr(.value, \"labels\", exact = TRUE)",
        "  .format <- function(.cell) {",
        "    if (length(.cell) != 1L || is.na(.cell)) return(\"NA\")",
        "    .text <- as.character(.cell)",
        "    if (!isTRUE(.include_labels) || is.null(.labels) || !length(.labels)) return(.text)",
        "    .match <- match(.text, as.character(unname(.labels)))",
        "    if (is.na(.match)) return(.text)",
        "    paste(.text, names(.labels)[[.match]], sep = \"\\t\")",
        "  }",
        `  .include_labels <- ${includeLabels ? "TRUE" : "FALSE"}`,
        "  paste(vapply(.value, .format, character(1)), collapse = \"\\n\")",
        "})"
    ].join("\n");
    const text = await runtime.evalRString(command);

    await navigator.clipboard?.writeText(String(text || ""));
};

const renameDataEditorColumnTo = async function(layer, columnName, nextName) {
    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .column <- ${rStringLiteral(columnName)}`,
        `  .next <- ${rStringLiteral(nextName)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.column, names(.df))) stop(\"invalid-column-target\")",
        "  names(.df)[names(.df) == .column] <- make.names(.next, unique = TRUE)",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const renameDataEditorColumn = async function(layer, columnName) {
    startDataEditorColumnHeaderEdit(layer, columnName);
};

const finishDataEditorHeaderEdit = async function(layer, input, commit) {
    const previousName = String(input.dataset.dataColumn || "");
    const nextName = String(input.value || "").trim();

    state.dataEditor.editingColumnName = "";

    if (!commit || !previousName || !nextName || nextName === previousName) {
        renderCurrentDataEditorSnapshot(layer);
        return;
    }

    try {
        await renameDataEditorColumnTo(layer, previousName, nextName);
    }
    catch (error) {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        renderCurrentDataEditorSnapshot(layer);
    }
};

const finishDataEditorRowNameEdit = async function(layer, input, commit) {
    const rowIndex = Number(input.dataset.dataRow || 0);
    const nextName = String(input.value || "").trim();

    state.dataEditor.editingRowIndex = 0;

    if (!commit || !rowIndex || !nextName) {
        renderCurrentDataEditorSnapshot(layer);
        return;
    }

    try {
        await renameDataEditorRowTo(layer, rowIndex, nextName);
    }
    catch (error) {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        renderCurrentDataEditorSnapshot(layer);
    }
};

const finishDataEditorInlineEdit = async function(layer, input, commit) {
    if (input.dataset.inlineEditSettled === "true") {
        return;
    }

    input.dataset.inlineEditSettled = "true";

    if (input.dataset.headerEditor === "true") {
        await finishDataEditorHeaderEdit(layer, input, commit);
        return;
    }

    if (input.dataset.rownameEditor === "true") {
        await finishDataEditorRowNameEdit(layer, input, commit);
    }
};

const insertDataEditorColumn = async function(layer, columnName, position) {
    const nextName = window.prompt(
        position === "before" ? "Add column before" : "Add column after",
        suggestDataEditorColumnName(columnName, position)
    );

    if (!nextName) {
        return;
    }

    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .reference <- ${rStringLiteral(columnName)}`,
        `  .new <- ${rStringLiteral(nextName)}`,
        `  .position <- ${rStringLiteral(position)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.reference, names(.df))) stop(\"invalid-column-target\")",
        "  .cols <- names(.df)",
        "  .ref <- match(.reference, .cols)",
        "  .after <- if (identical(.position, \"before\")) .ref - 1L else .ref",
        "  .df[[make.names(.new, unique = TRUE)]] <- NA",
        "  .df <- .df[, append(.cols, names(.df)[[ncol(.df)]], after = .after), drop = FALSE]",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const removeDataEditorColumn = async function(layer, columnName) {
    if (!window.confirm(`Remove column "${columnName}"?`)) {
        return;
    }

    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .column <- ${rStringLiteral(columnName)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.column, names(.df))) stop(\"invalid-column-target\")",
        "  .df[[.column]] <- NULL",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const sortDataEditorRows = async function(layer, columnName, decreasing) {
    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .column <- ${rStringLiteral(columnName)}`,
        `  .decreasing <- ${decreasing ? "TRUE" : "FALSE"}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || !is.element(.column, names(.df))) stop(\"invalid-column-target\")",
        "  .df <- .df[order(.df[[.column]], decreasing = .decreasing, na.last = TRUE), , drop = FALSE]",
        "  rownames(.df) <- NULL",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const renameDataEditorRowTo = async function(layer, rowIndex, nextName) {
    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .row <- ${Number(rowIndex) || 0}`,
        `  .next <- ${rStringLiteral(nextName)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || .row > nrow(.df)) stop(\"invalid-row-target\")",
        "  rownames(.df)[.row] <- .next",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const renameDataEditorRow = async function(layer, rowIndex) {
    startDataEditorRowNameEdit(layer, rowIndex);
};

const insertDataEditorRow = async function(layer, rowIndex, position) {
    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .row <- ${Number(rowIndex) || 0}`,
        `  .position <- ${rStringLiteral(position)}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || .row > nrow(.df)) stop(\"invalid-row-target\")",
        "  .insert <- if (identical(.position, \"before\")) .row else .row + 1L",
        "  .names <- rownames(.df)",
        "  if (is.null(.names) || length(.names) != nrow(.df)) .names <- as.character(seq_len(nrow(.df)))",
        "  .next <- make.unique(c(.names, as.character(.insert)), sep = \"_\")[[length(.names) + 1L]]",
        "  .new <- .df[NA_integer_, , drop = FALSE]",
        "  rownames(.new) <- NULL",
        "  .before <- if (.insert <= 1L) .df[0, , drop = FALSE] else .df[seq_len(.insert - 1L), , drop = FALSE]",
        "  .after <- if (.insert > nrow(.df)) .df[0, , drop = FALSE] else .df[seq(.insert, nrow(.df)), , drop = FALSE]",
        "  .df <- rbind(.before, .new, .after)",
        "  rownames(.df) <- append(.names, .next, after = .insert - 1L)",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const removeDataEditorRow = async function(layer, rowIndex) {
    if (!window.confirm(`Delete row "${rowIndex}"?`)) {
        return;
    }

    await runDataEditorMutationCommand(layer, [
        "local({",
        `  .name <- ${rStringLiteral(state.dataEditor.datasetName)}`,
        `  .row <- ${Number(rowIndex) || 0}`,
        "  .df <- get(.name, envir = .GlobalEnv)",
        "  if (!is.data.frame(.df) || .row < 1L || .row > nrow(.df)) stop(\"invalid-row-target\")",
        "  .df <- .df[-.row, , drop = FALSE]",
        "  rownames(.df) <- NULL",
        "  assign(.name, .df, envir = .GlobalEnv)",
        "})"
    ].join("\n"));
};

const runDataEditorContextMenuAction = async function(layer, button) {
    const context = state.dataEditor.contextMenu || {};
    const target = context.target || {};
    const headerAction = button.getAttribute("data-header-menu-action");
    const rowAction = button.getAttribute("data-row-menu-action");
    const variableRowAction = button.getAttribute("data-variable-row-menu-action");
    const cellAction = button.getAttribute("data-cell-menu-action");

    if (cellAction === "copy") {
        await copyDataEditorContextSelection(layer);
        return;
    }
    if (cellAction === "paste") {
        await pasteDataEditorContextSelection(layer);
        return;
    }

    if (headerAction && target.columnName) {
        if (headerAction === "copy-values") {
            await copyDataEditorColumnValues(target.columnName, false);
        }
        if (headerAction === "copy-labels") {
            await copyDataEditorColumnValues(target.columnName, true);
        }
        if (headerAction === "sort-asc") {
            await sortDataEditorRows(layer, target.columnName, false);
        }
        if (headerAction === "sort-desc") {
            await sortDataEditorRows(layer, target.columnName, true);
        }
        if (headerAction === "rename") {
            await renameDataEditorColumn(layer, target.columnName);
        }
        if (headerAction === "add-before" || headerAction === "add-after") {
            await insertDataEditorColumn(
                layer,
                target.columnName,
                headerAction === "add-before" ? "before" : "after"
            );
        }
        if (headerAction === "remove") {
            await removeDataEditorColumn(layer, target.columnName);
        }
        return;
    }

    if (rowAction && target.rowIndex) {
        if (rowAction === "rename") {
            await renameDataEditorRow(layer, target.rowIndex);
        }
        if (rowAction === "add-before" || rowAction === "add-after") {
            await insertDataEditorRow(
                layer,
                target.rowIndex,
                rowAction === "add-before" ? "before" : "after"
            );
        }
        if (rowAction === "remove") {
            await removeDataEditorRow(layer, target.rowIndex);
        }
        return;
    }

    if (variableRowAction && target.columnName) {
        if (variableRowAction === "add-before" || variableRowAction === "add-after") {
            await insertDataEditorColumn(
                layer,
                target.columnName,
                variableRowAction === "add-before" ? "before" : "after"
            );
        }
        if (variableRowAction === "remove") {
            await removeDataEditorColumn(layer, target.columnName);
        }
    }
};

const applyDataEditorVariableColumnWidth = function(layer, key, width) {
    const columnKey = String(key || "");
    const nextWidth = Math.max(columnKey === "index" ? 40 : 72, Math.round(Number(width) || 0));

    if (!columnKey) {
        return;
    }

    state.dataEditor.variableColumnWidths[columnKey] = nextWidth;
    layer.querySelectorAll(`[data-variable-column="${CSS.escape(columnKey)}"]`).forEach((node) => {
        node.style.width = `${nextWidth}px`;
    });
};

const beginDataEditorVariableColumnResize = function(layer, handle, event) {
    const columnKey = String(handle.dataset.variableColumnResize || "");
    const header = handle.closest("th");

    if (!columnKey || !(header instanceof HTMLElement)) {
        return;
    }

    const startX = event.clientX;
    const startWidth = Math.round(header.getBoundingClientRect().width);
    const pointerId = event.pointerId;
    const move = function(moveEvent) {
        if (moveEvent.pointerId !== pointerId) {
            return;
        }

        applyDataEditorVariableColumnWidth(
            layer,
            columnKey,
            startWidth + moveEvent.clientX - startX
        );
    };
    const end = function(endEvent) {
        if (endEvent.pointerId !== pointerId) {
            return;
        }

        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        handle.releasePointerCapture?.(pointerId);
    };

    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture?.(pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
};

const commitDataEditorVariableField = async function(input) {
    const layer = input.closest(".dialogforge-web-data-editor-layer");
    const datasetName = state.dataEditor.datasetName;
    const columnIndex = Number(input.dataset.variableIndex || 0);
    const field = String(input.dataset.variableField || "");
    const value = input.value;

    state.dataEditor.selectedVariableIndex = columnIndex;

    if (!layer || !columnIndex || !field) {
        return;
    }

    try {
        if (field === "name") {
            await writeDataEditorVariableName(datasetName, columnIndex, value);
        }
        else if (
            field === "label"
            || field === "measure"
            || field === "align"
            || field === "width"
            || field === "decimals"
        ) {
            await writeDataEditorVariableAttribute(datasetName, columnIndex, field, value);
        }
        await refreshDataEditorModal(layer, datasetName);
    }
    catch (error) {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        await refreshDataEditorModal(layer, datasetName).catch(() => {});
    }
};

const readDataEditorVariableFromLayer = function(layer, columnIndex) {
    const rows = Array.from(layer.querySelectorAll("#datasetEditorVariablesScroll tbody tr"));

    for (const row of rows) {
        if (Number(row.dataset.variableIndex || 0) !== Number(columnIndex || 0)) {
            continue;
        }

        return {
            index: Number(row.dataset.variableIndex || 0),
            name: row.querySelector('[data-variable-field="name"]')?.value || "",
            type: String(row.children[2]?.textContent || "").trim(),
            values: row.querySelector(".dataset-grid__values-text")?.textContent || "",
            categories: JSON.parse(row.querySelector("[data-variable-categories]")?.dataset.variableCategories || "[]"),
            missingRange: JSON.parse(row.querySelector("[data-variable-missing-range]")?.dataset.variableMissingRange || "null"),
            declared: row.querySelector("[data-variable-declared]")?.dataset.variableDeclared === "true"
        };
    }

    return null;
};

const createValueLabelsEditorRow = function(category, index) {
    const row = document.createElement("tr");
    const dragCell = document.createElement("td");
    const missingCell = document.createElement("td");
    const valueCell = document.createElement("td");
    const labelCell = document.createElement("td");
    const actionsCell = document.createElement("td");
    const drag = document.createElement("button");
    const missing = document.createElement("input");
    const value = document.createElement("input");
    const label = document.createElement("input");
    const remove = document.createElement("button");

    row.dataset.valueLabelRow = String(index);
    dragCell.className = "ds-labels-table__drag";
    missingCell.className = "ds-labels-table__missing";
    valueCell.className = "ds-labels-table__value";
    labelCell.className = "ds-labels-table__label";
    actionsCell.className = "ds-labels-table__actions";
    drag.className = "ds-labels-drag";
    drag.type = "button";
    drag.tabIndex = -1;
    drag.setAttribute("aria-hidden", "true");
    missing.className = "ds-labels-table__checkbox";
    missing.type = "checkbox";
    missing.checked = Boolean(category.isMissing);
    missing.dataset.valueLabelMissing = String(index);
    value.className = "ds-labels-table__input";
    value.type = "text";
    value.value = category.value;
    value.dataset.valueLabelValue = String(index);
    label.className = "ds-labels-table__input";
    label.type = "text";
    label.value = category.label;
    label.dataset.valueLabelLabel = String(index);
    remove.className = "ds-labels-delete";
    remove.type = "button";
    remove.textContent = "x";
    remove.dataset.valueLabelDelete = String(index);
    remove.setAttribute("aria-label", "Delete");
    dragCell.appendChild(drag);
    missingCell.appendChild(missing);
    valueCell.appendChild(value);
    labelCell.appendChild(label);
    actionsCell.appendChild(remove);
    row.append(dragCell, missingCell, valueCell, labelCell, actionsCell);

    return row;
};

const openDataEditorValueLabelsModal = function(layer, columnIndex) {
    const variable = readDataEditorVariableFromLayer(layer, columnIndex);

    if (!variable) {
        return;
    }

    const categories = variable.categories.length
        ? variable.categories.map((entry) => ({ ...entry }))
        : splitDatasetEditorValues(variable.values).map((entry) => ({
            value: entry,
            label: entry,
            isMissing: false
        }));

    if (!categories.length && !variable.missingRange) {
        appendTranscript("No value-label categories are available for this variable.", "web-transcript__line--stderr");
        return;
    }

    const editorLayer = document.createElement("div");
    const shell = document.createElement("section");
    const titlebar = document.createElement("div");
    const title = document.createElement("div");
    const close = document.createElement("button");
    const body = document.createElement("div");
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const range = document.createElement("div");
    const footer = document.createElement("div");
    const cancel = document.createElement("button");
    const ok = document.createElement("button");

    editorLayer.className = "dialogforge-web-dialog-layer dialogforge-web-value-labels-layer";
    editorLayer.dataset.surfaceId = `valueLabels:${state.dataEditor.datasetName}:${columnIndex}`;
    shell.className = "dialogforge-web-dialog dialogforge-web-value-labels-window";
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", `${variable.name} value labels`);
    titlebar.className = "dialogforge-web-dialog__titlebar";
    title.className = "dialogforge-web-dialog__title";
    title.textContent = `${variable.name} • Value labels`;
    close.className = "dialogforge-web-dialog__close";
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Close");
    body.className = "dialogforge-web-value-labels-body";
    table.className = "ds-labels-table";
    thead.innerHTML = [
        "<tr>",
        "  <th class=\"ds-labels-table__drag\"></th>",
        "  <th class=\"ds-labels-table__missing\">Missing</th>",
        "  <th class=\"ds-labels-table__value\">Value</th>",
        "  <th class=\"ds-labels-table__label\">Label</th>",
        "  <th class=\"ds-labels-table__actions\"></th>",
        "</tr>"
    ].join("");
    const renderRows = function(nextCategories) {
        tbody.replaceChildren(...nextCategories.map((category, index) => {
            return createValueLabelsEditorRow(category, index);
        }));
    };

    renderRows(categories);
    table.append(thead, tbody);
    range.className = "dialogforge-web-value-labels-range";
    range.innerHTML = [
        "<label class=\"dialogforge-web-value-labels-range__toggle\">",
        "  <input type=\"checkbox\" id=\"datasetValueLabelsRangeEnabled\">",
        "  <span>Range</span>",
        "</label>",
        "<input type=\"text\" class=\"ds-labels-table__input ds-labels-range-input\" id=\"datasetValueLabelsRangeMin\" placeholder=\"Min\">",
        "<input type=\"text\" class=\"ds-labels-table__input ds-labels-range-input\" id=\"datasetValueLabelsRangeMax\" placeholder=\"Max\">"
    ].join("");
    body.append(table, range);
    footer.className = "dialogforge-web-value-labels-footer";
    cancel.className = "dialogforge-web-value-labels-action";
    cancel.type = "button";
    cancel.textContent = "Cancel";
    ok.className = "dialogforge-web-value-labels-action dialogforge-web-value-labels-action--primary";
    ok.type = "button";
    ok.textContent = "OK";
    footer.append(cancel, ok);
    titlebar.append(title, close);
    shell.append(titlebar, body, footer);
    editorLayer.appendChild(shell);
    document.body.appendChild(editorLayer);
    installDraggableModal(shell, titlebar, {
        mode: "fixed",
        storageKey: `valueLabels:${state.dataEditor.datasetName}:${columnIndex}`
    });

    const closeEditor = function() {
        editorLayer.remove();
    };
    const readNextCategories = function() {
        return Array.from(editorLayer.querySelectorAll("[data-value-label-row]")).map((row) => {
            return {
                value: row.querySelector("[data-value-label-value]")?.value.trim() || "",
                label: row.querySelector("[data-value-label-label]")?.value.trim() || "",
                isMissing: Boolean(row.querySelector("[data-value-label-missing]")?.checked)
            };
        }).filter((entry) => entry.value);
    };
    const readNextMissingRange = function() {
        const enabled = editorLayer.querySelector("#datasetValueLabelsRangeEnabled")?.checked;
        const min = editorLayer.querySelector("#datasetValueLabelsRangeMin")?.value.trim() || "";
        const max = editorLayer.querySelector("#datasetValueLabelsRangeMax")?.value.trim() || "";

        return enabled && min && max ? { min, max } : null;
    };

    const rangeEnabled = editorLayer.querySelector("#datasetValueLabelsRangeEnabled");
    const rangeMin = editorLayer.querySelector("#datasetValueLabelsRangeMin");
    const rangeMax = editorLayer.querySelector("#datasetValueLabelsRangeMax");

    if (variable.missingRange) {
        rangeEnabled.checked = true;
        rangeMin.value = variable.missingRange.min || "";
        rangeMax.value = variable.missingRange.max || "";
    }

    tbody.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const deleteButton = target?.closest("[data-value-label-delete]");

        if (!deleteButton) {
            return;
        }

        event.preventDefault();
        const nextCategories = readNextCategories().filter((_entry, index) => {
            return index !== Number(deleteButton.dataset.valueLabelDelete || -1);
        });

        renderRows(nextCategories);
    });
    close.addEventListener("click", closeEditor);
    cancel.addEventListener("click", closeEditor);
    ok.addEventListener("click", async () => {
        try {
            await writeDataEditorValueLabels(
                state.dataEditor.datasetName,
                columnIndex,
                readNextCategories(),
                readNextMissingRange()
            );
            await refreshDataEditorModal(layer, state.dataEditor.datasetName);
            closeEditor();
        }
        catch (error) {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        }
    });
};

const installDataEditorModalActions = function(layer) {
    if (layer.dataset.dataEditorActionsInstalled === "true") {
        return;
    }

    layer.dataset.dataEditorActionsInstalled = "true";
    layer.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const dataTab = target?.closest("#datasetEditorTabData");
        const variablesTab = target?.closest("#datasetEditorTabVariables");
        const menuButton = target?.closest(".dataset-editor__menu-button");
        const dataHeader = target?.closest("[data-data-header]");
        const dataRowName = target?.closest("[data-row-name]");
        const dataCell = target?.closest(".dataset-grid__data-cell");
        const variableCell = target?.closest("[data-variable-cell]");
        const variableField = target?.closest("[data-variable-field]");
        const variableRowIndex = target?.closest("[data-variable-row-index]");
        const valuesEditorButton = target?.closest("[data-variable-values-editor]");
        const variableRow = target?.closest("[data-variable-index]");

        if (target?.closest('[data-header-editor="true"], [data-rowname-editor="true"]')) {
            return;
        }

        if (!target?.closest(".dataset-editor__menu")) {
            hideDataEditorContextMenus(layer);
        }

        if (menuButton) {
            event.preventDefault();
            event.stopPropagation();
            if (menuButton.hasAttribute("disabled")) {
                return;
            }
            runDataEditorContextMenuAction(layer, menuButton).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            }).finally(() => {
                if (state.dataEditor.layer === layer) {
                    hideDataEditorContextMenus(layer);
                }
            });
            if (!menuButton.closest("#datasetEditorHeaderMenu, #datasetEditorRowMenu, #datasetEditorVariableRowMenu")) {
                hideDataEditorContextMenus(layer);
            }
            else {
                setTimeout(() => {
                    if (state.dataEditor.layer === layer) {
                        hideDataEditorContextMenus(layer);
                    }
                }, 0);
            }
            return;
        }

        if (target?.closest(".dataset-editor__menu")) {
            return;
        }

        if (valuesEditorButton) {
            event.preventDefault();
            event.stopPropagation();
            openDataEditorValueLabelsModal(
                layer,
                Number(valuesEditorButton.dataset.variableValuesEditor || 0)
            );
            return;
        }

        if (dataTab) {
            event.preventDefault();
            setDataEditorTab(layer, "data");
            return;
        }

        if (variablesTab) {
            event.preventDefault();
            setDataEditorTab(layer, "variables");
            return;
        }

        if (dataHeader) {
            event.preventDefault();
            selectDataEditorColumn(layer, dataHeader.dataset.dataHeader || "");
            return;
        }

        if (dataRowName) {
            event.preventDefault();
            selectDataEditorRow(layer, Number(dataRowName.dataset.rowName || 0));
            return;
        }

        if (dataCell) {
            selectDataEditorCell(layer, dataCell);
        }

        if (variableRowIndex) {
            const index = Number(variableRowIndex.dataset.variableRowIndex || 0);

            if (index) {
                setDataEditorVariableSelection(layer, index, "name", false);
            }
            return;
        }

        if (variableCell || variableField) {
            const source = variableField || variableCell;
            const index = Number(source?.dataset.variableRow || source?.dataset.variableIndex || 0);
            const key = source?.dataset.variableField || source?.dataset.variableCell || "";

            if (index && key) {
                setDataEditorVariableSelection(layer, index, key, event.shiftKey);
            }
        }

        if (variableRow) {
            const index = Number(variableRow.dataset.variableIndex || 0);

            if (index) {
                state.dataEditor.selectedVariableIndex = index;
            }
        }
    });
    layer.addEventListener("contextmenu", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const dataHeader = target?.closest("[data-data-header]");
        const dataRowName = target?.closest("[data-row-name]");
        const dataCell = target?.closest(".dataset-grid__data-cell");
        const variableRowIndex = target?.closest("[data-variable-row-index]");
        const variableCell = target?.closest("[data-variable-cell]");
        const variableField = target?.closest("[data-variable-field]");

        if (dataHeader) {
            event.preventDefault();
            selectDataEditorColumn(layer, dataHeader.dataset.dataHeader || "");
            showDataEditorContextMenu(
                layer,
                "datasetEditorHeaderMenu",
                { kind: "data-column", columnName: dataHeader.dataset.dataHeader || "" },
                event.clientX,
                event.clientY
            );
            return;
        }

        if (dataRowName) {
            event.preventDefault();
            selectDataEditorRow(layer, Number(dataRowName.dataset.rowName || 0));
            showDataEditorContextMenu(
                layer,
                "datasetEditorRowMenu",
                { kind: "data-row", rowIndex: Number(dataRowName.dataset.rowName || 0) },
                event.clientX,
                event.clientY
            );
            return;
        }

        if (dataCell) {
            event.preventDefault();
            selectDataEditorCell(layer, dataCell);
            showDataEditorContextMenu(
                layer,
                "datasetEditorCellMenu",
                {
                    kind: "data",
                    rowIndex: Number(dataCell.dataset.rowIndex || dataCell.dataset.dataRow || 0),
                    columnName: dataCell.dataset.columnName || dataCell.dataset.dataColumn || ""
                },
                event.clientX,
                event.clientY
            );
            return;
        }

        if (variableRowIndex) {
            const index = Number(variableRowIndex.dataset.variableRowIndex || 0);
            const columnName = variableRowIndex.closest("tr")?.querySelector('[data-variable-field="name"]')?.value || "";

            if (index && columnName) {
                event.preventDefault();
                setDataEditorVariableSelection(layer, index, "name", false);
                showDataEditorContextMenu(
                    layer,
                    "datasetEditorVariableRowMenu",
                    {
                        kind: "variable-row",
                        rowIndex: index,
                        columnName
                    },
                    event.clientX,
                    event.clientY
                );
            }
            return;
        }

        if (variableCell || variableField) {
            const source = variableField || variableCell;
            const index = Number(source?.dataset.variableRow || source?.dataset.variableIndex || 0);
            const key = source?.dataset.variableField || source?.dataset.variableCell || "";

            if (index && key) {
                const existingRows = selectedDataEditorVariableRows(index, key);
                const keepExistingRange = existingRows.length > 1 && existingRows.includes(index);

                event.preventDefault();
                if (!keepExistingRange) {
                    setDataEditorVariableSelection(layer, index, key, false);
                }
                showDataEditorContextMenu(
                    layer,
                    "datasetEditorCellMenu",
                    {
                        kind: "variable",
                        rowIndex: index,
                        key
                    },
                    event.clientX,
                    event.clientY,
                    { pasteOnly: selectedDataEditorVariableRows(index, key).length > 1 }
                );
            }
        }
    });
    layer.addEventListener("dblclick", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const dataRowName = target?.closest("[data-row-name]");
        const dataCell = target?.closest(".dataset-grid__data-cell");

        if (dataRowName) {
            event.preventDefault();
            startDataEditorRowNameEdit(layer, Number(dataRowName.dataset.rowName || 0));
            return;
        }

        if (dataCell) {
            startDataEditorCellEdit(dataCell);
        }
    });
    layer.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const resizeHandle = target?.closest("[data-variable-column-resize]");

        if (resizeHandle) {
            beginDataEditorVariableColumnResize(layer, resizeHandle, event);
        }
    });
    layer.addEventListener("keydown", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const dataCell = target?.closest(".dataset-grid__data-cell");

        if (
            target instanceof HTMLInputElement
            && (
                target.dataset.headerEditor === "true"
                || target.dataset.rownameEditor === "true"
            )
        ) {
            if (event.key === "Enter") {
                event.preventDefault();
                finishDataEditorInlineEdit(layer, target, true).catch(() => {});
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                finishDataEditorInlineEdit(layer, target, false).catch(() => {});
                return;
            }
        }

        if (
            (event.metaKey || event.ctrlKey)
            && String(event.key || "").toLowerCase() === "c"
        ) {
            if (isEditableClipboardTarget(target)) {
                return;
            }
            event.preventDefault();
            const variableCell = state.dataEditor.variableSelection?.activeCell;

            if (state.dataEditor.activeTab === "variables" && variableCell) {
                state.dataEditor.contextMenu = {
                    kind: "datasetEditorCellMenu",
                    target: {
                        kind: "variable",
                        rowIndex: variableCell.rowIndex,
                        key: variableCell.key
                    }
                };
            }
            copyDataEditorContextSelection(layer).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
            return;
        }

        if (
            (event.metaKey || event.ctrlKey)
            && String(event.key || "").toLowerCase() === "v"
        ) {
            if (isEditableClipboardTarget(target)) {
                return;
            }
            event.preventDefault();
            const variableCell = state.dataEditor.variableSelection?.activeCell;

            if (state.dataEditor.activeTab === "variables" && variableCell) {
                state.dataEditor.contextMenu = {
                    kind: "datasetEditorCellMenu",
                    target: {
                        kind: "variable",
                        rowIndex: variableCell.rowIndex,
                        key: variableCell.key
                    }
                };
            }
            pasteDataEditorContextSelection(layer).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
            return;
        }

        if (dataCell && event.key === "Enter") {
            event.preventDefault();
            startDataEditorCellEdit(dataCell);
            return;
        }

        if (
            dataCell
            && event.key.length === 1
            && !event.metaKey
            && !event.ctrlKey
            && !event.altKey
        ) {
            event.preventDefault();
            startDataEditorCellEdit(dataCell, event.key);
        }
    });
    layer.addEventListener("paste", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const text = event.clipboardData?.getData("text/plain") || "";

        if (isEditableClipboardTarget(target) || !text) {
            return;
        }

        event.preventDefault();
        if (state.dataEditor.activeTab === "variables") {
            const variableCell = state.dataEditor.variableSelection?.activeCell;

            if (variableCell) {
                state.dataEditor.contextMenu = {
                    kind: "datasetEditorCellMenu",
                    target: {
                        kind: "variable",
                        rowIndex: variableCell.rowIndex,
                        key: variableCell.key
                    }
                };
                pasteDataEditorContextSelection(layer).catch((error) => {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                });
            }
            return;
        }
        pasteTextIntoSelectedDataEditorCell(layer, text).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    layer.addEventListener("scroll", (event) => {
        const target = event.target;

        if (
            target instanceof Element
            && target.id === "datasetEditorDataScroll"
        ) {
            const datasetName = state.dataEditor.datasetName;
            const cache = getDataEditorCache(datasetName);

            window.clearTimeout(cache.dataScrollTimer);
            cache.dataScrollTimer = window.setTimeout(() => {
                ensureDataEditorDataViewportLoaded(layer).catch((error) => {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                });
            }, 20);
        }

        if (
            target instanceof Element
            && target.id === "datasetEditorVariablesScroll"
        ) {
            const datasetName = state.dataEditor.datasetName;
            const cache = getDataEditorCache(datasetName);

            window.clearTimeout(cache.variablesScrollTimer);
            cache.variablesScrollTimer = window.setTimeout(() => {
                ensureDataEditorVariableViewportLoaded(layer, datasetName).catch((error) => {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                });
            }, 20);
        }
    }, true);
    layer.addEventListener("change", (event) => {
        const target = event.target;

        if (
            target instanceof HTMLSelectElement
            && target.dataset.variableField
        ) {
            commitDataEditorVariableField(target).catch(() => {});
        }
    });
    layer.addEventListener("focusout", (event) => {
        const target = event.target;

        if (
            target instanceof HTMLInputElement
            && (
                target.dataset.headerEditor === "true"
                || target.dataset.rownameEditor === "true"
            )
        ) {
            finishDataEditorInlineEdit(layer, target, true).catch(() => {});
            return;
        }

        if (
            target instanceof HTMLInputElement
            && target.dataset.variableField
        ) {
            commitDataEditorVariableField(target).catch(() => {});
        }
    });
    layer.addEventListener("keydown", (event) => {
        const target = event.target;

        if (
            target instanceof HTMLInputElement
            && target.dataset.variableField
            && event.key === "Enter"
        ) {
            event.preventDefault();
            target.blur();
        }
    });
};

const createDataEditorContent = function(datasetName) {
    const root = document.createElement("div");

    root.className = "dataset-editor";
    root.id = "datasetEditorRoot";
    root.innerHTML = [
        "<div class=\"dataset-editor__menu\" id=\"datasetEditorHeaderMenu\" hidden>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"copy-values\">Copy values</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"copy-labels\">Copy values and labels</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"paste\" disabled>Paste</button>",
        "  <div class=\"dataset-editor__menu-separator\"></div>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"sort-asc\">Sort ascending</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"sort-desc\">Sort descending</button>",
        "  <div class=\"dataset-editor__menu-separator\"></div>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"add-before\">Add column before</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"add-after\">Add column after</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"rename\">Rename column</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-header-menu-action=\"remove\">Remove</button>",
        "</div>",
        "<div class=\"dataset-editor__menu\" id=\"datasetEditorRowMenu\" hidden>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-row-menu-action=\"rename\">Rename row</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-row-menu-action=\"add-before\">Add row before</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-row-menu-action=\"add-after\">Add row after</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-row-menu-action=\"remove\">Delete row</button>",
        "</div>",
        "<div class=\"dataset-editor__menu\" id=\"datasetEditorVariableRowMenu\" hidden>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-variable-row-menu-action=\"add-before\">Add row before</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-variable-row-menu-action=\"add-after\">Add row after</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-variable-row-menu-action=\"remove\">Remove row</button>",
        "</div>",
        "<div class=\"dataset-editor__menu\" id=\"datasetEditorCellMenu\" hidden>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-cell-menu-action=\"copy\">Copy</button>",
        "  <button type=\"button\" class=\"dataset-editor__menu-button\" data-cell-menu-action=\"paste\">Paste</button>",
        "</div>",
        "<div class=\"dataset-editor__chrome\">",
        "  <div class=\"dataset-editor__dataset-switch\">",
        "    <label class=\"dataset-editor__dataset-switch-label\" for=\"datasetEditorDatasetSelect\">Dataset:</label>",
        "    <div class=\"dataset-grid__select-wrap\">",
        "      <select class=\"dataset-editor__dataset-select dataset-grid__select custom-select\" id=\"datasetEditorDatasetSelect\"></select>",
        "      <span class=\"dataset-grid__select-arrow\" aria-hidden=\"true\">&#9662;</span>",
        "    </div>",
        "  </div>",
        "  <div class=\"dataset-editor__title-wrap\">",
        "    <div class=\"dataset-editor__title\" id=\"datasetEditorTitle\">Dataset Editor</div>",
        "    <div class=\"dataset-editor__meta\" id=\"datasetEditorSubtitle\">&nbsp;</div>",
        "  </div>",
        "</div>",
        "<div class=\"dataset-editor__body\">",
        "  <section class=\"dataset-editor__panel is-active\" id=\"datasetEditorPanelData\" role=\"tabpanel\">",
        "    <div class=\"dataset-sheet\"><div class=\"dataset-sheet__viewport\" id=\"datasetEditorDataScroll\"><div class=\"dataset-sheet__status\">Loading...</div></div></div>",
        "  </section>",
        "  <section class=\"dataset-editor__panel\" id=\"datasetEditorPanelVariables\" role=\"tabpanel\">",
        "    <div class=\"dataset-sheet\"><div class=\"dataset-sheet__viewport\" id=\"datasetEditorVariablesScroll\"><div class=\"dataset-sheet__status\">Loading...</div></div></div>",
        "  </section>",
        "</div>",
        "<div class=\"dataset-editor__footer\">",
        "  <div class=\"dataset-editor__tabs\" role=\"tablist\" aria-label=\"Dataset editor tabs\">",
        "    <button type=\"button\" class=\"dataset-editor__tab is-active\" id=\"datasetEditorTabData\" role=\"tab\" aria-selected=\"true\">Data</button>",
        "    <button type=\"button\" class=\"dataset-editor__tab\" id=\"datasetEditorTabVariables\" role=\"tab\" aria-selected=\"false\">Variables</button>",
        "  </div>",
        "  <div class=\"dataset-editor__footer-note\" id=\"datasetEditorFooterNote\">Spreadsheet view</div>",
        "</div>"
    ].join("");
    root.dataset.datasetName = datasetName;

    return root;
};

const openDataEditorModal = async function(datasetName) {
    const cleanName = String(datasetName || state.activeDatasetName || "").trim();

    if (!cleanName) {
        return;
    }

    const existingLayer = state.dataEditor.layer?.isConnected ? state.dataEditor.layer : null;
    const layer = existingLayer || document.createElement("div");
    let shell = layer.querySelector(".dialogforge-web-data-editor-window");
    let content = layer.querySelector("#datasetEditorRoot");

    if (!existingLayer) {
        const titlebar = document.createElement("div");
        const titleNode = document.createElement("div");
        const close = document.createElement("button");
        const rightHandle = document.createElement("span");
        const bottomHandle = document.createElement("span");
        const cornerHandle = document.createElement("span");

        shell = document.createElement("section");
        content = createDataEditorContent(cleanName);
        layer.className = "dialogforge-web-dialog-layer dialogforge-web-data-editor-layer";
        layer.dataset.surfaceId = "dataEditor";
        shell.className = "dialogforge-web-dialog dialogforge-web-data-editor-window";
        shell.setAttribute("role", "dialog");
        shell.setAttribute("aria-modal", "true");
        shell.setAttribute("aria-label", "Data editor");
        titlebar.className = "dialogforge-web-dialog__titlebar";
        titleNode.className = "dialogforge-web-dialog__title";
        titleNode.textContent = `Data editor: ${cleanName}`;
        close.className = "dialogforge-web-dialog__close";
        close.type = "button";
        close.textContent = "x";
        close.setAttribute("aria-label", "Close");
        rightHandle.className = "web-workbench-resize-handle";
        rightHandle.dataset.resizeDirection = "right";
        bottomHandle.className = "web-workbench-resize-handle";
        bottomHandle.dataset.resizeDirection = "bottom";
        cornerHandle.className = "web-workbench-resize-handle";
        cornerHandle.dataset.resizeDirection = "corner";

        close.addEventListener("click", () => {
            layer.remove();
            if (state.dataEditor.layer === layer) {
                state.dataEditor.layer = null;
            }
        });
        titlebar.append(titleNode, close);
        shell.append(titlebar, content, rightHandle, bottomHandle, cornerHandle);
        layer.appendChild(shell);
        document.body.appendChild(layer);
        state.dataEditor.layer = layer;
        installDataEditorModalActions(layer);
        installDraggableModal(shell, titlebar, {
            mode: "fixed",
            storageKey: "dataEditor"
        });
        installResizableWindow(shell, [rightHandle, bottomHandle, cornerHandle]);
    }
    else {
        content.dataset.datasetName = cleanName;
        const titleNode = layer.querySelector(".dialogforge-web-dialog__title");
        if (titleNode) {
            titleNode.textContent = `Data editor: ${cleanName}`;
        }
    }

    state.dataEditor.datasetName = cleanName;
    setDataEditorTab(layer, state.dataEditor.activeTab);
    layer.querySelector("#datasetEditorTabData")?.addEventListener("click", () => setDataEditorTab(layer, "data"));
    layer.querySelector("#datasetEditorTabVariables")?.addEventListener("click", () => setDataEditorTab(layer, "variables"));
    layer.querySelector("#datasetEditorDatasetSelect")?.addEventListener("change", (event) => {
        const target = event.target;
        const nextName = target instanceof HTMLSelectElement ? target.value : "";

        openDataEditorModal(nextName).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });

    try {
        if (!renderCachedDataEditorSnapshot(layer, cleanName)) {
            await refreshDataEditorModal(layer, cleanName);
        }
        else {
            await refreshWebRWorkspacePane();
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        layer.querySelector("#datasetEditorDataScroll")?.replaceChildren(Object.assign(document.createElement("div"), {
            className: "dataset-sheet__status",
            textContent: message
        }));
        layer.querySelector("#datasetEditorVariablesScroll")?.replaceChildren(Object.assign(document.createElement("div"), {
            className: "dataset-sheet__status",
            textContent: message
        }));
    }
};

const handleBrowserGoToStateUpdate = async function(message) {
    const value = message.value && typeof message.value === "object"
        ? message.value
        : {};
    const datasetName = String(message.dataset || state.activeDatasetName || "").trim();

    if (!datasetName) {
        return;
    }

    if (String(value.variableName || "").trim()) {
        const variableName = String(value.variableName || "").trim();
        const columnIndex = workspaceColumnNames(datasetName).indexOf(variableName) + 1;

        if (columnIndex > 0) {
            state.dataEditor.selectedVariableIndex = columnIndex;
        }
        state.dataEditor.activeTab = "variables";
        await openDataEditorModal(datasetName);
        const rows = Array.from(state.dataEditor.layer?.querySelectorAll(
            ".dataset-grid--variables tbody tr"
        ) || []);
        const row = rows.find((entry) => {
            const input = entry.querySelector('input[data-variable-field="name"]');

            return input instanceof HTMLInputElement && input.value === variableName;
        }) || state.dataEditor.layer?.querySelector(
            `.dataset-grid--variables tbody tr[data-variable-index="${CSS.escape(String(columnIndex))}"]`
        );

        if (row) {
            state.dataEditor.selectedVariableIndex = Number(row.dataset.variableIndex || columnIndex);
            state.dataEditor.layer?.querySelectorAll(".dataset-grid--variables tbody tr.is-selected").forEach((entry) => {
                entry.classList.remove("is-selected");
            });
            row.classList.add("is-selected");
        }
        row?.scrollIntoView?.({ block: "center", inline: "nearest" });
        return;
    }

    if (Number(value.caseNumber || 0) > 0) {
        const caseNumber = Number(value.caseNumber || 0);
        const firstColumn = workspaceColumnNames(datasetName)[0] || "";

        state.dataEditor.selectedCell = {
            rowIndex: caseNumber,
            columnName: firstColumn
        };
        state.dataEditor.activeTab = "data";
        await openDataEditorModal(datasetName);
        const cell = state.dataEditor.layer?.querySelector(
            `.dataset-grid__data-cell[data-row-index="${CSS.escape(String(caseNumber))}"]`
        );

        cell?.scrollIntoView?.({ block: "center", inline: "nearest" });
    }
};

const scriptEditorSessionStorageKey = "app.scriptEditor.tabs.v1.web-dialogr";

const scriptEditorBaseName = function(fileName) {
    const value = String(fileName || "").replace(/\\/g, "/").trim();
    const parts = value.split("/").filter(Boolean);

    return parts[parts.length - 1] || "Untitled.R";
};

const readScriptEditorScrollTop = function() {
    try {
        return Number(state.scriptEditor.editor?.getScrollTop?.() || 0);
    } catch {
        return 0;
    }
};

const captureActiveScriptEditorScroll = function() {
    const tab = activeScriptEditorTab();
    const scrollTop = readScriptEditorScrollTop();

    if (!tab || !Number.isFinite(scrollTop) || scrollTop < 0) {
        return;
    }

    tab.scrollTop = Math.round(scrollTop);
};

const persistScriptEditorSession = function() {
    if (state.scriptEditor.sessionRestoring) {
        return;
    }

    try {
        captureActiveScriptEditorScroll();

        if (!state.scriptEditor.tabs.length) {
            localStorage.removeItem(scriptEditorSessionStorageKey);
            return;
        }

        const session = {
            activeTabId: state.scriptEditor.activeTabId,
            tabs: state.scriptEditor.tabs.map((tab) => {
                return {
                    id: String(tab.id || ""),
                    fileName: tab.fileName || "Untitled.R",
                    content: String(tab.model?.getValue?.() || ""),
                    savedContent: String(tab.savedContent || ""),
                    dirty: Boolean(tab.dirty),
                    scrollTop: Number(tab.scrollTop || 0),
                    hasFileHandle: Boolean(tab.fileHandle)
                };
            })
        };

        localStorage.setItem(
            scriptEditorSessionStorageKey,
            JSON.stringify(session)
        );
    } catch {}
};

const scheduleScriptEditorSessionPersistence = function() {
    if (state.scriptEditor.sessionPersistTimer) {
        clearTimeout(state.scriptEditor.sessionPersistTimer);
    }

    state.scriptEditor.sessionPersistTimer = setTimeout(() => {
        state.scriptEditor.sessionPersistTimer = null;
        persistScriptEditorSession();
    }, 180);
};

const clearScriptEditorSession = function() {
    try {
        localStorage.removeItem(scriptEditorSessionStorageKey);
    } catch {}
};

const readScriptEditorSession = function() {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(scriptEditorSessionStorageKey) || "{}"
        );
        const tabs = Array.isArray(parsed.tabs) ? parsed.tabs : [];

        return {
            activeTabId: String(parsed.activeTabId || ""),
            tabs: tabs.map((tab, index) => {
                return {
                    id: String(tab.id || `restored-${index + 1}`),
                    fileName: scriptEditorBaseName(tab.fileName),
                    content: String(tab.content || ""),
                    savedContent: String(tab.savedContent || ""),
                    dirty: Boolean(tab.dirty),
                    scrollTop: Math.max(0, Number(tab.scrollTop || 0))
                };
            }).filter((tab) => {
                return tab.fileName || tab.content || tab.dirty;
            })
        };
    } catch {
        return {
            activeTabId: "",
            tabs: []
        };
    }
};

const restoreScriptEditorSession = function() {
    const session = readScriptEditorSession();

    if (!session.tabs.length) {
        return false;
    }

    state.scriptEditor.sessionRestoring = true;
    session.tabs.forEach((tab) => {
        const restored = createScriptEditorTab(
            tab.fileName || "Untitled.R",
            tab.content || "",
            tab.dirty,
            null,
            {
                id: tab.id,
                activate: false,
                scrollTop: tab.scrollTop,
                savedContent: tab.savedContent
            }
        );

        if (restored) {
            restored.scrollTop = tab.scrollTop;
        }
    });
    state.scriptEditor.sessionRestoring = false;

    const activeId = session.activeTabId
        && state.scriptEditor.tabs.some((tab) => tab.id === session.activeTabId)
        ? session.activeTabId
        : state.scriptEditor.tabs[0]?.id;

    if (activeId) {
        setActiveScriptEditorTab(activeId);
    }

    persistScriptEditorSession();

    return true;
};

const updateScriptEditorChrome = function() {
    const layer = state.scriptEditor.layer;

    if (!layer?.isConnected) {
        return;
    }

    const activeTab = state.scriptEditor.tabs.find((tab) => {
        return tab.id === state.scriptEditor.activeTabId;
    });
    const dirtyMarker = (activeTab?.dirty || state.scriptEditor.dirty) ? " •" : "";
    const fileName = activeTab?.fileName || state.scriptEditor.fileName || "Untitled.R";
    const title = `${fileName}${dirtyMarker} - Script editor`;
    const titleNode = layer.querySelector(".dialogforge-web-dialog__title");
    const tabs = layer.querySelector(".dm-script-tabs");
    const pathBar = layer.querySelector(".dm-script-pathbar");

    if (titleNode) {
        titleNode.textContent = title;
    }
    if (tabs) {
        tabs.replaceChildren(...state.scriptEditor.tabs.map((tab) => {
            const button = document.createElement("button");
            const label = document.createElement("span");
            const closeButton = document.createElement("button");
            const marker = tab.dirty ? " •" : "";
            const baseName = scriptEditorBaseName(tab.fileName);

            button.type = "button";
            button.className = `dm-script-tab${tab.id === state.scriptEditor.activeTabId ? " active" : ""}`;
            button.dataset.scriptTabId = tab.id;
            button.setAttribute("aria-selected", tab.id === state.scriptEditor.activeTabId ? "true" : "false");
            button.draggable = true;
            label.className = "dm-script-tab-label";
            label.textContent = `${baseName}${marker}`;
            label.title = tab.fileName || baseName;
            button.appendChild(label);
            closeButton.type = "button";
            closeButton.className = "dm-script-tab-close";
            closeButton.textContent = "×";
            closeButton.title = "Close Tab";
            closeButton.setAttribute("aria-label", `Close ${baseName}`);
            closeButton.addEventListener("click", (event) => {
                event.stopPropagation();
                closeScriptEditorTab(tab.id).catch((error) => {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                });
            });
            button.appendChild(closeButton);
            button.addEventListener("click", () => {
                setActiveScriptEditorTab(tab.id);
            });

            return button;
        }));
    }
    if (pathBar) {
        pathBar.textContent = fileName;
    }
};

const activeScriptEditorTab = function() {
    return state.scriptEditor.tabs.find((tab) => {
        return tab.id === state.scriptEditor.activeTabId;
    }) || null;
};

const syncActiveScriptEditorTab = function() {
    const tab = activeScriptEditorTab();

    state.scriptEditor.model = tab?.model || null;
    state.scriptEditor.fileName = tab?.fileName || "Untitled.R";
    state.scriptEditor.fileHandle = tab?.fileHandle || null;
    state.scriptEditor.dirty = Boolean(tab?.dirty);
};

const setActiveScriptEditorTab = function(tabId) {
    const tab = state.scriptEditor.tabs.find((entry) => {
        return entry.id === tabId;
    });

    if (!tab) {
        return;
    }

    captureActiveScriptEditorScroll();
    state.scriptEditor.activeTabId = tab.id;
    syncActiveScriptEditorTab();
    state.scriptEditor.editor?.setModel?.(tab.model);
    try {
        state.scriptEditor.editor?.setScrollTop?.(Number(tab.scrollTop || 0));
    } catch {}
    updateScriptEditorChrome();
    persistScriptEditorSession();
    state.scriptEditor.editor?.focus?.();
};

const createScriptEditorTab = function(fileName, text, dirty = false, fileHandle = null, options = {}) {
    const monaco = state.scriptEditor.monaco;

    if (!monaco) {
        return null;
    }

    const id = options.id || `script-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const tab = {
        id,
        fileName: scriptEditorBaseName(fileName),
        fileHandle,
        model: monaco.editor.createModel(normalizeCommandText(text || ""), "r"),
        dirty: Boolean(dirty),
        scrollTop: Math.max(0, Number(options.scrollTop || 0)),
        savedContent: normalizeCommandText(
            options.savedContent === undefined
                ? text || ""
                : options.savedContent
        )
    };

    tab.model.onDidChangeContent(() => {
        if (state.scriptEditor.ignoreChanges) {
            return;
        }
        tab.dirty = true;
        if (tab.id === state.scriptEditor.activeTabId) {
            syncActiveScriptEditorTab();
        }
        updateScriptEditorChrome();
        scheduleScriptEditorSessionPersistence();
    });
    state.scriptEditor.tabs.push(tab);
    if (options.activate !== false || !state.scriptEditor.activeTabId) {
        state.scriptEditor.activeTabId = tab.id;
        syncActiveScriptEditorTab();
        state.scriptEditor.editor?.setModel?.(tab.model);
        try {
            state.scriptEditor.editor?.setScrollTop?.(tab.scrollTop);
        } catch {}
    }
    updateScriptEditorChrome();
    scheduleScriptEditorSessionPersistence();

    return tab;
};

const chooseScriptTabAfterClose = function(closedIndex) {
    if (!state.scriptEditor.tabs.length) {
        return "";
    }

    const nextIndex = Math.max(
        0,
        Math.min(Number(closedIndex) || 0, state.scriptEditor.tabs.length - 1)
    );

    return state.scriptEditor.tabs[nextIndex]?.id || "";
};

const showScriptEditorCloseDecision = function(fileName) {
    if (state.scriptEditor.closeConfirmLayer) {
        state.scriptEditor.closeConfirmLayer.querySelector("[data-script-editor-close-decision='save']")?.focus?.();
        return state.scriptEditor.closeConfirmPromise || Promise.resolve("cancel");
    }

    state.scriptEditor.closeConfirmPromise = new Promise((resolve) => {
        const layer = document.createElement("div");
        const shell = document.createElement("section");
        const titlebar = document.createElement("div");
        const title = document.createElement("div");
        const close = document.createElement("button");
        const body = document.createElement("div");
        const actions = document.createElement("div");

        const finish = function(decision) {
            if (state.scriptEditor.closeConfirmLayer === layer) {
                state.scriptEditor.closeConfirmLayer = null;
                state.scriptEditor.closeConfirmPromise = null;
            }

            document.removeEventListener("keydown", onKeyDown, true);
            layer.remove();
            resolve(decision);
        };
        const createAction = function(label, decision, modifier = "") {
            const button = document.createElement("button");

            button.className = [
                "dialogforge-web-confirm__button",
                modifier
            ].filter(Boolean).join(" ");
            button.type = "button";
            button.textContent = label;
            button.dataset.scriptEditorCloseDecision = decision;
            button.addEventListener("click", () => finish(decision));

            return button;
        };
        const onKeyDown = function(event) {
            if (event.key !== "Escape") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            finish("cancel");
        };
        const save = createAction("Save", "save", "dialogforge-web-confirm__button--primary");
        const dontSave = createAction("Don't Save", "dont-save");
        const cancel = createAction("Cancel", "cancel");

        layer.className = "dialogforge-web-dialog-layer dialogforge-web-confirm-layer";
        layer.dataset.surfaceId = "scriptEditorCloseConfirm";
        shell.className = "dialogforge-web-dialog dialogforge-web-confirm";
        shell.setAttribute("role", "dialog");
        shell.setAttribute("aria-modal", "true");
        shell.setAttribute("aria-label", `Save changes to ${fileName} before closing?`);
        titlebar.className = "dialogforge-web-dialog__titlebar";
        title.className = "dialogforge-web-dialog__title";
        title.textContent = "Script editor";
        close.className = "dialogforge-web-dialog__close";
        close.type = "button";
        close.textContent = "x";
        close.setAttribute("aria-label", "Cancel close");
        body.className = "dialogforge-web-confirm__body";
        body.textContent = `Save changes to ${fileName} before closing?`;
        actions.className = "dialogforge-web-confirm__actions";

        close.addEventListener("click", () => finish("cancel"));
        actions.append(save, dontSave, cancel);
        titlebar.append(title, close);
        shell.append(titlebar, body, actions);
        layer.appendChild(shell);
        document.body.appendChild(layer);
        state.scriptEditor.closeConfirmLayer = layer;
        installDraggableModal(shell, titlebar, {
            mode: "fixed",
            storageKey: "scriptEditorCloseConfirm"
        });
        document.addEventListener("keydown", onKeyDown, true);
        save.focus();
    });
};

const confirmScriptEditorSaveDecision = async function(tab) {
    const fileName = scriptEditorBaseName(tab?.fileName || "Untitled.R");

    return showScriptEditorCloseDecision(fileName);
};

const resolveScriptEditorTabForClose = async function(tab) {
    if (!tab?.dirty) {
        return true;
    }

    setActiveScriptEditorTab(tab.id);
    const decision = await confirmScriptEditorSaveDecision(tab);

    if (decision === "cancel") {
        return false;
    }

    if (decision === "save") {
        return saveScriptEditorToLocalFile(false, tab);
    }

    state.scriptEditor.ignoreChanges = true;
    tab.model?.setValue?.(String(tab.savedContent || ""));
    state.scriptEditor.ignoreChanges = false;
    tab.dirty = false;
    syncActiveScriptEditorTab();
    updateScriptEditorChrome();
    persistScriptEditorSession();

    return true;
};

const closeScriptEditorTab = async function(tabId) {
    const tabIndex = state.scriptEditor.tabs.findIndex((tab) => {
        return tab.id === tabId;
    });

    if (tabIndex < 0) {
        return false;
    }

    const tab = state.scriptEditor.tabs[tabIndex];
    const resolved = await resolveScriptEditorTabForClose(tab);

    if (!resolved) {
        return false;
    }

    state.scriptEditor.tabs.splice(tabIndex, 1);
    tab.model?.dispose?.();

    if (!state.scriptEditor.tabs.length) {
        createScriptEditorTab("Untitled.R", "", false);
        persistScriptEditorSession();
        return true;
    }

    if (state.scriptEditor.activeTabId === tabId) {
        const nextTabId = chooseScriptTabAfterClose(tabIndex);

        if (nextTabId) {
            setActiveScriptEditorTab(nextTabId);
        }
    }
    else {
        updateScriptEditorChrome();
        persistScriptEditorSession();
    }

    return true;
};

const resolveScriptEditorWindowForClose = async function() {
    for (const tab of state.scriptEditor.tabs.slice()) {
        const resolved = await resolveScriptEditorTabForClose(tab);

        if (!resolved) {
            return false;
        }
    }

    return true;
};

const insertScriptEditorCode = function(code) {
    const editor = state.scriptEditor.editor;
    const model = state.scriptEditor.model;
    const text = normalizeCommandText(code);

    if (!editor || !model || !text.trim()) {
        return;
    }

    const current = model.getValue();
    const next = current.trim()
        ? `${current.replace(/\s+$/g, "")}\n\n${text}`
        : text;

    state.scriptEditor.ignoreChanges = true;
    model.setValue(next);
    state.scriptEditor.ignoreChanges = false;
    const tab = activeScriptEditorTab();

    if (tab) {
        tab.dirty = true;
    }
    syncActiveScriptEditorTab();
    updateScriptEditorChrome();
    scheduleScriptEditorSessionPersistence();
    editor.focus();
};

const ensureScriptStatementRuntime = async function() {
    if (state.scriptEditor.scriptStatement) {
        return state.scriptEditor.scriptStatement;
    }

    state.scriptEditor.scriptStatement = await import(
        "/browser-esm/shared/script-editor/run/scriptStatement.js"
    );

    return state.scriptEditor.scriptStatement;
};

const findScriptEditorStatementAtCursor = async function() {
    const editor = state.scriptEditor.editor;
    const model = state.scriptEditor.model;
    const monaco = state.scriptEditor.monaco;

    if (!editor || !model || !monaco) {
        return "";
    }

    const selection = editor.getSelection?.();

    if (selection && !selection.isEmpty?.()) {
        return {
            code: normalizeCommandText(model.getValueInRange(selection)).trim(),
            endLineNumber: Number(selection.endLineNumber || selection.startLineNumber || 1),
            usedSelection: true
        };
    }

    const statementRuntime = await ensureScriptStatementRuntime();
    const position = editor.getPosition?.() || { lineNumber: 1, column: 1 };
    const lineNumber = Number(position.lineNumber || 1);
    const statement = await statementRuntime.findScriptStatementAtLine(
        {
            getLineCount: () => {
                return Number(model.getLineCount?.() || 1);
            },
            getLineContent: (requestedLine) => {
                return String(model.getLineContent?.(requestedLine) || "");
            },
            getText: (startLine, endLine) => {
                const range = new monaco.Range(
                    startLine,
                    1,
                    endLine,
                    Number(model.getLineMaxColumn?.(endLine) || 1)
                );

                return String(model.getValueInRange?.(range) || "");
            }
        },
        lineNumber,
        checkCodeFragmentComplete
    );

    return {
        code: normalizeCommandText(statement.code).trim(),
        endLineNumber: Number(statement.endLine || lineNumber),
        usedSelection: false
    };
};

const advanceScriptEditorCursor = function(endLineNumber) {
    const editor = state.scriptEditor.editor;
    const model = state.scriptEditor.model;

    if (!editor || !model) {
        return;
    }

    const lineCount = Number(model.getLineCount?.() || 1);

    for (
        let lineNumber = Math.max(1, Number(endLineNumber || 1) + 1);
        lineNumber <= lineCount;
        lineNumber += 1
    ) {
        const line = String(model.getLineContent?.(lineNumber) || "");

        if (!line.trim()) {
            continue;
        }

        const position = { lineNumber, column: 1 };
        editor.setPosition?.(position);
        editor.revealPositionInCenterIfOutsideViewport?.(position);
        return;
    }
};

const runScriptEditorCode = async function() {
    const picked = await findScriptEditorStatementAtCursor();
    const code = String(picked?.code || "");

    if (!code) {
        return;
    }

    await executeVisibleCommand(code);

    if (!picked.usedSelection) {
        advanceScriptEditorCursor(picked.endLineNumber);
    }

    state.scriptEditor.editor?.focus?.();
};

const insertScriptEditorTextAtCursor = function(text) {
    const editor = state.scriptEditor.editor;
    const model = state.scriptEditor.model;
    const value = String(text || "");

    if (!editor || !model || !value) {
        return;
    }

    const selection = editor.getSelection?.();
    const range = selection || model.getFullModelRange?.();

    if (!range) {
        return;
    }

    editor.executeEdits?.(
        "scriptEditor.paste",
        [
            {
                range,
                text: value,
                forceMoveMarkers: true
            }
        ]
    );
    editor.focus?.();
};

const pasteScriptEditorClipboard = function() {
    navigator.clipboard?.readText?.().then((text) => {
        insertScriptEditorTextAtCursor(text);
    }).catch(() => {});
};

const scriptEditorFilePickerOptions = {
    types: [
        {
            description: "R scripts",
            accept: {
                "text/x-r-source": [".R", ".r", ".q", ".s"],
                "text/plain": [".txt"]
            }
        }
    ]
};

const saveScriptEditorAsDownload = function(fileName, text) {
    const blob = new Blob([text], {
        type: "text/x-r-source;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName || "Untitled.R";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const markActiveScriptEditorTabSaved = function(fileName, fileHandle = null) {
    const tab = activeScriptEditorTab();

    if (tab) {
        tab.fileName = scriptEditorBaseName(fileName || tab.fileName || "Untitled.R");
        tab.fileHandle = fileHandle || tab.fileHandle || null;
        tab.dirty = false;
        tab.savedContent = String(tab.model?.getValue?.() || "");
    }
    syncActiveScriptEditorTab();
    updateScriptEditorChrome();
    persistScriptEditorSession();
};

const writeScriptEditorFileHandle = async function(fileHandle, text) {
    const writable = await fileHandle.createWritable();

    try {
        await writable.write(text);
    }
    finally {
        await writable.close();
    }
};

const saveScriptEditorToLocalFile = async function(saveAs = false, requestedTab = null) {
    const activeTab = requestedTab || activeScriptEditorTab();
    const model = activeTab?.model || state.scriptEditor.model;
    const text = model?.getValue?.() || "";
    let fileHandle = saveAs ? null : activeTab?.fileHandle || state.scriptEditor.fileHandle || null;

    if (!model) {
        return false;
    }

    if (!fileHandle && "showSaveFilePicker" in window) {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: activeTab?.fileName || state.scriptEditor.fileName || "Untitled.R",
            ...scriptEditorFilePickerOptions
        });
    }

    if (fileHandle) {
        await writeScriptEditorFileHandle(fileHandle, text);
        if (activeTab && activeTab.id !== state.scriptEditor.activeTabId) {
            activeTab.fileName = scriptEditorBaseName(fileHandle.name || activeTab.fileName || "Untitled.R");
            activeTab.fileHandle = fileHandle;
            activeTab.dirty = false;
            activeTab.savedContent = text;
            updateScriptEditorChrome();
            persistScriptEditorSession();
        }
        else {
            markActiveScriptEditorTabSaved(fileHandle.name || activeTab?.fileName || "Untitled.R", fileHandle);
        }
        state.scriptEditor.editor?.focus?.();
        return true;
    }

    saveScriptEditorAsDownload(activeTab?.fileName || state.scriptEditor.fileName || "Untitled.R", text);
    if (activeTab && activeTab.id !== state.scriptEditor.activeTabId) {
        activeTab.dirty = false;
        activeTab.savedContent = text;
        updateScriptEditorChrome();
        persistScriptEditorSession();
    }
    else {
        markActiveScriptEditorTabSaved(activeTab?.fileName || state.scriptEditor.fileName || "Untitled.R");
    }
    state.scriptEditor.editor?.focus?.();
    return true;
};

const openScriptEditorWithFile = async function(file, fileHandle = null) {
    const text = await file.text();
    const fileName = scriptEditorBaseName(file.name || "Untitled.R");
    const existing = state.scriptEditor.tabs.find((tab) => {
        return scriptEditorBaseName(tab.fileName) === fileName;
    });

    if (existing) {
        setActiveScriptEditorTab(existing.id);
        return;
    }

    const activeTab = activeScriptEditorTab();

    if (
        activeTab
        && !activeTab.dirty
        && !activeTab.fileHandle
        && scriptEditorBaseName(activeTab.fileName) === "Untitled.R"
        && !String(activeTab.model?.getValue?.() || "").trim()
    ) {
        state.scriptEditor.ignoreChanges = true;
        activeTab.model?.setValue?.(normalizeCommandText(text || ""));
        state.scriptEditor.ignoreChanges = false;
        activeTab.fileName = fileName;
        activeTab.fileHandle = fileHandle;
        activeTab.dirty = false;
        activeTab.savedContent = normalizeCommandText(text || "");
        syncActiveScriptEditorTab();
        updateScriptEditorChrome();
        persistScriptEditorSession();
        state.scriptEditor.editor?.focus?.();
        return;
    }

    createScriptEditorTab(fileName, text, false, fileHandle);
    updateScriptEditorChrome();
    persistScriptEditorSession();
    state.scriptEditor.editor?.focus?.();
};

const openScriptEditorLocalFile = async function() {
    if ("showOpenFilePicker" in window) {
        try {
            const handles = await window.showOpenFilePicker({
                multiple: false,
                ...scriptEditorFilePickerOptions
            });
            const fileHandle = handles[0] || null;
            const file = fileHandle ? await fileHandle.getFile() : null;

            if (file) {
                await openScriptEditorWithFile(file, fileHandle);
            }
            return;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            return;
        }
    }

    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".R,.r,.q,.s,.txt,text/plain,text/x-r-source";
    input.addEventListener("change", () => {
        const file = input.files?.[0];

        if (!file) {
            return;
        }

        openScriptEditorWithFile(file).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    }, { once: true });
    input.click();
};

const scriptEditorWordAtCursor = function() {
    const editor = state.scriptEditor.editor;
    const model = state.scriptEditor.model;

    if (!editor || !model) {
        return "";
    }

    const selection = editor.getSelection?.();
    if (selection && !selection.isEmpty?.()) {
        return model.getValueInRange(selection).trim();
    }

    const position = editor.getPosition?.();
    const word = position ? model.getWordAtPosition(position) : null;

    return String(word?.word || "").trim();
};

const openScriptEditorHelp = function() {
    const topic = scriptEditorWordAtCursor();

    if (!topic) {
        return;
    }

    openHelpTopicModal(topic).catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
};

const createScriptEditorButton = function(label, iconClass, action, options = {}) {
    const button = document.createElement("button");
    const icon = document.createElement("span");

    button.type = "button";
    button.className = `dm-script-btn${options.iconOnly ? " icon-only" : ""}${options.extraClass ? ` ${options.extraClass}` : ""}`;
    button.dataset.scriptAction = options.action || "";
    button.setAttribute("data-tooltip", options.tooltip || label);
    button.setAttribute("aria-label", options.tooltip || label);
    icon.className = `codicon ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);

    if (!options.iconOnly) {
        const text = document.createElement("span");

        text.textContent = label;
        button.appendChild(text);
    }

    button.addEventListener("click", action);

    return button;
};

const createScriptEditorDivider = function() {
    const divider = document.createElement("span");

    divider.className = "dm-divider";
    divider.setAttribute("aria-hidden", "true");

    return divider;
};

const createScriptEditorContent = function() {
    const root = document.createElement("div");
    const toolbar = document.createElement("div");
    const tabs = document.createElement("div");
    const tab = document.createElement("button");
    const tabLabel = document.createElement("span");
    const pathBar = document.createElement("div");
    const editorHost = document.createElement("div");
    const input = document.createElement("input");

    root.className = "web-script-editor";
    toolbar.className = "dm-script-toolbar";
    toolbar.append(
        createScriptEditorButton("New", "codicon-add", () => {
            createScriptEditorTab("Untitled.R", "", false);
            updateScriptEditorChrome();
            state.scriptEditor.editor?.focus?.();
        }, { tooltip: "New File", extraClass: "dm-script-btn-new" }),
        createScriptEditorButton("Open", "codicon-folder-opened", openScriptEditorLocalFile, { tooltip: "Open File" }),
        createScriptEditorDivider(),
        createScriptEditorButton("Run", "codicon-debug-start", () => {
            runScriptEditorCode().catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        }, { tooltip: "Run Script" }),
        createScriptEditorButton("", "codicon-question", openScriptEditorHelp, { tooltip: "Help for Selection", iconOnly: true }),
        createScriptEditorDivider(),
        createScriptEditorButton("", "codicon-save", () => {
            saveScriptEditorToLocalFile(false).catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                }
            });
        }, { tooltip: "Save", iconOnly: true }),
        createScriptEditorButton("", "codicon-save-as", () => {
            saveScriptEditorToLocalFile(true).catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                }
            });
        }, { tooltip: "Save As", iconOnly: true })
    );
    tabs.className = "dm-script-tabs";
    tab.type = "button";
    tab.className = "dm-script-tab active";
    tabLabel.className = "dm-script-tab-label";
    tabLabel.textContent = "Untitled.R";
    tab.appendChild(tabLabel);
    tabs.appendChild(tab);
    pathBar.className = "dm-script-pathbar";
    pathBar.textContent = "Untitled.R";
    editorHost.className = "web-script-editor__monaco";
    editorHost.id = "webScriptEditorMonaco";
    input.type = "file";
    input.hidden = true;
    root.append(toolbar, tabs, pathBar, editorHost, input);

    return {
        root,
        editorHost
    };
};

const openScriptEditorModal = async function(initialCode = "") {
    if (state.scriptEditor.layer?.isConnected) {
        if (initialCode) {
            insertScriptEditorCode(initialCode);
        }
        state.scriptEditor.editor?.focus?.();
        return;
    }

    const layer = document.createElement("div");
    const shell = document.createElement("section");
    const titlebar = document.createElement("div");
    const titleNode = document.createElement("div");
    const close = document.createElement("button");
    const rightHandle = document.createElement("span");
    const bottomHandle = document.createElement("span");
    const cornerHandle = document.createElement("span");
    const content = createScriptEditorContent();

    layer.className = "dialogforge-web-dialog-layer dialogforge-web-script-editor-layer";
    layer.dataset.surfaceId = "scriptEditor";
    shell.className = "dialogforge-web-dialog dialogforge-web-script-editor-window";
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", "Script editor");
    titlebar.className = "dialogforge-web-dialog__titlebar";
    titleNode.className = "dialogforge-web-dialog__title";
    titleNode.textContent = "Untitled.R - Script editor";
    close.className = "dialogforge-web-dialog__close";
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Close");
    rightHandle.className = "web-workbench-resize-handle";
    rightHandle.dataset.resizeDirection = "right";
    bottomHandle.className = "web-workbench-resize-handle";
    bottomHandle.dataset.resizeDirection = "bottom";
    cornerHandle.className = "web-workbench-resize-handle";
    cornerHandle.dataset.resizeDirection = "corner";
    close.addEventListener("click", () => {
        resolveScriptEditorWindowForClose().then((resolved) => {
            if (!resolved) {
                return;
            }

            persistScriptEditorSession();
            state.scriptEditor.editor?.dispose?.();
            state.scriptEditor.tabs.forEach((tab) => {
                tab.model?.dispose?.();
            });
            state.scriptEditor.layer = null;
            state.scriptEditor.editor = null;
            state.scriptEditor.model = null;
            state.scriptEditor.dirty = false;
            state.scriptEditor.fileHandle = null;
            state.scriptEditor.tabs = [];
            state.scriptEditor.activeTabId = "";
            layer.remove();
        }).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    titlebar.append(titleNode, close);
    shell.append(titlebar, content.root, rightHandle, bottomHandle, cornerHandle);
    layer.appendChild(shell);
    document.body.appendChild(layer);
    state.scriptEditor.layer = layer;
    state.scriptEditor.fileName = "Untitled.R";
    state.scriptEditor.fileHandle = null;
    state.scriptEditor.dirty = false;
    state.scriptEditor.tabs = [];
    state.scriptEditor.activeTabId = "";
    installDraggableModal(shell, titlebar, {
        mode: "fixed",
        storageKey: "scriptEditor"
    });
    installResizableWindow(shell, [rightHandle, bottomHandle, cornerHandle]);

    const syntax = await import("/browser-esm/shared/console/consoleSyntax.js");
    const monaco = await syntax.ensureConsoleSyntaxReady();

    state.scriptEditor.monaco = monaco;
    state.scriptEditor.editor = monaco.editor.create(content.editorHost, {
        model: null,
        language: "r",
        editContext: false,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        renderWhitespace: "selection",
        tabSize: 2,
        insertSpaces: true,
        fontFamily: "'Dialog Mono', Menlo, Monaco, Consolas, monospace",
        fontSize: 14,
        lineHeight: 22,
        theme: syntax.CONSOLE_THEME_NAME || "app-console"
    });
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
            runScriptEditorCode().catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "error");
            });
        }
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
            saveScriptEditorToLocalFile(false).catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) {
                    appendTranscript(error instanceof Error ? error.message : String(error), "error");
                }
            });
        }
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
        () => {
            saveScriptEditorToLocalFile(true).catch((error) => {
                if (!(error instanceof DOMException && error.name === "AbortError")) {
                    appendTranscript(error instanceof Error ? error.message : String(error), "error");
                }
            });
        }
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO,
        () => {
            openScriptEditorLocalFile().catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "error");
            });
        }
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN,
        () => {
            createScriptEditorTab("Untitled.R", "", false);
            state.scriptEditor.editor?.focus?.();
        }
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyCode.F1,
        openScriptEditorHelp
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV,
        pasteScriptEditorClipboard
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyCode.Insert,
        pasteScriptEditorClipboard
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter,
        () => {
            runScriptEditorCode().catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "error");
            });
        }
    );
    state.scriptEditor.editor.addCommand(
        monaco.KeyCode.Enter,
        () => {
            state.scriptEditor.editor?.trigger?.("keyboard", "type", {
                text: "\n"
            });
        }
    );
    state.scriptEditor.editor.getDomNode?.()?.addEventListener("paste", (event) => {
        const text = String(event.clipboardData?.getData("text/plain") || "");

        if (!text) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        insertScriptEditorTextAtCursor(text);
    }, true);
    state.scriptEditor.editor.onDidScrollChange?.(() => {
        captureActiveScriptEditorScroll();
        scheduleScriptEditorSessionPersistence();
    });

    const restored = initialCode ? false : restoreScriptEditorSession();

    if (initialCode) {
        createScriptEditorTab("Untitled.R", initialCode, true);
    }
    else if (!restored) {
        createScriptEditorTab("Untitled.R", "", false);
    }
    updateScriptEditorChrome();
    state.scriptEditor.editor.focus();
};

const clampNumber = function(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
};

const isInteractiveDragTarget = function(target) {
    return target instanceof Element
        && Boolean(target.closest("button, input, textarea, select, a, iframe, [contenteditable='true']"));
};

const installDraggableModal = function(surface, handle, options = {}) {
    if (!surface || !handle) {
        return;
    }

    let drag = null;
    const storageKey = options.storageKey
        ? `dialogforge.web.modal.position.${options.storageKey}`
        : "";

    const readBounds = function() {
        if (options.boundsElement) {
            const rect = options.boundsElement.getBoundingClientRect();

            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        }

        return {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };
    };

    const readMode = function() {
        return options.mode || (
            window.getComputedStyle(surface).position === "fixed"
                ? "fixed"
                : "absolute"
        );
    };

    const applyPosition = function(left, top, width, height, mode = readMode()) {
        const bounds = readBounds();
        const maxLeft = Math.max(0, bounds.width - width);
        const maxTop = Math.max(0, bounds.height - height);
        const nextLeft = clampNumber(left, 0, maxLeft);
        const nextTop = clampNumber(top, 0, maxTop);

        surface.style.position = mode;
        surface.style.left = `${Math.round(nextLeft)}px`;
        surface.style.top = `${Math.round(nextTop)}px`;
        surface.style.transform = "none";

        return {
            left: nextLeft,
            top: nextTop
        };
    };

    const restorePosition = function() {
        if (!storageKey) {
            return;
        }

        try {
            const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");

            if (!saved || typeof saved !== "object") {
                return;
            }

            const rect = surface.getBoundingClientRect();
            const left = Number(saved.left);
            const top = Number(saved.top);

            if (!Number.isFinite(left) || !Number.isFinite(top)) {
                return;
            }

            applyPosition(left, top, rect.width, rect.height, String(saved.mode || readMode()));
        }
        catch {}
    };

    const savePosition = function(mode) {
        if (!storageKey) {
            return;
        }

        try {
            const bounds = readBounds();
            const rect = surface.getBoundingClientRect();
            const left = mode === "fixed"
                ? rect.left
                : rect.left - bounds.left;
            const top = mode === "fixed"
                ? rect.top
                : rect.top - bounds.top;

            window.localStorage.setItem(storageKey, JSON.stringify({
                mode,
                left: Math.round(left),
                top: Math.round(top)
            }));
        }
        catch {}
    };

    restorePosition();

    const beginDrag = function(event) {
        if (event.button !== 0 || isInteractiveDragTarget(event.target)) {
            return;
        }

        const bounds = readBounds();
        const rect = surface.getBoundingClientRect();
        const mode = readMode();
        const left = mode === "fixed"
            ? rect.left
            : rect.left - bounds.left;
        const top = mode === "fixed"
            ? rect.top
            : rect.top - bounds.top;

        surface.style.position = mode;
        surface.style.left = `${left}px`;
        surface.style.top = `${top}px`;
        surface.style.transform = "none";

        drag = {
            pointerId: event.pointerId,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            left,
            top,
            width: rect.width,
            height: rect.height
        };

        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const moveDrag = function(event) {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        const bounds = readBounds();
        const nextLeft = drag.left + event.clientX - drag.startX;
        const nextTop = drag.top + event.clientY - drag.startY;
        const maxLeft = Math.max(0, bounds.width - drag.width);
        const maxTop = Math.max(0, bounds.height - drag.height);

        surface.style.left = `${clampNumber(nextLeft, 0, maxLeft)}px`;
        surface.style.top = `${clampNumber(nextTop, 0, maxTop)}px`;
    };

    const endDrag = function(event) {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        handle.releasePointerCapture?.(event.pointerId);
        savePosition(drag.mode);
        drag = null;
    };

    handle.addEventListener("pointerdown", beginDrag);
    handle.addEventListener("pointermove", moveDrag);
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
};

const installWorkbenchDrag = function() {
    installDraggableModal(
        document.getElementById("webWorkbenchWindow"),
        document.querySelector("#webWorkbenchWindow .web-workbench-window__titlebar"),
        {
            boundsElement: document.getElementById("webDesktop"),
            mode: "absolute",
            storageKey: "workbench"
        }
    );
};

const cssPixelValue = function(value, fallback) {
    const numeric = Number.parseFloat(String(value || ""));

    return Number.isFinite(numeric) && numeric > 0
        ? numeric
        : fallback;
};

const installResizableWindow = function(surface, handles, options = {}) {
    if (!surface || !handles?.length) {
        return;
    }

    let resize = null;

    const readBounds = function() {
        const boundsElement = options.boundsElement;

        if (boundsElement) {
            const rect = boundsElement.getBoundingClientRect();

            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        }

        return {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };
    };

    const beginResize = function(event) {
        if (event.button !== 0) {
            return;
        }

        const handle = event.currentTarget;
        const bounds = readBounds();
        const rect = surface.getBoundingClientRect();
        const styles = window.getComputedStyle(surface);

        resize = {
            pointerId: event.pointerId,
            direction: String(handle.dataset.resizeDirection || "corner"),
            startX: event.clientX,
            startY: event.clientY,
            width: rect.width,
            height: rect.height,
            left: rect.left - bounds.left,
            top: rect.top - bounds.top,
            minWidth: cssPixelValue(styles.minWidth, 480),
            minHeight: cssPixelValue(styles.minHeight, 320),
            maxWidth: Math.max(1, bounds.width - Math.max(0, rect.left - bounds.left)),
            maxHeight: Math.max(1, bounds.height - Math.max(0, rect.top - bounds.top))
        };

        surface.style.width = `${Math.round(rect.width)}px`;
        surface.style.height = `${Math.round(rect.height)}px`;
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const moveResize = function(event) {
        if (!resize || event.pointerId !== resize.pointerId) {
            return;
        }

        const direction = resize.direction;
        const deltaX = event.clientX - resize.startX;
        const deltaY = event.clientY - resize.startY;
        const nextWidth = direction === "right" || direction === "corner"
            ? clampNumber(resize.width + deltaX, resize.minWidth, resize.maxWidth)
            : resize.width;
        const nextHeight = direction === "bottom" || direction === "corner"
            ? clampNumber(resize.height + deltaY, resize.minHeight, resize.maxHeight)
            : resize.height;

        surface.style.width = `${Math.round(nextWidth)}px`;
        surface.style.height = `${Math.round(nextHeight)}px`;
    };

    const endResize = function(event) {
        if (!resize || event.pointerId !== resize.pointerId) {
            return;
        }

        event.currentTarget.releasePointerCapture?.(event.pointerId);
        resize = null;
    };

    handles.forEach((handle) => {
        handle.addEventListener("pointerdown", beginResize);
        handle.addEventListener("pointermove", moveResize);
        handle.addEventListener("pointerup", endResize);
        handle.addEventListener("pointercancel", endResize);
    });
};

const installWorkbenchResize = function() {
    installResizableWindow(
        document.getElementById("webWorkbenchWindow"),
        Array.from(document.querySelectorAll("#webWorkbenchWindow .web-workbench-resize-handle")),
        {
            boundsElement: document.getElementById("webDesktop")
        }
    );
};

const loadCommandPreviewColorizer = async function() {
    if (!state.commandPreviewColorizer) {
        state.commandPreviewColorizer = import("/browser-esm/shared/console/consoleSyntax.js")
            .then((module) => module.colorizeConsoleRCodeInto);
    }

    return state.commandPreviewColorizer;
};

const getCommandPaneElements = function() {
    return {
        root: document.documentElement,
        body: document.body,
        container: document.querySelector(".web-console"),
        pane: document.getElementById("commandPane"),
        command: document.getElementById("command")
    };
};

const setCommandPaneSizeMode = function(mode) {
    state.commandPaneSizeMode = mode === "manual" ? "manual" : "auto";
    document.documentElement.dataset.commandPaneSizeMode = state.commandPaneSizeMode;
};

const isCommandPaneManualSized = function() {
    return state.commandPaneSizeMode === "manual"
        || String(document.documentElement.dataset.commandPaneSizeMode || "") === "manual";
};

const clampCommandPaneHeight = function(value) {
    const { command, container } = getCommandPaneElements();
    const commandStyle = command ? getComputedStyle(command) : null;
    const minByCss = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--main-command-min-height")
            || getComputedStyle(container || document.body).getPropertyValue("--main-command-min-height")
            || "56"
    ) || 56;
    const min = Math.max(40, Math.round(minByCss));
    const max = Math.max(
        min,
        Math.round(((container?.getBoundingClientRect?.().height || window.innerHeight || 800) * 0.55))
    );
    const lineHeight = parseFloat(commandStyle?.lineHeight || "") || 20;
    const padTop = parseFloat(commandStyle?.paddingTop || "0") || 0;
    const padBottom = parseFloat(commandStyle?.paddingBottom || "0") || 0;
    const fallback = Math.ceil(lineHeight + padTop + padBottom);

    return Math.max(min, Math.min(max, Math.ceil(Number(value) || fallback)));
};

const setCommandPaneHeightPx = function(value) {
    const { container, pane } = getCommandPaneElements();
    const next = clampCommandPaneHeight(value);

    container?.style.setProperty("--main-command-height", `${next}px`);
    if (pane) {
        pane.style.flexBasis = `${next}px`;
        pane.style.height = `${next}px`;
    }
};

const measureCommandPaneContentHeight = function() {
    const { command } = getCommandPaneElements();

    if (!command) {
        return 80;
    }

    const styles = getComputedStyle(command);
    const probe = document.createElement("div");

    probe.style.position = "absolute";
    probe.style.left = "-100000px";
    probe.style.top = "0";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    probe.style.boxSizing = styles.boxSizing;
    probe.style.width = `${Math.max(1, Math.ceil(command.getBoundingClientRect().width || 1))}px`;
    probe.style.paddingTop = styles.paddingTop;
    probe.style.paddingRight = styles.paddingRight;
    probe.style.paddingBottom = styles.paddingBottom;
    probe.style.paddingLeft = styles.paddingLeft;
    probe.style.borderTop = styles.borderTop;
    probe.style.borderRight = styles.borderRight;
    probe.style.borderBottom = styles.borderBottom;
    probe.style.borderLeft = styles.borderLeft;
    probe.style.whiteSpace = styles.whiteSpace;
    probe.style.wordBreak = styles.wordBreak;
    probe.style.overflowWrap = styles.overflowWrap;
    probe.style.fontFamily = styles.fontFamily;
    probe.style.fontSize = styles.fontSize;
    probe.style.lineHeight = styles.lineHeight;
    probe.style.letterSpacing = styles.letterSpacing;
    probe.style.fontWeight = styles.fontWeight;
    probe.style.fontStyle = styles.fontStyle;
    probe.style.minHeight = "0";
    probe.style.height = "auto";
    probe.innerHTML = command.innerHTML || "";

    document.body.appendChild(probe);
    const measured = Math.ceil(probe.getBoundingClientRect().height);
    probe.remove();

    return clampCommandPaneHeight(measured);
};

const syncCommandPaneAutoHeight = function() {
    if (!state.commandPaneVisible || isCommandPaneManualSized()) {
        return;
    }

    setCommandPaneHeightPx(measureCommandPaneContentHeight());
};

const queueCommandPaneAutoHeightSync = function() {
    if (!state.commandPaneVisible || isCommandPaneManualSized()) {
        return;
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(syncCommandPaneAutoHeight);
    });
};

const setCommandPaneVisible = function(visible) {
    if (visible) {
        document.body.classList.remove("command-pane-hidden");
    }
    else {
        document.body.classList.add("command-pane-hidden");
        setCommandPaneSizeMode("auto");
    }

    state.commandPaneVisible = Boolean(visible);
};

const updateCommandPane = async function(text) {
    const target = document.getElementById("command");
    const value = normalizeConstructedCommandText(text);

    state.commandPreviewText = value;
    if (!value.trim()) {
        state.commandPreviewDialogId = "";
    }

    if (!target) {
        return;
    }

    if (!value.trim()) {
        target.textContent = "";
        setCommandPaneVisible(false);
        return;
    }

    setCommandPaneVisible(true);

    try {
        const colorize = await loadCommandPreviewColorizer();

        colorize(target, value);
    }
    catch {
        target.textContent = value;
    }

    if (!isCommandPaneManualSized()) {
        syncCommandPaneAutoHeight();
        queueCommandPaneAutoHeightSync();
    }
};

const copyCommandPreviewToConsole = function() {
    const value = state.commandPreviewText || "";

    if (!value.trim()) {
        return;
    }

    state.console?.coordinator?.setText?.(value);
    state.console?.coordinator?.focus?.();
};

const sendCommandPreviewToScriptEditor = function() {
    openScriptEditorModal(state.commandPreviewText || "").catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
};

const installCommandPaneActions = function() {
    document.getElementById("commandPreviewToConsole")?.addEventListener("click", copyCommandPreviewToConsole);
    document.getElementById("commandPreviewToScriptEditor")?.addEventListener("click", sendCommandPreviewToScriptEditor);
};

const installCommandPaneResize = function() {
    const container = document.querySelector(".web-console");
    const commandPane = document.getElementById("commandPane");
    const splitter = document.getElementById("mainSplitter");

    if (!container || !commandPane || !splitter) {
        return;
    }

    let drag = null;
    const minTop = 120;
    const minBottom = 180;

    const setTop = function(value) {
        const bounds = container.getBoundingClientRect();
        const top = clampNumber(value, minTop, Math.max(minTop, bounds.height - minBottom));

        setCommandPaneSizeMode("manual");
        container.style.setProperty("--main-command-height", `${Math.round(top)}px`);
        commandPane.style.height = `${Math.round(top)}px`;
        commandPane.style.flexBasis = `${Math.round(top)}px`;
    };

    splitter.addEventListener("pointerdown", (event) => {
        const bounds = container.getBoundingClientRect();
        const commandBounds = commandPane.getBoundingClientRect();

        drag = {
            pointerId: event.pointerId,
            top: commandBounds.height,
            startY: event.clientY,
            maxTop: Math.max(minTop, bounds.height - minBottom)
        };
        splitter.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    splitter.addEventListener("pointermove", (event) => {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        setTop(clampNumber(drag.top + event.clientY - drag.startY, minTop, drag.maxTop));
    });

    const endDrag = function(event) {
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        splitter.releasePointerCapture?.(event.pointerId);
        drag = null;
    };

    splitter.addEventListener("pointerup", endDrag);
    splitter.addEventListener("pointercancel", endDrag);
};

const updateWorkspacePaneToggle = function(collapsed) {
    const button = document.getElementById("workspacePaneToggle");
    const icon = button?.querySelector(".codicon");
    const label = collapsed ? "Show Workspace" : "Hide Workspace";

    if (button) {
        button.dataset.tooltip = label;
        button.setAttribute("aria-label", label);
    }

    if (icon) {
        icon.classList.toggle("codicon-chevron-left", !collapsed);
        icon.classList.toggle("codicon-chevron-right", collapsed);
    }
};

const readPaneWidth = function(element, fallback) {
    const width = Number(element?.getBoundingClientRect?.().width || 0);

    return Number.isFinite(width) && width > 0
        ? width
        : fallback;
};

const resizeWorkbenchForWorkspace = function(openWorkspace) {
    const desktop = document.getElementById("webDesktop");
    const workbench = document.getElementById("webWorkbenchWindow");
    const workbenchBody = workbench?.querySelector(".web-workbench-window__body");
    const consolePane = document.querySelector(".web-console");
    const workspacePane = document.querySelector(".web-workspace");

    if (!desktop || !workbench || !workbenchBody || !consolePane || !workspacePane) {
        document.body.classList.toggle("web-workspace-collapsed", !openWorkspace);
        updateWorkspacePaneToggle(!openWorkspace);
        return;
    }

    const desktopRect = desktop.getBoundingClientRect();
    const workbenchRect = workbench.getBoundingClientRect();
    const workbenchBodyRect = workbenchBody.getBoundingClientRect();
    const workbenchChromeWidth = Math.max(0, workbenchRect.width - workbenchBodyRect.width);
    const workspaceWidth = openWorkspace
        ? state.workspacePaneWidth
        : readPaneWidth(workspacePane, state.workspacePaneWidth);
    const consoleWidth = readPaneWidth(consolePane, state.consolePaneWidth || 0);
    const relativeLeft = workbenchRect.left - desktopRect.left;

    if (!openWorkspace) {
        state.workspacePaneWidth = workspaceWidth;
        state.consolePaneWidth = consoleWidth;
        workbench.style.width = `${Math.max(consoleWidth + workbenchChromeWidth, workbenchRect.width - workspaceWidth)}px`;
        document.body.classList.add("web-workspace-collapsed");
        updateWorkspacePaneToggle(true);
        return;
    }

    const targetConsoleWidth = state.consolePaneWidth || consoleWidth;
    const targetWidth = targetConsoleWidth + workspaceWidth + workbenchChromeWidth;
    const clampedWidth = Math.min(targetWidth, desktopRect.width);
    const clampedLeft = clampNumber(relativeLeft, 0, Math.max(0, desktopRect.width - clampedWidth));

    workbench.style.left = `${clampedLeft}px`;
    workbench.style.width = `${clampedWidth}px`;
    document.body.classList.remove("web-workspace-collapsed");
    updateWorkspacePaneToggle(false);
};

const toggleWorkspacePane = function() {
    const collapsed = document.body.classList.contains("web-workspace-collapsed");

    resizeWorkbenchForWorkspace(collapsed);
};

const readWebRMessageText = function(message) {
    const data = message?.data;

    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(String).join("\n");
    }

    if (data && typeof data === "object") {
        if (typeof data.message === "string") {
            return data.message;
        }

        if (typeof data.text === "string") {
            return data.text;
        }
    }

    return "";
};

const readWebRMessageStreamName = function(message) {
    const type = String(message?.type || "").toLowerCase();

    return type.includes("stderr") || type.includes("error") || type.includes("warning")
        ? "stderr"
        : "stdout";
};

const recordInstallProgressMessage = function(consoleTranscript, activityId, message) {
    const text = readWebRMessageText(message);

    if (!text.trim()) {
        return;
    }

    consoleTranscript?.recordRuntimeMessageStream?.({
        id: `${activityId}_install_progress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        parent_id: activityId,
        name: readWebRMessageStreamName(message),
        text
    });
};

const collectInstallProgress = async function(runtime, consoleTranscript, activityId, done) {
    if (typeof runtime?.read !== "function") {
        return;
    }

    while (!done.finished) {
        const message = await Promise.race([
            runtime.read(),
            new Promise((resolve) => {
                setTimeout(() => resolve(null), 100);
            })
        ]);

        if (message) {
            recordInstallProgressMessage(consoleTranscript, activityId, message);
        }
    }

    if (typeof runtime.flush === "function") {
        for (const message of await runtime.flush()) {
            recordInstallProgressMessage(consoleTranscript, activityId, message);
        }
    }
};

const flushWebROutputQueue = async function(runtime) {
    if (typeof runtime?.flush !== "function") {
        return;
    }

    try {
        await runtime.flush();
    }
    catch {}
};

const safeBrowserImportFileName = function(name) {
    const value = String(name || "imported-data")
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .replace(/^_+|_+$/g, "");

    return value || "imported-data";
};

const ensureWebRDirectory = async function(runtime, directory) {
    const parts = String(directory || "")
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
    let current = "";

    for (const part of parts) {
        current += `/${part}`;
        try {
            await runtime.FS.mkdir(current);
        }
        catch {}
    }
};

const writeBrowserImportFile = async function(file, virtualPath) {
    const runtime = await ensureRuntime();
    const bytes = new Uint8Array(await file.arrayBuffer());

    await ensureWebRDirectory(runtime, state.workingDirectoryPath);
    await runtime.FS.writeFile(virtualPath, bytes);
};

const selectBrowserImportFile = function() {
    return new Promise((resolve) => {
        const input = document.createElement("input");

        input.type = "file";
        input.accept = ".csv,.txt,.tsv,.tab,.dat,.rds,.rda,.rdata,.sav,.zsav,.por,.dta,.sas7bdat,.xpt,.xls,.xlsx";
        input.style.position = "fixed";
        input.style.left = "-10000px";
        input.style.top = "0";
        input.addEventListener("change", async () => {
            const file = input.files && input.files[0];

            input.remove();
            if (!file) {
                resolve({
                    ok: false,
                    canceled: true,
                    filePath: ""
                });
                return;
            }

            const safeName = safeBrowserImportFileName(file.name);
            const virtualPath = `${state.workingDirectoryPath}/${safeName}`;

            try {
                state.importFileSequence += 1;
                state.importFiles.set(virtualPath, {
                    file,
                    virtualPath,
                    name: safeName,
                    sequence: state.importFileSequence,
                    selectedAt: Date.now()
                });
                resolve({
                    ok: true,
                    canceled: false,
                    filePath: virtualPath,
                    name: safeName,
                    size: file.size,
                    type: file.type || ""
                });
            }
            catch (error) {
                resolve({
                    ok: false,
                    canceled: false,
                    filePath: "",
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        }, { once: true });
        input.addEventListener("cancel", () => {
            input.remove();
            resolve({
                ok: false,
                canceled: true,
                filePath: ""
            });
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    });
};

const stageBrowserImportFile = function(payload) {
    const data = payload?.data;
    const file = payload?.file instanceof File
        ? payload.file
        : data instanceof ArrayBuffer
            ? new File([data], safeBrowserImportFileName(payload?.name || "import-file"), {
                type: String(payload?.type || "")
            })
            : null;

    if (!file) {
        return {
            ok: false,
            canceled: false,
            filePath: "",
            message: "Selected file was not available to the browser host."
        };
    }

    const safeName = safeBrowserImportFileName(file.name || payload.name || "import-file");
    const requestedPath = String(payload?.virtualPath || "");
    const virtualPath = requestedPath.startsWith(`${state.workingDirectoryPath}/`)
        ? requestedPath
        : `${state.workingDirectoryPath}/${safeName}`;

    state.importFileSequence += 1;
    state.importFiles.set(virtualPath, {
        file,
        virtualPath,
        name: safeName,
        sequence: state.importFileSequence,
        selectedAt: Date.now()
    });

    return {
        ok: true,
        canceled: false,
        filePath: virtualPath,
        name: safeName,
        size: Number(file.size || payload?.size || 0),
        type: file.type || payload?.type || ""
    };
};

const readImportFileRecord = function(filePath) {
    const value = String(filePath || "");

    return state.importFiles.get(value)
        || state.importFiles.get(`${state.workingDirectoryPath}/${value}`)
        || null;
};

const splitDelimitedImportLine = function(line, separator, quote) {
    const cells = [];
    const sep = separator || ",";
    const quoteChar = quote || "\"";
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        const next = line[index + 1];

        if (quoteChar && character === quoteChar) {
            if (quoted && next === quoteChar) {
                current += quoteChar;
                index += 1;
                continue;
            }
            quoted = !quoted;
            continue;
        }

        if (!quoted && line.slice(index, index + sep.length) === sep) {
            cells.push(current);
            current = "";
            index += sep.length - 1;
            continue;
        }

        current += character;
    }

    cells.push(current);
    return cells;
};

const readRuntimeTabularImportPreview = async function(record, request, readDataFrameLines) {
    try {
        const runtime = await ensureRuntime();
        await writeBrowserImportFile(record.file, record.virtualPath);

        const command = [
            "local({",
            `  .file <- ${JSON.stringify(record.virtualPath)}`,
            `  .nrows <- ${JSON.stringify(Math.max(1, Number(request.nrows) || 8))}`,
            "  if (!requireNamespace(\"jsonlite\", quietly = TRUE)) stop(\"jsonlite is required to preview this file type.\")",
            ...readDataFrameLines,
            "  .rows <- utils::head(.df, .nrows)",
            "  .vdata <- lapply(.rows, function(.column) as.character(.column))",
            "  cat(jsonlite::toJSON(list(",
            "    status = \"ready\",",
            "    error = \"\",",
            "    colnames = names(.rows),",
            "    vdata = unname(.vdata)",
            "  ), auto_unbox = TRUE, null = \"null\", na = \"string\"))",
            "})"
        ].join("\n");
        const text = String(await captureHiddenRText(runtime, command) || "").trim();
        const parsed = JSON.parse(text);

        return {
            status: String(parsed.status || "ready"),
            error: String(parsed.error || ""),
            colnames: Array.isArray(parsed.colnames) ? parsed.colnames.map(String) : [],
            vdata: Array.isArray(parsed.vdata)
                ? parsed.vdata.map((column) => Array.isArray(column) ? column.map(String) : [])
                : []
        };
    }
    catch (error) {
        return {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            colnames: [],
            vdata: []
        };
    }
};

const readBrowserImportPreview = async function(payload) {
    const request = payload || {};
    const record = readImportFileRecord(request.file);

    if (!record) {
        return {
            status: "not-found",
            error: "Import source does not exist.",
            colnames: [],
            vdata: []
        };
    }

    if (request.binary || request.command === "convert") {
        return readRuntimeTabularImportPreview(record, request, [
            "  if (!requireNamespace(\"DDIwR\", quietly = TRUE)) stop(\"DDIwR is required to preview this file type.\")",
            "  .df <- as.data.frame(suppressWarnings(suppressMessages(DDIwR::convert(.file, n_max = .nrows))))"
        ]);
    }

    if (request.command === "readRDS") {
        return readRuntimeTabularImportPreview(record, request, [
            "  .object <- readRDS(.file)",
            "  .df <- as.data.frame(.object)"
        ]);
    }

    const text = await record.file.text();
    const separator = request.command === "read.delim" || request.sep === "\t"
        ? "\t"
        : request.sep === " "
            ? " "
            : request.sep || ",";
    const quote = String(request.quote ?? "\"");
    const comment = String(request["comment.char"] ?? "#");
    const lines = text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .slice(Math.max(0, Number(request.skip) || 0))
        .filter((line) => {
            return line.length > 0 && (!comment || !line.trim().startsWith(comment));
        });
    const nrows = Math.max(1, Number(request.nrows) || 8);
    const rows = lines.slice(0, nrows + 1).map((line) => {
        return splitDelimitedImportLine(line, separator, quote);
    });
    const header = request.header !== false;
    const colnames = header
        ? rows.shift() || []
        : (rows[0] || []).map((_, index) => `V${index + 1}`);
    const vdata = colnames.map((_, columnIndex) => {
        return rows.slice(0, nrows).map((row) => {
            return row[columnIndex] ?? "";
        });
    });

    return {
        status: "ready",
        error: "",
        colnames,
        vdata
    };
};

const restoreBrowserImportFilesToWebR = async function() {
    for (const record of state.importFiles.values()) {
        await writeBrowserImportFile(record.file, record.virtualPath);
    }
};

const setRuntimeStatus = function(_text) {
    state.console?.toolbar?.render?.();
};

const notifyConsoleSession = function() {
    try {
        state.console?.session?.notifySessionPhase?.();
        state.console?.toolbar?.render?.();
    }
    catch {}
};

const runtimeSnapshot = function(status, message = "") {
    return {
        providerId: "webr",
        status,
        connection: "browser",
        message
    };
};

const loadComposition = async function() {
    const response = await fetch("/api/composition");

    if (response.ok) {
        state.composition = await response.json();
        return;
    }

    const manifestResponse = await fetch("/shared/shell-web/build/dialogr-web-manifest.json");

    if (!manifestResponse.ok) {
        throw new Error(await response.text());
    }

    state.composition = await manifestResponse.json();
};

const findProductDialog = function(dialogId) {
    return (state.composition?.productDialogs || []).find((dialog) => {
        return dialog.id === dialogId;
    }) || null;
};

const findSharedDialog = function(dialogId) {
    return (state.composition?.sharedDialogs || []).find((dialog) => {
        return dialog.id === dialogId;
    }) || null;
};

const closeMenus = function() {
    elements.menuBar?.querySelectorAll(".is-open").forEach((node) => {
        node.classList.remove("is-open");
    });
};

const isMenuActionSupported = function(item) {
    return item.type === "product-dialog"
        || item.type === "shared-dialog"
        || item.type === "product-command"
        || (
            item.type === "shell-command"
            && (
                item.command === "dataset.goToCase"
                || item.command === "dataset.goToVariable"
                || item.command === "script.open"
                || item.command === "scriptEditor.open"
                || item.command === "scripts.open"
                || item.command === "script.focusEditor"
                || item.command === "script.openFile"
                || item.command === "base-app:openScriptEditor"
                || item.command === "base-app:openScriptFile"
                || item.command === "dataset.openActive"
                || item.command === "plot.open"
                || item.command === "plotViewer.open"
                || item.command === "plots.open"
            )
        );
};

const executeMenuItem = async function(item) {
    closeMenus();

    if (item.type === "product-dialog") {
        const dialog = item.target || findProductDialog(item.dialog || "");

        if (dialog) {
            openDialog(dialog);
        }
        return;
    }

    if (item.type === "shared-dialog") {
        const dialog = item.target || findSharedDialog(item.dialog || "");

        if (dialog) {
            openDialog(dialog);
        }
        return;
    }

    if (item.type === "product-command" && Array.isArray(item.rPackages) && item.rPackages.length) {
        await executeVisibleCommand(`install.packages(c(${item.rPackages.map(JSON.stringify).join(", ")}))`);
        return;
    }

    if (
        item.type === "shell-command"
        && (
            item.command === "script.open"
            || item.command === "scriptEditor.open"
            || item.command === "scripts.open"
            || item.command === "script.focusEditor"
            || item.command === "script.openFile"
            || item.command === "base-app:openScriptEditor"
            || item.command === "base-app:openScriptFile"
        )
    ) {
        await openScriptEditorModal();
        if (item.command === "script.openFile" || item.command === "base-app:openScriptFile") {
            openScriptEditorLocalFile();
        }
        return;
    }

    if (item.type === "shell-command" && item.command === "dataset.openActive") {
        await openDataEditorModal(state.activeDatasetName);
        return;
    }

    if (
        item.type === "shell-command"
        && (
            item.command === "plot.open"
            || item.command === "plotViewer.open"
            || item.command === "plots.open"
        )
    ) {
        openPlotViewerModal();
        return;
    }

    if (
        item.type === "shell-command"
        && (
            item.command === "dataset.goToCase"
            || item.command === "dataset.goToVariable"
        )
    ) {
        const dialog = findProductDialog("goto");

        if (dialog) {
            openDialog(dialog);
        }
        return;
    }

};

const createMenuItemButton = function(item, hasChildren) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "web-menu-item";
    button.textContent = item.label || item.id || "Menu item";
    button.disabled = !hasChildren && (!item.enabled || !isMenuActionSupported(item));

    if (!item.enabled && item.reason) {
        button.title = item.reason;
    }

    if (hasChildren) {
        const arrow = document.createElement("span");

        arrow.className = "web-menu-item__arrow";
        arrow.textContent = "\u203a";
        button.appendChild(arrow);
    }
    else {
        button.addEventListener("click", () => {
            executeMenuItem(item).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        });
    }

    return button;
};

const createMenuSeparator = function(item) {
    const separator = document.createElement("div");

    separator.className = "web-menu-separator";
    separator.setAttribute("role", "separator");
    separator.setAttribute("aria-hidden", "true");
    if (item?.id) {
        separator.dataset.menuSeparator = String(item.id);
    }

    return separator;
};

const renderMenuItems = function(items, parent) {
    for (const item of items || []) {
        if (item?.type === "separator") {
            parent.appendChild(createMenuSeparator(item));
            continue;
        }

        const children = Array.isArray(item.items)
            ? item.items
            : [];
        const hasChildren = children.some((child) => child?.type !== "separator");
        const container = document.createElement("div");
        const button = createMenuItemButton(item, hasChildren);

        container.className = hasChildren ? "web-menu-submenu" : "web-menu-command";
        container.appendChild(button);

        if (hasChildren) {
            const popup = document.createElement("div");

            popup.className = "web-menu-popup";
            popup.setAttribute("role", "menu");
            renderMenuItems(children, popup);
            container.appendChild(popup);
            container.addEventListener("mouseenter", () => {
                Array.from(container.parentElement?.children || []).forEach((sibling) => {
                    if (sibling !== container) {
                        sibling.classList.remove("is-open");
                    }
                });
                container.classList.add("is-open");
            });
        }

        parent.appendChild(container);
    }
};

const closeCapturedImages = function(images) {
    for (const image of Array.isArray(images) ? images : []) {
        try {
            image?.close?.();
        }
        catch {}
    }
};

const renderMenu = function(menu) {
    elements.menuBar.replaceChildren();

    for (const item of menu || []) {
        const root = document.createElement("div");
        const button = document.createElement("button");
        const popup = document.createElement("div");

        root.className = "web-menu-root";
        button.type = "button";
        button.className = "web-menu-button";
        button.textContent = item.label || item.id || "Menu";
        button.setAttribute("aria-haspopup", "menu");
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const open = root.classList.contains("is-open");

            closeMenus();
            if (!open) {
                root.classList.add("is-open");
            }
        });
        popup.className = "web-menu-popup";
        popup.setAttribute("role", "menu");
        renderMenuItems(item.items || [], popup);
        root.appendChild(button);
        root.appendChild(popup);
        elements.menuBar.appendChild(root);
    }
};

const renderComposition = function() {
    const composition = state.composition;

    document.title = `${composition.product.name} Web`;
    renderMenu(composition.menu || []);
    renderWorkspacePane();

    state.console?.toolbar?.render?.();
};

const fetchJsonIfAvailable = async function(url) {
    const response = await fetch(url);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
};

const decompressGzip = async function(buffer) {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("This browser cannot decompress WebR package-library bundles.");
    }

    const stream = new Blob([buffer]).stream().pipeThrough(
        new DecompressionStream("gzip")
    );
    const response = new Response(stream);

    return response.blob();
};

const mountProductPackageLibrary = async function(runtime) {
    const manifest = await fetchJsonIfAvailable("/api/webr-package-library");

    if (!manifest?.available) {
        return {
            mounted: false
        };
    }

    const metadataResponse = await fetch(manifest.metadataUrl);
    const dataResponse = await fetch(manifest.dataUrl);

    if (!metadataResponse.ok || !dataResponse.ok) {
        throw new Error("Product WebR package library bundle could not be loaded.");
    }

    const metadata = await metadataResponse.json();
    const compressed = await dataResponse.arrayBuffer();
    const blob = await decompressGzip(compressed);
    const mountpoint = String(manifest.mountpoint || "/dialogr-library");

    try {
        await runtime.FS.unmount(mountpoint);
    }
    catch {}

    try {
        await runtime.FS.mkdir(mountpoint);
    }
    catch {}

    await runtime.FS.mount("WORKERFS", {
        packages: [
            {
                metadata,
                blob
            }
        ]
    }, mountpoint);
    await runtime.evalRVoid(`.libPaths(unique(c(${JSON.stringify(mountpoint)}, .libPaths())))`);

    return {
        mounted: true,
        mountpoint
    };
};

const ensureRuntime = async function() {
    if (state.runtimeReady) {
        return state.runtime;
    }

    if (state.runtimeStartPromise) {
        return state.runtimeStartPromise;
    }

    state.runtimeStarting = true;
    notifyConsoleSession();
    setRuntimeStatus("Starting WebR...");

    state.runtimeStartPromise = (async function() {
        const module = await import("/webr/webr.js");
        const runtime = new module.WebR({
            baseUrl: "/webr/"
        });

        state.loadedRuntimePackages.clear();
        await runtime.init();
        await flushWebROutputQueue(runtime);
        await mountProductPackageLibrary(runtime);
        await ensureWebRDirectory(runtime, state.workingDirectoryPath);
        await runtime.evalRVoid(`setwd(${JSON.stringify(state.workingDirectoryPath)})`);
        await runtime.evalRVoid("webr::shim_install()");
        await flushWebROutputQueue(runtime);
        state.runtime = runtime;
        state.runtimeReady = true;
        state.activeDatasetName = "";
        await refreshWebRWorkspacePane();
        setRuntimeStatus("WebR ready");
        prewarmPlotInfrastructure(runtime);

        return runtime;
    })();

    try {
        return await state.runtimeStartPromise;
    }
    finally {
        state.runtimeStartPromise = null;
        state.runtimeStarting = false;
        notifyConsoleSession();
    }
};

const likelyIncompleteFragment = function(code) {
    const text = normalizeCommandText(code);
    let parens = 0;
    let brackets = 0;
    let braces = 0;
    let quote = "";
    let escaped = false;

    for (const char of text) {
        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === "\\") {
            escaped = true;
            continue;
        }

        if (quote) {
            if (char === quote) {
                quote = "";
            }
            continue;
        }

        if (char === "\"" || char === "'") {
            quote = char;
            continue;
        }

        if (char === "(") parens += 1;
        else if (char === ")") parens -= 1;
        else if (char === "[") brackets += 1;
        else if (char === "]") brackets -= 1;
        else if (char === "{") braces += 1;
        else if (char === "}") braces -= 1;
    }

    return Boolean(quote || parens > 0 || brackets > 0 || braces > 0);
};

const checkCodeFragmentComplete = async function(code) {
    const text = normalizeCommandText(code);

    if (!text.trim()) {
        return "complete";
    }

    if (!state.runtimeReady) {
        return likelyIncompleteFragment(text) ? "incomplete" : "complete";
    }

    const runtime = await ensureRuntime();
    const result = await runtime.evalRString([
        "tryCatch({",
        `  parse(text = ${JSON.stringify(text)})`,
        "  \"complete\"",
        "}, error = function(e) {",
        "  message <- conditionMessage(e)",
        "  if (grepl(\"unexpected end|end of input\", message, ignore.case = TRUE)) \"incomplete\" else \"invalid\"",
        "})"
    ].join("\n"));
    const normalized = String(result || "").toLowerCase();

    if (
        normalized === "complete"
        || normalized === "incomplete"
        || normalized === "invalid"
    ) {
        return normalized;
    }

    return "unknown";
};

const buildVisibleRCommand = function(code) {
    return [
        ".DialogForgeWebConnection <- textConnection(",
        JSON.stringify(String(code || "")),
        ")",
        "tryCatch(",
        "  source(.DialogForgeWebConnection, local = .GlobalEnv, echo = FALSE, print.eval = TRUE),",
        "  finally = close(.DialogForgeWebConnection)",
        ")"
    ].join("\n");
};

const readConsoleOutputWidth = function() {
    const terminal = document.getElementById("consoleTerminal");
    const width = Number(terminal?.getBoundingClientRect?.().width || 0);

    if (!Number.isFinite(width) || width <= 0) {
        return 120;
    }

    return Math.max(80, Math.min(240, Math.floor(width / 8)));
};

const buildCapturedVisibleRCommand = function(code) {
    const width = readConsoleOutputWidth();

    return [
        "local({",
        "  .DialogForgeWebOldWidth <- getOption(\"width\")",
        `  options(width = ${width})`,
        "  on.exit(options(width = .DialogForgeWebOldWidth), add = TRUE)",
        `  .DialogForgeWebExpressions <- parse(text = ${JSON.stringify(String(code || ""))})`,
        "  for (.DialogForgeWebExpression in .DialogForgeWebExpressions) {",
        "    withCallingHandlers({",
        "      .DialogForgeWebValue <- withVisible(eval(.DialogForgeWebExpression, envir = .GlobalEnv))",
        "      if (isTRUE(.DialogForgeWebValue$visible)) {",
        "        print(.DialogForgeWebValue$value)",
        "      }",
        "    }, message = function(.DialogForgeWebMessage) {",
        "      cat(conditionMessage(.DialogForgeWebMessage), sep = \"\\n\")",
        "      invokeRestart(\"muffleMessage\")",
        "    }, warning = function(.DialogForgeWebWarning) {",
        "      cat(paste0(\"Warning: \", conditionMessage(.DialogForgeWebWarning)), \"\\n\", sep = \"\", file = stderr())",
        "      invokeRestart(\"muffleWarning\")",
        "    })",
        "  }",
        "  invisible(NULL)",
        "})"
    ].join("\n");
};

const buildCapturedTextRCommand = function(code) {
    const width = readConsoleOutputWidth();

    return [
        "local({",
        "  .DialogForgeWebOldWidth <- getOption(\"width\")",
        `  options(width = ${width})`,
        "  on.exit(options(width = .DialogForgeWebOldWidth), add = TRUE)",
        `  .DialogForgeWebExpressions <- parse(text = ${JSON.stringify(String(code || ""))})`,
        "  .DialogForgeWebOutput <- capture.output({",
        "    for (.DialogForgeWebExpression in .DialogForgeWebExpressions) {",
        "      withCallingHandlers({",
        "        .DialogForgeWebValue <- withVisible(eval(.DialogForgeWebExpression, envir = .GlobalEnv))",
        "        if (isTRUE(.DialogForgeWebValue$visible)) {",
        "          print(.DialogForgeWebValue$value)",
        "        }",
        "      }, message = function(.DialogForgeWebMessage) {",
        "        cat(conditionMessage(.DialogForgeWebMessage), sep = \"\\n\")",
        "        invokeRestart(\"muffleMessage\")",
        "      }, warning = function(.DialogForgeWebWarning) {",
        "        cat(paste0(\"Warning: \", conditionMessage(.DialogForgeWebWarning)), \"\\n\", sep = \"\")",
        "        invokeRestart(\"muffleWarning\")",
        "      })",
        "    }",
        "  }, type = \"output\")",
        "  paste(.DialogForgeWebOutput, collapse = \"\\n\")",
        "})"
    ].join("\n");
};

const readCapturedOutputText = function(output) {
    const data = output?.data;

    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(output?.data)) {
        return output.data.map(String).join("\n");
    }

    if (data && typeof data === "object") {
        for (const key of ["message", "text", "value"]) {
            if (typeof data[key] === "string") {
                return data[key];
            }
        }

        try {
            return JSON.stringify(data);
        }
        catch {
            return "";
        }
    }

    return data == null ? "" : String(data);
};

const readCapturedStreamName = function(output) {
    const type = String(output?.type || "").toLowerCase();

    return type.includes("error") || type.includes("warning") ? "stderr" : "stdout";
};

const collectCapturedStreams = function(output) {
    const streams = [];

    for (const item of output || []) {
        const text = readCapturedOutputText(item);

        if (!text) {
            continue;
        }

        const name = readCapturedStreamName(item);
        const last = streams[streams.length - 1];

        if (last && last.name === name) {
            const separator = last.text.endsWith("\n") || text.startsWith("\n") ? "" : "\n";

            last.text += separator + text;
            continue;
        }

        streams.push({
            name,
            text
        });
    }

    return streams;
};

const splitTopLevelArguments = function(text) {
    const args = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (const char of String(text || "")) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            current += char;
            escaped = true;
            continue;
        }

        if (quote) {
            current += char;
            if (char === quote) {
                quote = "";
            }
            continue;
        }

        if (char === "\"" || char === "'") {
            current += char;
            quote = char;
            continue;
        }

        if (char === "(" || char === "[" || char === "{") {
            current += char;
            depth += 1;
            continue;
        }

        if (char === ")" || char === "]" || char === "}") {
            current += char;
            depth -= 1;
            continue;
        }

        if (char === "," && depth === 0) {
            args.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        args.push(current.trim());
    }

    return args;
};

const readQuotedPackageNames = function(value) {
    const text = String(value || "").trim();
    const vector = text.match(/^c\s*\(([\s\S]*)\)$/);
    const source = vector ? vector[1] : text;
    const names = [];
    const pattern = /(["'])((?:\\.|(?!\1).)*)\1/g;
    let match = null;

    while ((match = pattern.exec(source))) {
        names.push(match[2].replace(/\\(["'\\])/g, "$1"));
    }

    return names;
};

const readInstallPackagesCommand = function(text) {
    const match = String(text || "").trim().match(
        /^(?:utils::)?install\.packages\s*\(([\s\S]*)\)\s*;?\s*$/
    );

    if (!match) {
        return null;
    }

    const args = splitTopLevelArguments(match[1]);
    const firstArg = args[0] || "";
    const names = readQuotedPackageNames(firstArg).filter(Boolean);

    return names.length ? names : null;
};

const readLibraryCommand = function(text) {
    const match = String(text || "").trim().match(
        /^(?:base::)?(?:library|require)\s*\(([\s\S]*)\)\s*;?\s*$/
    );

    if (!match) {
        return null;
    }

    const args = splitTopLevelArguments(match[1]);
    const firstArg = String(args[0] || "").trim().replace(/^package\s*=\s*/, "");
    const quoted = readQuotedPackageNames(firstArg);
    const packageName = quoted[0] || firstArg.match(/^([A-Za-z.][A-Za-z0-9._]*)$/)?.[1] || "";

    return packageName ? [packageName] : null;
};

const readHelpCommand = function(text) {
    const source = String(text || "").trim();
    const questionMatch = source.match(/^\?\s*([A-Za-z.][A-Za-z0-9._]*)\s*$/);

    if (questionMatch) {
        return {
            topic: questionMatch[1],
            packageName: ""
        };
    }

    const helpMatch = source.match(/^help\s*\(\s*(?:(["'])((?:\\.|(?!\1).)*)\1|([A-Za-z.][A-Za-z0-9._]*))(?:\s*,\s*package\s*=\s*(["'])((?:\\.|(?!\5).)*)\5)?\s*\)\s*$/);

    if (!helpMatch) {
        return null;
    }

    return {
        topic: String(helpMatch[2] || helpMatch[3] || "").replace(/\\(["'\\])/g, "$1"),
        packageName: String(helpMatch[6] || "").replace(/\\(["'\\])/g, "$1")
    };
};

const encodeHelpDocument = function(html) {
    return btoa(unescape(encodeURIComponent(String(html || ""))));
};

const createHelpFallbackHtml = function(topic, message) {
    return [
        "<main class=\"container\">",
        `<h1>${escapeHtml(topic || "R Help")}</h1>`,
        `<p>${escapeHtml(message || "No help page was found for this topic.")}</p>`,
        "</main>"
    ].join("");
};

const parseHelpTopicFromUrl = function(value) {
    try {
        const parsed = new URL(String(value || ""), window.location.origin);
        const match = parsed.pathname.match(/\/library\/([^/]+)\/(?:html\/([^/?#]+)|Example\/([^/?#]+))$/);

        if (!match) {
            return null;
        }

        const packageName = decodeURIComponent(String(match[1] || ""));
        const topic = decodeURIComponent(String(match[2] || match[3] || "")).replace(/\.html$/i, "");
        const isExample = Boolean(match[3]);

        if (!packageName || !topic) {
            return null;
        }

        return {
            packageName,
            topic,
            isIndex: !isExample && /^00Index$/i.test(topic),
            isExample,
            path: parsed.pathname
        };
    }
    catch {
        return null;
    }
};

const parseRHelpHttpdPath = function(value) {
    try {
        const parsed = new URL(String(value || ""), window.location.origin);
        const pathname = parsed.pathname || "";

        if (
            pathname.startsWith("/library/")
            || pathname.startsWith("/doc/html/")
        ) {
            return pathname;
        }

        return "";
    }
    catch {
        return "";
    }
};

const fetchBrowserRHelpHttpdPath = async function(pathname) {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .path <- ${JSON.stringify(String(pathname || ""))}`,
        "  .out <- NULL",
        "  invisible(capture.output({",
        "    .out <- tryCatch(tools:::httpd(.path, list()), error = function(.error) list(error = conditionMessage(.error)))",
        "  }))",
        "  if (!is.null(.out$error)) stop(.out$error)",
        "  if (!is.null(.out$payload)) {",
        "    cat(.out$payload)",
        "  } else if (!is.null(.out$file) && file.exists(.out$file)) {",
        "    cat(paste(readLines(.out$file, warn = FALSE), collapse = \"\\n\"))",
        "  } else {",
        "    stop(\"help-page-unavailable\")",
        "  }",
        "})"
    ].join("\n");

    return String(await captureHiddenRText(runtime, command) || "").trim();
};

const fetchHelpTopicDocument = async function(topic, packageName = "") {
    const runtime = await ensureRuntime();
    const command = [
        "local({",
        `  .DialogForgeHelpTopic <- ${JSON.stringify(String(topic || ""))}`,
        `  .DialogForgeHelpPackage <- ${JSON.stringify(String(packageName || ""))}`,
        "  .DialogForgeHelp <- tryCatch(",
        "    if (nzchar(.DialogForgeHelpPackage)) {",
        "      utils::help(.DialogForgeHelpTopic, package = .DialogForgeHelpPackage)",
        "    } else {",
        "      utils::help(.DialogForgeHelpTopic)",
        "    },",
        "    error = function(.DialogForgeHelpError) NULL",
        "  )",
        "  if ((is.null(.DialogForgeHelp) || length(.DialogForgeHelp) == 0L) && !nzchar(.DialogForgeHelpPackage)) {",
        "    .DialogForgeHelpSearch <- sub('^package:', '', grep('^package:', search(), value = TRUE))",
        "    .DialogForgeHelpSearch <- .DialogForgeHelpSearch[nzchar(.DialogForgeHelpSearch)]",
        "    for (.DialogForgeHelpCandidate in .DialogForgeHelpSearch) {",
        "      .DialogForgeHelp <- tryCatch(",
        "        utils::help(.DialogForgeHelpTopic, package = .DialogForgeHelpCandidate),",
        "        error = function(.DialogForgeHelpError) NULL",
        "      )",
        "      if (!is.null(.DialogForgeHelp) && length(.DialogForgeHelp) > 0L) {",
        "        break",
        "      }",
        "    }",
        "  }",
        "  if (is.null(.DialogForgeHelp) || length(.DialogForgeHelp) == 0L) {",
        "    cat(\"\")",
        "  } else {",
        "    .DialogForgeHelpPath <- tryCatch(as.character(.DialogForgeHelp)[[1L]], error = function(.DialogForgeHelpError) '')",
        "    if (!nzchar(.DialogForgeHelpPath)) {",
        "      cat(\"\")",
        "    } else {",
        "      cat(.DialogForgeHelpPath)",
        "    }",
        "  }",
        "})"
    ].join("\n");
    const pathValue = String(await captureHiddenRText(runtime, command) || "").trim();
    const pathMatch = pathValue.match(/\/library\/([^/]+)\/html\/([^/]+)\.html$/)
        || pathValue.match(/\/library\/([^/]+)\/help\/([^/]+)$/)
        || pathValue.match(/\/dialogr-library\/([^/]+)\/html\/([^/]+)\.html$/)
        || pathValue.match(/\/dialogr-library\/([^/]+)\/help\/([^/]+)$/);
    const resolvedPackage = String(packageName || pathMatch?.[1] || "").trim();
    const resolvedTopic = String(topic || pathMatch?.[2] || "").trim();
    const resolvedHelpFileTopic = String(pathMatch?.[2] || topic || "").trim();
    const baseUrl = resolvedPackage && resolvedHelpFileTopic
        ? `${window.location.origin}/library/${encodeURIComponent(resolvedPackage)}/html/${encodeURIComponent(resolvedHelpFileTopic)}.html`
        : "";
    const html = baseUrl
        ? await fetchBrowserRHelpHttpdPath(new URL(baseUrl).pathname)
        : "";

    return {
        html: String(html || "").trim()
            || createHelpFallbackHtml(topic, `No help page was found for ${packageName ? `${packageName}::` : ""}${topic}.`),
        topic: resolvedTopic || String(topic || "").trim(),
        packageName: resolvedPackage,
        baseUrl
    };
};

const fetchHelpTopicHtml = async function(topic, packageName = "") {
    return (await fetchHelpTopicDocument(topic, packageName)).html;
};

const updateHelpViewer = function(topic, html, options = {}) {
    const title = topic ? `R Help: ${topic}` : "R Help";
    const params = new URLSearchParams();

    params.set("title", title);
    if (options.topic) {
        params.set("topic", String(options.topic || ""));
    }
    if (options.packageName) {
        params.set("package", String(options.packageName || ""));
    }
    if (options.baseUrl) {
        params.set("src", String(options.baseUrl || ""));
        params.set("base", String(options.baseUrl || ""));
    }
    else {
        params.set("doc", encodeHelpDocument(html));
    }
    const src = `/shared/base-app/pages/help.html?${params.toString()}`;

    if (state.helpViewer.frame?.isConnected) {
        state.helpViewer.frame.src = src;
        const titleNode = state.helpViewer.layer?.querySelector(".dialogforge-web-dialog__title");
        if (titleNode) {
            titleNode.textContent = title;
        }
        return;
    }

    const layer = document.createElement("div");
    const shell = document.createElement("section");
    const titlebar = document.createElement("div");
    const titleNode = document.createElement("div");
    const close = document.createElement("button");
    const frame = document.createElement("iframe");
    const rightHandle = document.createElement("span");
    const bottomHandle = document.createElement("span");
    const cornerHandle = document.createElement("span");

    layer.className = "dialogforge-web-dialog-layer dialogforge-web-help-layer";
    layer.dataset.surfaceId = "helpViewer";
    shell.className = "dialogforge-web-dialog dialogforge-web-help-window";
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", title);
    shell.style.width = "820px";
    shell.style.height = "620px";
    titlebar.className = "dialogforge-web-dialog__titlebar";
    titleNode.className = "dialogforge-web-dialog__title";
    titleNode.textContent = title;
    close.className = "dialogforge-web-dialog__close";
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Close");
    frame.className = "dialogforge-web-dialog__frame dialogforge-web-help-frame";
    frame.title = title;
    frame.src = src;
    rightHandle.className = "web-workbench-resize-handle";
    rightHandle.dataset.resizeDirection = "right";
    bottomHandle.className = "web-workbench-resize-handle";
    bottomHandle.dataset.resizeDirection = "bottom";
    cornerHandle.className = "web-workbench-resize-handle";
    cornerHandle.dataset.resizeDirection = "corner";

    close.addEventListener("click", () => {
        layer.remove();
        if (state.helpViewer.layer === layer) {
            state.helpViewer.layer = null;
            state.helpViewer.frame = null;
        }
    });

    titlebar.append(titleNode, close);
    shell.append(titlebar, frame, rightHandle, bottomHandle, cornerHandle);
    layer.append(shell);
    document.body.appendChild(layer);
    state.helpViewer.layer = layer;
    state.helpViewer.frame = frame;
    installDraggableModal(shell, titlebar, {
        mode: "fixed",
        storageKey: "helpViewer"
    });
    installResizableWindow(shell, [rightHandle, bottomHandle, cornerHandle]);
    frame.focus();
};

const openHelpTopicModal = async function(topic, packageName = "") {
    const cleanTopic = String(topic || "").trim();

    if (!cleanTopic) {
        return;
    }

    const document = await fetchHelpTopicDocument(cleanTopic, packageName);

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
};

const buildHelpExampleCommand = function(topic, packageName = "") {
    const cleanTopic = String(topic || "").trim();
    const cleanPackage = String(packageName || "").trim();
    const quote = function(value) {
        return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    };

    if (!cleanTopic) {
        return "";
    }

    return cleanPackage
        ? `example("${quote(cleanTopic)}", package = "${quote(cleanPackage)}")`
        : `example("${quote(cleanTopic)}")`;
};

const runHelpExampleInPage = async function(input = {}) {
    const runtime = await ensureRuntime();
    const command = buildHelpExampleCommand(input.topic, input.package);

    if (!command) {
        return {
            status: "invalid",
            message: "Invalid help example request."
        };
    }

    try {
        const text = await captureHiddenRText(runtime, command);

        return {
            status: "ready",
            text: String(text || "").trim()
        };
    }
    catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error)
        };
    }
};

const plotFormatMimeTypes = {
    png: "image/png",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    tiff: "image/tiff"
};

const plotFormatLabels = {
    png: "PNG image",
    jpeg: "JPEG image",
    svg: "SVG image",
    pdf: "PDF document",
    tiff: "TIFF image"
};

const readPlotSaveFormat = function(value) {
    const format = String(value || "png").trim().toLowerCase();

    return Object.prototype.hasOwnProperty.call(plotFormatMimeTypes, format)
        ? format
        : "png";
};

const downloadPlotAsFile = function(url, format, index) {
    const link = document.createElement("a");

    link.href = url;
    link.download = `plot-${Math.max(1, Number(index || 0) + 1)}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
};

const saveBrowserPlot = async function(input = {}) {
    const request = input && typeof input === "object" ? input : {};
    const url = String(request.url || "").trim();
    const format = readPlotSaveFormat(request.format);

    if (!url) {
        return {
            status: "invalid",
            filePath: "",
            message: "No plot URL was provided."
        };
    }

    if ("showSaveFilePicker" in window) {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: `plot.${format}`,
                types: [
                    {
                        description: plotFormatLabels[format],
                        accept: {
                            [plotFormatMimeTypes[format]]: [`.${format}`]
                        }
                    }
                ]
            });
            const response = await fetch(url);
            const blob = await response.blob();
            const writable = await fileHandle.createWritable();

            try {
                await writable.write(blob);
            }
            finally {
                await writable.close();
            }

            return {
                status: "saved",
                filePath: fileHandle.name || "",
                message: "Plot saved."
            };
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return {
                    status: "canceled",
                    filePath: "",
                    message: "Plot save was canceled."
                };
            }

            return {
                status: "failed",
                filePath: "",
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    downloadPlotAsFile(url, format, Number(request.index || 0));

    return {
        status: "saved",
        filePath: "",
        message: "Plot saved."
    };
};

const copyBrowserPlot = async function(value) {
    const url = String(value || "").trim();

    if (!url) {
        return {
            status: "invalid",
            message: "No plot URL was provided."
        };
    }

    try {
        if (
            typeof ClipboardItem !== "undefined"
            && navigator.clipboard?.write
        ) {
            const response = await fetch(url);
            const blob = await response.blob();
            const type = blob.type || "image/png";

            await navigator.clipboard.write([
                new ClipboardItem({ [type]: blob })
            ]);

            return {
                status: "copied",
                message: "Plot copied to clipboard."
            };
        }

        throw new Error("Image clipboard access is unavailable.");
    }
    catch (error) {
        return {
            status: "failed",
            message: error instanceof Error ? error.message : String(error)
        };
    }
};

const executeBrowserPlotMutation = async function(input = {}) {
    const text = String(input?.text || "").trim();

    if (!text) {
        return {
            ok: false,
            message: "No plot mutation command was provided."
        };
    }

    await ensureRuntime();
    await state.runtime.evalRVoid(text);

    return {
        ok: true,
        message: "Plot mutation executed."
    };
};

const handleHelpViewerMessage = async function(event) {
    const data = event?.data || {};

    if (String(data.id || "") !== "app-help-complete") {
        return;
    }

    const title = String(data.title || "").trim();
    const displayTitle = title ? `R Help - ${title}` : "R Help";
    const titleNode = state.helpViewer.layer?.querySelector(".dialogforge-web-dialog__title");
    const shell = state.helpViewer.layer?.querySelector(".dialogforge-web-dialog");

    if (titleNode) {
        titleNode.textContent = displayTitle;
    }
    if (shell) {
        shell.setAttribute("aria-label", displayTitle);
    }
    if (state.helpViewer.frame) {
        state.helpViewer.frame.title = displayTitle;
    }
};

const openBrowserHelpCommandUrl = async function(value) {
    const raw = String(value || "").trim();

    if (!raw) {
        return { status: "invalid" };
    }

    try {
        const parsed = new URL(raw);

        if (parsed.protocol !== "app:" || parsed.hostname !== "app-shell" || parsed.pathname !== "/cli") {
            return { status: "invalid" };
        }

        const command = String(parsed.searchParams.get("command") || "").trim();
        const match = command.match(/^x-r-(help|run|vignette):(.+)$/);

        if (!match) {
            return { status: "invalid" };
        }

        const kind = String(match[1] || "");
        const payload = decodeURIComponent(String(match[2] || ""));

        if (kind === "run") {
            return executeVisibleCommand(payload);
        }

        await openHelpTopicModal(payload);
        return { status: "ready" };
    }
    catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error)
        };
    }
};

const fetchBrowserRHelpPage = async function(value) {
    const target = parseHelpTopicFromUrl(value);
    const httpdPath = target?.path || parseRHelpHttpdPath(value);

    if (!httpdPath) {
        return {
            ok: false,
            status: 404,
            error: "unsupported-help-url"
        };
    }

    try {
        const text = await fetchBrowserRHelpHttpdPath(httpdPath);

        return {
            ok: true,
            status: 200,
            url: `${window.location.origin}${httpdPath}`,
            text,
            contentType: httpdPath.endsWith(".css")
                ? "text/css; charset=utf-8"
                : httpdPath.endsWith(".js")
                    ? "text/javascript; charset=utf-8"
                    : "text/html; charset=utf-8"
        };
    }
    catch (error) {
        return {
            ok: false,
            status: 500,
            error: error instanceof Error ? error.message : String(error)
        };
    }
};

const installBrowserHelpBridge = function() {
    const existing = window.dialogForge && typeof window.dialogForge === "object"
        ? window.dialogForge
        : {};

    window.dialogForge = Object.assign(existing, {
        openHelpCommandUrl: openBrowserHelpCommandUrl,
        fetchRHelpPage: fetchBrowserRHelpPage,
        runHelpExample: runHelpExampleInPage,
        executeInvisibleMutation: executeBrowserPlotMutation,
        savePlot: saveBrowserPlot,
        copyPlot: copyBrowserPlot,
        getConsoleSyntaxModule: function() {
            return import("/browser-esm/shared/console/consoleSyntax.js");
        }
    });
};

const refreshWorkspaceAfterVisibleCommand = async function(options) {
    if (options?.deferWorkspaceRefresh) {
        return;
    }

    if (options?.fastWorkspaceRefresh) {
        await refreshWebRWorkspacePaneFast();
        refreshWebRWorkspaceMetadataInBackground();
        return;
    }

    await refreshWebRWorkspaceSurfaces();
};

const executeVisibleCommand = async function(text, options = {}) {
    const activity = options.preRecorded
        ? {
            id: String(options.activityId || `web_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            commandText: normalizeConstructedCommandText(text)
        }
        : createVisibleCommandActivity(text, String(options.activityId || ""));
    const activityId = activity.id;
    const commandText = activity.commandText;
    const consoleTranscript = transcript();
    const manageRuntimeBusy = options.manageRuntimeBusy !== false;

    if (manageRuntimeBusy) {
        state.console?.session?.setRuntimeBusy?.(true);
        state.console?.toolbar?.render?.();
    }

    let runtime = null;
    let Shelter = null;

    try {
        runtime = await ensureRuntime();
        Shelter = runtime.Shelter;
    }
    catch (error) {
        consoleTranscript?.recordRuntimeMessageStream?.({
            id: `${activityId}_startup_error`,
            parent_id: activityId,
            name: "stderr",
            text: error instanceof Error ? error.message : String(error)
        });
        consoleTranscript?.recordRuntimeMessageState?.({
            parent_id: activityId,
            state: "error"
        });

        if (manageRuntimeBusy) {
            state.console?.session?.setRuntimeBusy?.(false);
            state.console?.toolbar?.render?.();
        }

        return { ok: false };
    }

    const packageNames = readInstallPackagesCommand(commandText);
    const libraryPackages = readLibraryCommand(commandText);
    const helpCommand = readHelpCommand(commandText);

    if (helpCommand) {
        try {
            await openHelpTopicModal(helpCommand.topic, helpCommand.packageName);
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "idle"
            });
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: true };
        }
        catch (error) {
            consoleTranscript?.recordRuntimeMessageStream?.({
                id: `${activityId}_help_error`,
                parent_id: activityId,
                name: "stderr",
                text: error instanceof Error ? error.message : String(error)
            });
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "error"
            });
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: false };
        }
    }

    maybeOpenPlotViewerForCommand(commandText);

    if (packageNames) {
        const installDone = {
            finished: false
        };

        try {
            const progress = collectInstallProgress(
                runtime,
                consoleTranscript,
                activityId,
                installDone
            );

            await runtime.installPackages(packageNames, { quiet: false });
            installDone.finished = true;
            await progress;
            consoleTranscript?.recordRuntimeMessageStream?.({
                id: `${activityId}_install_done`,
                parent_id: activityId,
                name: "stdout",
                text: `Installed WebR package${packageNames.length === 1 ? "" : "s"}: ${packageNames.join(", ")}`
            });
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "idle"
            });
            await refreshWorkspaceAfterVisibleCommand(options);
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: true };
        }
        catch (error) {
            installDone.finished = true;
            consoleTranscript?.recordRuntimeMessageStream?.({
                id: `${activityId}_install_error`,
                parent_id: activityId,
                name: "stderr",
                text: error instanceof Error ? error.message : String(error)
            });
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "error"
            });
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: false };
        }
    }

    if (libraryPackages && !Shelter) {
        try {
            await runtime.evalRVoid(buildVisibleRCommand(commandText));
            for (const packageName of libraryPackages) {
                state.loadedRuntimePackages.add(packageName);
            }
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "idle"
            });
            await refreshWorkspaceAfterVisibleCommand(options);
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: true };
        }
        catch (error) {
            consoleTranscript?.recordRuntimeMessageStream?.({
                id: `${activityId}_library_error`,
                parent_id: activityId,
                name: "stderr",
                text: error instanceof Error ? error.message : String(error)
            });
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "error"
            });
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: false };
        }
    }

    if (!Shelter) {
        try {
            await runtime.evalRVoid(buildVisibleRCommand(commandText));
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "idle"
            });
            await refreshWorkspaceAfterVisibleCommand(options);
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: true };
        }
        catch (error) {
            consoleTranscript?.recordRuntimeMessageStream?.({
                id: `${activityId}_error`,
                parent_id: activityId,
                name: "stderr",
                text: error instanceof Error ? error.message : String(error)
            });
            consoleTranscript?.recordRuntimeMessageState?.({
                parent_id: activityId,
                state: "error"
            });
            if (manageRuntimeBusy) {
                state.console?.session?.setRuntimeBusy?.(false);
                state.console?.toolbar?.render?.();
            }
            return { ok: false };
        }
    }

    const shelter = await new Shelter();

    try {
        const isPlot = isPlotCommand(commandText);
        const captured = await shelter.captureR(
            buildCapturedVisibleRCommand(commandText),
            isPlot
                ? {
                    captureGraphics: {
                        width: 720,
                        height: 576,
                        capture: true
                    }
                }
                : {}
        );

        for (const output of collectCapturedStreams(captured.output)) {
            consoleTranscript?.recordRuntimeMessageStream?.({
                id: `${activityId}_stream_${Math.random().toString(36).slice(2, 8)}`,
                parent_id: activityId,
                name: output.name,
                text: output.text
            });
        }

        if (libraryPackages) {
            for (const packageName of libraryPackages) {
                state.loadedRuntimePackages.add(packageName);
            }
        }

        consoleTranscript?.recordRuntimeMessageState?.({
            parent_id: activityId,
            state: "idle"
        });

        await refreshWorkspaceAfterVisibleCommand(options);
        if (isPlot) {
            await updatePlotViewerFromCapturedImages(captured.images);
        }

        if (manageRuntimeBusy) {
            state.console?.session?.setRuntimeBusy?.(false);
            state.console?.toolbar?.render?.();
        }

        return { ok: true };
    }
    catch (error) {
        consoleTranscript?.recordRuntimeMessageStream?.({
            id: `${activityId}_error`,
            parent_id: activityId,
            name: "stderr",
            text: error instanceof Error ? error.message : String(error)
        });
        consoleTranscript?.recordRuntimeMessageState?.({
            parent_id: activityId,
            state: "error"
        });

        if (manageRuntimeBusy) {
            state.console?.session?.setRuntimeBusy?.(false);
            state.console?.toolbar?.render?.();
        }

        return { ok: false };
    }
    finally {
        await shelter.purge?.();
    }
};

const stopWebRRuntime = async function(message) {
    try {
        await state.runtime?.close?.();
    }
    catch {}
    try {
        await state.runtime?.destroy?.();
    }
    catch {}

    state.runtime = null;
    state.runtimeStartPromise = null;
    state.runtimeReady = false;
    state.runtimeStarting = false;
    state.loadedRuntimePackages.clear();
    state.plotViewer.graphicsWarmupPromise = null;
    state.plotViewer.graphicsWarm = false;
    setRuntimeStatus(message || "WebR stopped");
    notifyConsoleSession();
};

const executeRuntimeMethod = async function(input) {
    const method = String(input?.method || "");

    if (method === "runtime.interrupt") {
        setRuntimeStatus("WebR interrupt is not available in this browser runtime.");
        state.console?.session?.setRuntimeBusy?.(false);
        state.console?.toolbar?.render?.();
        return {
            value: { ok: false, message: "WebR interrupt is not available in this browser shell yet." }
        };
    }

    if (method === "check_completeness") {
        return {
            value: {
                state: await checkCodeFragmentComplete(String(input?.params?.code || ""))
            }
        };
    }

    if (method === "reply_prompt") {
        return {
            value: { ok: true }
        };
    }

    return {
        value: {}
    };
};

const initializeSharedConsole = async function() {
    const [
        sessionModule,
        completionModule,
        historyModule,
        coordinatorModule,
        toolbarModule
    ] = await Promise.all([
        import("/browser-esm/shared/console/services/consoleSessionState.js"),
        import("/browser-esm/shared/console/terminal/completionModel.js"),
        import("/browser-esm/shared/console/services/consoleCommandHistory.js"),
        import("/browser-esm/shared/console/renderer/mainConsoleCoordinator.js"),
        import("/browser-esm/shared/console/renderer/consoleToolbarController.js")
    ]);
    const session = sessionModule.createConsoleSessionState(() => {
        if (state.runtimeReady) return "ready";
        if (state.runtimeStarting) return "starting";
        return "not-started";
    });
    const commandHistory = historyModule.createConsoleCommandHistory({
        maximumItems: 500,
        readHistory: async function() {
            return readStoredCommandHistory();
        },
        writeHistory: function(request) {
            writeStoredCommandHistory(request.history);
        },
        excludeFromHistory: function(command) {
            return String(command || "").includes("__DIALOGFORGE_DATASET_READY_");
        }
    });
    const completionModel = completionModule.createCompletionModel({
        completionFetch: async function(params) {
            const code = String(params?.code || "");
            const prefix = String(params?.prefix || "");
            const dollarMatch = code.match(/([A-Za-z.][A-Za-z0-9._]*)\$([A-Za-z0-9._]*)$/);

        if (dollarMatch) {
            const objectName = String(dollarMatch[1] || "");
            const columns = workspaceColumnNames(objectName);

                return {
                    ok: true,
                    value: {
                        items: columns
                            .filter((name) => !prefix || name.startsWith(prefix))
                            .map((name) => ({ label: name, kind: "variable" }))
                    }
                };
            }

            if (String(params?.packageName || "")) {
                return {
                    ok: true,
                    value: {
                        exports: [
                            "mean", "median", "sd", "var", "lm", "glm",
                            "t.test", "summary", "plot", "hist"
                        ],
                        internals: []
                    }
                };
            }

            return {
                ok: true,
                value: {
                    symbols: [
                        ...workspaceObjectNames(),
                        ...workspaceEntries().flatMap((entry) => entry.columns || [])
                    ],
                    items: workspaceObjectNames()
                        .filter((name) => !prefix || name.startsWith(prefix))
                        .map((name) => ({ label: name, kind: "variable" }))
                }
            };
        }
    });
    let coordinator = null;
    let toolbar = null;

    await commandHistory.load({
        productId: String(state.composition?.product?.id || "DialogR"),
        runtimeId: "webr"
    });
    completionModel.ingestObjectNames(workspaceObjectNames());

    coordinator = coordinatorModule.createMainConsoleCoordinator({
        document,
        session,
        completionModel,
        getHistory: function() {
            return commandHistory.getInputHistory();
        },
        getRuntimeSession: function() {
            if (state.runtimeReady) return runtimeSnapshot("ready", "WebR ready.");
            if (state.runtimeStarting) return runtimeSnapshot("starting", "WebR is starting.");

            return runtimeSnapshot("stopped", "WebR not started.");
        },
        startRuntimeSession: async function() {
            await ensureRuntime();

            return runtimeSnapshot("ready", "WebR ready.");
        },
        renderStatus: function(snapshot) {
            setRuntimeStatus(snapshot.message || snapshot.status || "Runtime status changed.");
        },
        recordHistory: function(text) {
            commandHistory.record(text);
        },
        registerCompletionInput: function(text) {
            completionModel.registerCommandInput(text);
        },
        navigateFallbackHistory: function() {
            return;
        },
        executeRuntimeMethod,
        executeVisibleCommand: async function(input) {
            return executeVisibleCommand(String(input?.text || ""));
        },
        openHelpTopic: function(input) {
            const topic = String(input.topic || "").trim();
            const packageName = String(input.package || "").trim();

            openHelpTopicModal(topic, packageName).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        },
        writeClipboardText: function(text) {
            return navigator.clipboard?.writeText(String(text || ""));
        }
    });
    toolbar = toolbarModule.createConsoleToolbarController({
        document,
        getRuntimeSession: function() {
            if (state.runtimeReady) return runtimeSnapshot("ready", "WebR ready.");
            if (state.runtimeStarting) return runtimeSnapshot("starting", "WebR is starting.");

            return runtimeSnapshot("stopped", "WebR not started.");
        },
        isRuntimeBusy: session.isRuntimeBusy,
        getWorkingDirectoryPath: function() {
            return state.workingDirectoryPath;
        },
        getHomeDirectoryPath: function() {
            return state.homeDirectoryPath;
        },
        getActiveDatasetName: function() {
            return state.activeDatasetName;
        },
        getProductStateChips: function() {
            return state.productStateChips || [];
        },
        translate: function(key) {
            return String(key || "");
        },
        setWorkingDirectoryPaths: function(path, home) {
            state.workingDirectoryPath = String(path || state.workingDirectoryPath);
            state.homeDirectoryPath = String(home || state.homeDirectoryPath);
        },
        readWorkingDirectory: async function() {
            return {
                path: state.workingDirectoryPath,
                home: state.homeDirectoryPath
            };
        },
        clearTranscriptEvents: function() {
            return;
        },
        clearTranscriptIdentity: session.clearTranscriptIdentity,
        clearConsoleSurface: function() {
            coordinator.clear();
        },
        renderTranscript: function() {
            return;
        },
        setInputText: function(value) {
            coordinator.setText(value);
        },
        focusInput: function() {
            coordinator.focus();
        },
        restartRuntime: async function(action) {
            await stopWebRRuntime(action === "restore"
                ? "Restarting WebR and restoring workspace..."
                : "Restarting WebR...");
            await ensureRuntime();

            return runtimeSnapshot("ready", "WebR ready.");
        },
        applyRuntimeSession: function() {
            notifyConsoleSession();
        },
        refreshRuntimeEvents: function() {
            return;
        },
        refreshPrompts: function() {
            return;
        },
        refreshWorkspace: async function() {
            await refreshWebRWorkspacePane();
        }
    });

    state.console = {
        session,
        completionModel,
        commandHistory,
        coordinator,
        toolbar,
        executeVisibleCommand,
        waitForPlotWarmup: async function() {
            if (state.runtimeReady && !state.plotViewer.graphicsWarmupPromise) {
                prewarmPlotInfrastructure(state.runtime);
            }

            await state.plotViewer.graphicsWarmupPromise;
            await waitForPlotViewerFrameReady();

            return {
                frameReady: state.plotViewer.frameReady,
                graphicsWarm: state.plotViewer.graphicsWarm
            };
        }
    };
    window.dialogForgeWebConsole = state.console;
    session.onDidRuntimeBusy(function() {
        toolbar.render();
    });
    session.onDidSessionPhase(function() {
        toolbar.render();
    });
    coordinator.initializeFlow();
    await coordinator.initializeInput();
    coordinator.focus();
    toolbar.render();
    prewarmPlotViewerModal();

    document.getElementById("consoleToolbarStart")?.addEventListener("click", () => {
        ensureRuntime().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarStop")?.addEventListener("click", () => {
        executeRuntimeMethod({ method: "runtime.interrupt", params: {} }).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarRestart")?.addEventListener("click", () => {
        toolbar.restartClean().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarRestartWorkspace")?.addEventListener("click", () => {
        toolbar.restartRestoreWorkspace().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarClear")?.addEventListener("click", () => {
        toolbar.clearTranscript();
        coordinator.focus();
    });
    document.getElementById("consoleToolbarInfo")?.addEventListener("click", () => {
        setRuntimeStatus(state.runtimeReady
            ? "WebR ready"
            : "WebR not running");
    });
    document.getElementById("workspacePaneToggle")?.addEventListener("click", () => {
        toggleWorkspacePane();
    });

    return coordinator;
};

const closeDialogLayerForMessage = function(message, sourceWindow) {
    const dialogId = String(message?.dialogId || "").trim();
    let layer = null;

    if (dialogId) {
        layer = document.querySelector(
            `.dialogforge-web-dialog-layer[data-dialog-id="${CSS.escape(dialogId)}"]`
        );
    }

    if (!layer && sourceWindow) {
        const frames = Array.from(document.querySelectorAll(".dialogforge-web-dialog__frame"));
        const frame = frames.find((candidate) => candidate.contentWindow === sourceWindow);

        layer = frame?.closest(".dialogforge-web-dialog-layer") || null;
    }

    layer?.remove();

    if (
        (dialogId && state.commandPreviewDialogId === dialogId)
        || !document.querySelector(".dialogforge-web-dialog-layer[data-dialog-id]")
    ) {
        updateCommandPane("").catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    }
};

const handleBrowserDialogStateCall = function(callName, parameters) {
    const dataset = String(parameters?.dataset || "").trim();

    if (callName === "getFilterState") {
        return getSharedFilterState(state.dialogBindingState, dataset) || {};
    }

    if (callName === "setFilterState") {
        const command = String(parameters?.command || "").trim();

        if (!command) {
            clearSharedFilterState(state.dialogBindingState, dataset);
            notifyBrowserDialogsStateChanged(dataset);
            return {};
        }

        const value = setSharedFilterState(state.dialogBindingState, { dataset, command });

        notifyBrowserDialogsStateChanged(dataset);
        return value;
    }

    if (callName === "clearFilterState") {
        clearSharedFilterState(state.dialogBindingState, dataset);
        notifyBrowserDialogsStateChanged(dataset);
        return {};
    }

    if (callName === "getSplitByState") {
        return getSharedSplitByState(state.dialogBindingState, dataset) || {};
    }

    if (callName === "setSplitByState") {
        const grouping = Array.isArray(parameters?.grouping)
            ? parameters.grouping.map((name) => String(name || "").trim()).filter(Boolean)
            : [];

        if (!grouping.length) {
            clearSharedSplitByState(state.dialogBindingState, dataset);
            refreshBrowserConsoleStateChips();
            notifyBrowserDialogsStateChanged(dataset);
            return {};
        }

        const value = setSharedSplitByState(state.dialogBindingState, {
            dataset,
            grouping,
            sortdataset: parameters?.sortdataset === true
        });

        refreshBrowserConsoleStateChips();
        notifyBrowserDialogsStateChanged(dataset);
        return value;
    }

    if (callName === "clearSplitByState") {
        clearSharedSplitByState(state.dialogBindingState, dataset);
        refreshBrowserConsoleStateChips();
        notifyBrowserDialogsStateChanged(dataset);
        return {};
    }

    if (callName === "getWeightByState") {
        return getSharedWeightByState(state.dialogBindingState, dataset) || {};
    }

    if (callName === "setWeightByState") {
        const weighting = String(parameters?.weighting || "").trim();

        if (!weighting) {
            clearSharedWeightByState(state.dialogBindingState, dataset);
            refreshBrowserConsoleStateChips();
            notifyBrowserDialogsStateChanged(dataset);
            return {};
        }

        const value = setSharedWeightByState(state.dialogBindingState, { dataset, weighting });

        refreshBrowserConsoleStateChips();
        notifyBrowserDialogsStateChanged(dataset);
        return value;
    }

    if (callName === "clearWeightByState") {
        clearSharedWeightByState(state.dialogBindingState, dataset);
        refreshBrowserConsoleStateChips();
        notifyBrowserDialogsStateChanged(dataset);
        return {};
    }

    if (callName === "inheritSubsetDatasetState") {
        const value = inheritSharedSubsetDatasetState(state.dialogBindingState, {
            source: String(parameters?.source || ""),
            target: String(parameters?.target || ""),
            variables: Array.isArray(parameters?.variables)
                ? parameters.variables.map((name) => String(name || "").trim()).filter(Boolean)
                : []
        });

        refreshBrowserConsoleStateChips();
        notifyBrowserDialogsStateChanged(String(parameters?.target || ""));
        return value;
    }

    return null;
};

const browserDialogStateCallNames = new Set([
    "getFilterState",
    "setFilterState",
    "clearFilterState",
    "getSplitByState",
    "setSplitByState",
    "clearSplitByState",
    "getWeightByState",
    "setWeightByState",
    "clearWeightByState",
    "inheritSubsetDatasetState"
]);

const handleDialogRuntimeMessage = async function(event) {
    if (
        event.origin !== window.location.origin
        || !event.data
        || event.data.source !== "dialogforge.browser-dialog-runtime"
    ) {
        return;
    }

    const message = event.data;

    if (message.type === "stageImportFile") {
        stageBrowserImportFile(message.payload || {});
        return;
    }

    if (message.requestId) {
        const sourceWindow = event.source;
        let value = null;

        if (message.type === "listObjects") {
            value = workspaceObjectNames();
        }
        else if (message.type === "listColumns") {
            value = workspaceColumnEntries(String(message.payload?.dataset || state.activeDatasetName || ""));
        }
        else if (message.type === "externalCall") {
            const callName = String(message.payload?.name || "");
            const parameters = message.payload?.parameters || {};

            if (callName === "openImportFile") {
                value = await selectBrowserImportFile();
            }
            else if (callName === "stageImportFile") {
                value = stageBrowserImportFile(parameters);
            }
            else if (callName === "getImportPreview") {
                value = await readBrowserImportPreview(parameters);
            }
            else if (callName === "getWorkingDirectory") {
                value = {
                    path: state.workingDirectoryPath,
                    home: state.homeDirectoryPath
                };
            }
            else if (browserDialogStateCallNames.has(callName)) {
                value = handleBrowserDialogStateCall(callName, parameters);
            }
            else {
                value = {};
            }
        }

        sourceWindow?.postMessage({
            source: "dialogforge.browser-dialog-host",
            requestId: message.requestId,
            value
        }, "*");
        return;
    }

    if (message.type === "syntaxUpdate") {
        state.commandPreviewDialogId = String(message.dialogId || "");
        await updateCommandPane(message.command || "");
        return;
    }

    if (message.type === "runCommand") {
        await updateCommandPane("");
        closeDialogLayerForMessage(message, event.source);

        const command = String(message.command || "");
        const dependencyActivities = new Map();
        const dependencyPackages = parsePackageList(message.dependencies || []).filter((packageName) => {
            return !state.loadedRuntimePackages.has(packageName);
        });

        for (const packageName of dependencyPackages) {
            dependencyActivities.set(
                packageName,
                createVisibleCommandActivity(`library(${packageName})`)
            );
        }

        const commandActivity = createVisibleCommandActivity(command);

        state.console?.session?.setRuntimeBusy?.(true);
        state.console?.toolbar?.render?.();

        try {
            await loadRuntimePackages(message.dependencies || [], {
                activitiesByPackage: dependencyActivities,
                manageRuntimeBusy: false
            });
            await restoreBrowserImportFilesToWebR();
            const result = await executeVisibleCommand(command, {
                activityId: commandActivity.id,
                preRecorded: true,
                manageRuntimeBusy: false,
                deferWorkspaceRefresh: true
            });

            if (!result?.ok) {
                return;
            }

            const assignedName = readAssignedObjectName(command);

            if (assignedName) {
                state.activeDatasetName = assignedName;
                await refreshWebRWorkspacePaneFast();
                refreshBrowserConsoleStateChips(assignedName);
                refreshWebRWorkspaceMetadataInBackground();
            }
            else {
                await refreshWebRWorkspacePaneFast();
                refreshWebRWorkspaceMetadataInBackground();
            }
        }
        catch (error) {
            dependencyActivities.forEach((activity) => {
                finishVisibleCommandActivity(activity.id, "error");
            });
            transcript()?.recordRuntimeMessageStream?.({
                id: `${commandActivity.id}_run_error`,
                parent_id: commandActivity.id,
                name: "stderr",
                text: error instanceof Error ? error.message : String(error)
            });
            finishVisibleCommandActivity(commandActivity.id, "error");
        }
        finally {
            state.console?.session?.setRuntimeBusy?.(false);
            state.console?.toolbar?.render?.();
            await updateCommandPane("");
        }
        return;
    }

    if (message.type === "stateUpdate") {
        if (message.stateKind === "goto") {
            handleBrowserGoToStateUpdate(message).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        }

        return;
    }

    if (message.type === "closeDialog") {
        closeDialogLayerForMessage(message, event.source);
        return;
    }

    if (message.type === "dialogReady") {
        return;
    }

    if (message.type === "dialogError") {
        appendTranscript(String(message.message || "Dialog failed."), "web-transcript__line--stderr");
    }
};

const handlePlotViewerMessage = async function(event) {
    if (
        event.origin !== window.location.origin
        || !event.data
        || event.data.source !== "dialogforge.browser-plot-viewer"
    ) {
        return;
    }

    const message = event.data;

    if (message.type === "ready") {
        state.plotViewer.frameReady = true;
        postPlotViewerUpdate();
        return;
    }

    if (message.type === "rendered") {
        const token = Number(message.renderToken || 0);
        const waiters = Array.isArray(state.plotViewer.renderWaiters)
            ? state.plotViewer.renderWaiters.slice()
            : [];

        state.plotViewer.renderWaiters = waiters.filter((waiter) => {
            if (waiter.token !== token) {
                return true;
            }

            waiter.resolve();
            return false;
        });
        return;
    }

    if (message.type === "executeInvisibleMutation") {
        await executeBrowserPlotMutation(message.request || {});
        return;
    }

    if (message.type === "savePlot") {
        await saveBrowserPlot(message.request || {});
        return;
    }

    if (message.type === "copyPlot") {
        await copyBrowserPlot(message.url || "");
    }
};

const readDialogContentSize = async function(dialog) {
    let source = null;

    try {
        source = await fetchJsonIfAvailable(`/api/dialog/${encodeURIComponent(dialog.id)}`);
    }
    catch {}

    const properties = source?.source?.properties
        && typeof source.source.properties === "object"
        ? source.source.properties
        : {};
    const width = Math.max(200, Math.round(Number(properties.width) || 640));
    const height = Math.max(120, Math.round(Number(properties.height) || 480));

    return {
        width,
        height
    };
};

const postPlotViewerUpdate = function(payload = state.plotViewer.payload) {
    const frameWindow = state.plotViewer.frame?.contentWindow;

    if (!frameWindow) {
        return;
    }

    frameWindow.postMessage({
        source: "dialogforge.browser-plot-host",
        type: "plotViewerUpdate",
        payload
    }, window.location.origin);
};

const updatePlotViewerPayload = function(payload) {
    state.plotViewer.payload = Object.assign({}, state.plotViewer.payload, payload || {});
    postPlotViewerUpdate(state.plotViewer.payload);
};

const waitForPlotViewerRender = function(renderToken, timeoutMs = 1200) {
    const token = Number(renderToken || 0);

    if (!token || !state.plotViewer.frame?.contentWindow) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const waiter = {
            token,
            resolve: function() {
                window.clearTimeout(timer);
                resolve(true);
            }
        };
        const timer = window.setTimeout(() => {
            state.plotViewer.renderWaiters = state.plotViewer.renderWaiters.filter((entry) => {
                return entry !== waiter;
            });
            resolve(false);
        }, timeoutMs);

        state.plotViewer.renderWaiters.push(waiter);
    });
};

const revokePlotObjectUrls = function() {
    for (const url of state.plotViewer.objectUrls || []) {
        try {
            URL.revokeObjectURL(url);
        }
        catch {
            // Ignore stale object URLs; the browser may already have released them.
        }
    }

    state.plotViewer.objectUrls = [];
};

const imageBitmapToObjectUrl = function(image) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        const width = Math.max(1, Number(image?.width) || 1);
        const height = Math.max(1, Number(image?.height) || 1);

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
            reject(new Error("Could not create plot canvas context."));
            return;
        }

        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Could not encode captured WebR plot."));
                return;
            }

            resolve(URL.createObjectURL(blob));
        }, "image/png");
    });
};

const updatePlotViewerFromCapturedImages = async function(images) {
    const capturedImages = Array.isArray(images) ? images.filter(Boolean) : [];

    if (!capturedImages.length) {
        const currentUrls = Array.isArray(state.plotViewer.payload.urls)
            ? state.plotViewer.payload.urls
            : [];

        updatePlotViewerPayload({
            status: currentUrls.length ? "ready" : "waiting",
            message: currentUrls.length
                ? ""
                : "No WebR plot image was captured for the last command.",
            url: currentUrls[currentUrls.length - 1] || "",
            urls: currentUrls,
            count: currentUrls.length
        });
        return;
    }

    const urls = Array.isArray(state.plotViewer.objectUrls)
        ? state.plotViewer.objectUrls.slice()
        : [];

    for (const image of capturedImages) {
        urls.push(await imageBitmapToObjectUrl(image));
    }
    closeCapturedImages(capturedImages);

    state.plotViewer.objectUrls = urls;

    const renderToken = state.plotViewer.renderToken + 1;
    const payload = {
        status: "ready",
        message: "",
        url: urls[urls.length - 1] || "",
        urls,
        count: urls.length,
        renderToken
    };

    state.plotViewer.renderToken = renderToken;

    if (state.plotViewer.layer?.isConnected) {
        updatePlotViewerPayload(payload);
        openPlotViewerModal(null);
        return;
    }

    openPlotViewerModal(payload);
};

const openPlotViewerModal = function(payload, options = {}) {
    const hidden = options.hidden === true;
    const syncPlotViewerChromeClasses = function(layer, frame, isHidden) {
        layer.classList.toggle("dialogforge-web-dialog-layer", !isHidden);
        layer.querySelector(".dialogforge-web-plot-window")?.classList.toggle("dialogforge-web-dialog", !isHidden);
        layer.querySelector(".dialogforge-web-plot-titlebar")?.classList.toggle("dialogforge-web-dialog__titlebar", !isHidden);
        layer.querySelector(".dialogforge-web-plot-title")?.classList.toggle("dialogforge-web-dialog__title", !isHidden);
        layer.querySelector(".dialogforge-web-plot-close")?.classList.toggle("dialogforge-web-dialog__close", !isHidden);
        frame?.classList?.toggle("dialogforge-web-dialog__frame", !isHidden);
    };

    if (payload) {
        updatePlotViewerPayload(payload);
    }

    if (state.plotViewer.layer?.isConnected) {
        syncPlotViewerChromeClasses(state.plotViewer.layer, state.plotViewer.frame, hidden);
        state.plotViewer.layer.style.display = hidden ? "none" : "";
        postPlotViewerUpdate();
        if (!hidden) {
            state.plotViewer.frame?.focus();
        }
        return;
    }

    const layer = document.createElement("div");
    const shell = document.createElement("section");
    const titlebar = document.createElement("div");
    const title = document.createElement("div");
    const close = document.createElement("button");
    const frame = document.createElement("iframe");
    const rightHandle = document.createElement("span");
    const bottomHandle = document.createElement("span");
    const cornerHandle = document.createElement("span");

    layer.className = hidden
        ? "dialogforge-web-plot-layer"
        : "dialogforge-web-dialog-layer dialogforge-web-plot-layer";
    layer.dataset.surfaceId = "plotViewer";
    if (hidden) {
        layer.style.display = "none";
    }
    shell.className = "dialogforge-web-plot-window";
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", "Plot Viewer");
    shell.style.width = "820px";
    shell.style.height = "620px";
    titlebar.className = "dialogforge-web-plot-titlebar";
    title.className = "dialogforge-web-plot-title";
    title.textContent = "Plot Viewer";
    close.className = "dialogforge-web-plot-close";
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Close");
    frame.className = hidden
        ? "dialogforge-web-plot-frame"
        : "dialogforge-web-dialog__frame dialogforge-web-plot-frame";
    frame.title = "Plot Viewer";
    frame.src = "/shared/base-app/pages/plotViewer.html";
    rightHandle.className = "web-workbench-resize-handle";
    rightHandle.dataset.resizeDirection = "right";
    bottomHandle.className = "web-workbench-resize-handle";
    bottomHandle.dataset.resizeDirection = "bottom";
    cornerHandle.className = "web-workbench-resize-handle";
    cornerHandle.dataset.resizeDirection = "corner";

    close.addEventListener("click", () => {
        layer.remove();
        if (state.plotViewer.layer === layer) {
            state.plotViewer.layer = null;
            state.plotViewer.frame = null;
            state.plotViewer.frameReady = false;
            state.plotViewer.renderWaiters = [];
        }
    });

    frame.addEventListener("load", () => {
        postPlotViewerUpdate();
    });

    titlebar.append(title, close);
    shell.append(titlebar, frame, rightHandle, bottomHandle, cornerHandle);
    layer.append(shell);
    syncPlotViewerChromeClasses(layer, frame, hidden);
    document.body.appendChild(layer);
    state.plotViewer.layer = layer;
    state.plotViewer.frame = frame;
    state.plotViewer.frameReady = false;
    installDraggableModal(shell, titlebar, {
        mode: "fixed",
        storageKey: "plotViewer"
    });
    installResizableWindow(shell, [rightHandle, bottomHandle, cornerHandle]);
    if (!hidden) {
        frame.focus();
    }
};

const prewarmPlotViewerModal = function() {
    if (state.plotViewer.layer?.isConnected) {
        return;
    }

    window.setTimeout(() => {
        if (state.plotViewer.layer?.isConnected) {
            return;
        }

        openPlotViewerModal(null, { hidden: true });
    }, 0);
};

const waitForPlotViewerFrameReady = function(timeoutMs = 2500) {
    if (state.plotViewer.frameReady) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        const startedAt = Date.now();
        const poll = function() {
            if (state.plotViewer.frameReady) {
                resolve(true);
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                resolve(false);
                return;
            }

            window.setTimeout(poll, 50);
        };

        poll();
    });
};


const prewarmWebRGraphicsCapture = function(runtime) {
    if (!runtime?.Shelter || state.plotViewer.graphicsWarmupPromise) {
        return state.plotViewer.graphicsWarmupPromise;
    }

    state.plotViewer.graphicsWarmupPromise = (async () => {
        const shelter = await new runtime.Shelter();

        try {
            const captured = await shelter.captureR("local({ plot.new(); invisible(NULL) })", {
                captureGraphics: {
                    width: 720,
                    height: 576,
                    capture: true
                }
            });

            closeCapturedImages(captured?.images);
            state.plotViewer.graphicsWarm = true;
            return true;
        }
        catch {
            state.plotViewer.graphicsWarm = false;
            return false;
        }
        finally {
            await shelter.purge?.();
            await flushWebROutputQueue(runtime);
        }
    })();

    return state.plotViewer.graphicsWarmupPromise;
};

const prewarmPlotInfrastructure = function(runtime) {
    prewarmPlotViewerModal();
    prewarmWebRGraphicsCapture(runtime);
};

const isPlotCommand = function(text) {
    const command = String(text || "");

    return /\b(?:plot|hist|boxplot|barplot|pairs|qqplot|curve|image|contour|persp)\s*\(/.test(command);
};

const maybeOpenPlotViewerForCommand = function(text) {
    if (!isPlotCommand(text)) {
        return;
    }

    prewarmPlotViewerModal();
};

const parsePackageList = function(value) {
    const entries = Array.isArray(value)
        ? value
        : String(value || "").split(/[;,\n]/g);

    return Array.from(new Set(entries.map((entry) => {
        return String(entry || "").trim();
    }).filter(Boolean)));
};

const readDialogRuntimePackageRequirements = function(dialogPayload) {
    const dialogId = String(
        dialogPayload?.definition?.id
        || dialogPayload?.source?.id
        || ""
    ).trim();

    return parsePackageList(
        dialogPayload?.runtimeRequirements?.rPackages
        || dialogPayload?.source?.properties?.dependencies
        || dialogPayload?.definition?.dependencies
        || dialogRuntimePackageRequirements[dialogId]
    );
};

const captureHiddenRText = async function(runtime, command) {
    if (runtime.Shelter) {
        const shelter = await new runtime.Shelter();

        try {
            const captured = await shelter.captureR(command);

            return collectCapturedStreams(captured.output).map((entry) => {
                return entry.text;
            }).join("\n");
        }
        finally {
            await shelter.purge?.();
        }
    }

    await runtime.evalRVoid(command);

    return "";
};

const readRuntimePackageStatus = async function(runtime, packages) {
    const packageVector = packages.map((packageName) => {
        return JSON.stringify(packageName);
    }).join(", ");
    const result = await captureHiddenRText(
        runtime,
        `local({
            .pkgs <- c(${packageVector})
            .installed <- rownames(installed.packages())
            .missing <- .pkgs[!is.element(.pkgs, .installed)]
            .attached <- .pkgs[vapply(.pkgs, function(.pkg) is.element(paste0("package:", .pkg), search()), logical(1))]
            cat(paste(paste(.missing, collapse = ","), paste(.attached, collapse = ","), sep = "|"))
        })`
    );
    const [missingPart = "", attachedPart = ""] = String(result || "").split("|");
    const parsePart = function(value) {
        return String(value || "").split(",").map((entry) => {
            return entry.trim();
        }).filter(Boolean);
    };

    return {
        missing: parsePart(missingPart),
        attached: parsePart(attachedPart)
    };
};

const readAssignedObjectName = function(command) {
    const match = String(command || "").match(/^\s*([A-Za-z.][A-Za-z0-9._]*)\s*<-/);

    return match ? match[1] : "";
};

const loadRuntimePackages = async function(packages, options = {}) {
    const pending = parsePackageList(packages).filter((packageName) => {
        return !state.loadedRuntimePackages.has(packageName);
    });

    if (!pending.length) {
        return;
    }

    const activitiesByPackage = options.activitiesByPackage || new Map();

    for (const packageName of pending) {
        if (!activitiesByPackage.has(packageName)) {
            activitiesByPackage.set(
                packageName,
                createVisibleCommandActivity(`library(${packageName})`)
            );
        }
    }

    const manageRuntimeBusy = options.manageRuntimeBusy !== false;

    if (manageRuntimeBusy) {
        state.console?.session?.setRuntimeBusy?.(true);
        state.console?.toolbar?.render?.();
    }

    let runtime = null;

    try {
        runtime = await ensureRuntime();
    }
    catch (error) {
        for (const activity of activitiesByPackage.values()) {
            transcript()?.recordRuntimeMessageStream?.({
                id: `${activity.id}_startup_error`,
                parent_id: activity.id,
                name: "stderr",
                text: error instanceof Error ? error.message : String(error)
            });
            finishVisibleCommandActivity(activity.id, "error");
        }

        if (manageRuntimeBusy) {
            state.console?.session?.setRuntimeBusy?.(false);
            state.console?.toolbar?.render?.();
        }

        throw error;
    }

    try {
        const status = await readRuntimePackageStatus(runtime, pending);

        if (status.missing.length) {
            for (const activity of activitiesByPackage.values()) {
                transcript()?.recordRuntimeMessageStream?.({
                    id: `${activity.id}_missing_error`,
                    parent_id: activity.id,
                    name: "stderr",
                    text: `Required package(s) not installed: ${status.missing.join(", ")}`
                });
                finishVisibleCommandActivity(activity.id, "error");
            }

            throw new Error(`Required package(s) not installed: ${status.missing.join(", ")}`);
        }

        for (const packageName of pending) {
            const activity = activitiesByPackage.get(packageName);

            if (status.attached.includes(packageName)) {
                state.loadedRuntimePackages.add(packageName);
                if (activity?.id) {
                    finishVisibleCommandActivity(activity.id, "idle");
                }
                continue;
            }

            const result = await executeVisibleCommand(
                `library(${packageName})`,
                activity?.id
                    ? {
                        activityId: activity.id,
                        preRecorded: true,
                        manageRuntimeBusy: false,
                        deferWorkspaceRefresh: true
                    }
                    : {
                        manageRuntimeBusy: false,
                        deferWorkspaceRefresh: true
                    }
            );

            if (!result?.ok) {
                throw new Error(`Could not load R package: ${packageName}`);
            }

            state.loadedRuntimePackages.add(packageName);
        }
    }
    finally {
        if (manageRuntimeBusy) {
            state.console?.session?.setRuntimeBusy?.(false);
            state.console?.toolbar?.render?.();
        }
    }
};

const ensureDialogRuntimePackages = async function(dialogPayload) {
    const packages = readDialogRuntimePackageRequirements(dialogPayload);

    if (!packages.length) {
        return;
    }

    await loadRuntimePackages(packages);
};

const openDialog = async function(dialog) {
    const response = await fetch(`/api/dialog/${encodeURIComponent(dialog.id)}`);

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const dialogPayload = await response.json();
    const contentSize = await readDialogContentSize(dialog);

    await ensureDialogRuntimePackages(dialogPayload);

    const layer = document.createElement("div");
    const shell = document.createElement("section");
    const titlebar = document.createElement("div");
    const title = document.createElement("div");
    const close = document.createElement("button");
    const frame = document.createElement("iframe");

    layer.className = "dialogforge-web-dialog-layer";
    layer.dataset.dialogId = dialog.id;
    shell.className = "dialogforge-web-dialog";
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.style.width = `${contentSize.width}px`;
    shell.style.height = `${contentSize.height + 32}px`;
    titlebar.className = "dialogforge-web-dialog__titlebar";
    title.className = "dialogforge-web-dialog__title";
    title.textContent = dialog.label || dialog.id;
    close.className = "dialogforge-web-dialog__close";
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Close");
    frame.className = "dialogforge-web-dialog__frame";
    frame.title = dialog.label || dialog.id;
    frame.src = `/shared/base-app/pages/dialogBuilder.html?dialog=${encodeURIComponent(dialog.id)}`;

    close.addEventListener("click", () => {
        closeDialogLayerForMessage({ dialogId: dialog.id }, frame.contentWindow);
    });

    titlebar.append(title, close);
    shell.append(titlebar, frame);
    layer.append(shell);
    document.body.appendChild(layer);
    installDraggableModal(shell, titlebar, {
        mode: "fixed",
        storageKey: `dialog.${dialog.id}`
    });
    frame.focus();
};

window.addEventListener("message", (event) => {
    handleDialogRuntimeMessage(event).catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
    handlePlotViewerMessage(event).catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
    handleHelpViewerMessage(event).catch((error) => {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
});

document.addEventListener("click", (event) => {
    if (!elements.menuBar?.contains(event.target)) {
        closeMenus();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeMenus();
    }
});

installWorkbenchDrag();
installWorkbenchResize();
installCommandPaneActions();
installCommandPaneResize();
installWorkspacePaneActions();
installBrowserHelpBridge();

loadComposition()
    .then(async () => {
        await initializeSharedConsole();
        renderComposition();
        await ensureRuntime();
    })
    .catch((error) => {
        state.runtimeReady = false;
        state.runtimeStarting = false;
        state.runtimeStartPromise = null;
        notifyConsoleSession();
        setRuntimeStatus(state.composition ? "WebR failed" : "Composition failed.");
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
