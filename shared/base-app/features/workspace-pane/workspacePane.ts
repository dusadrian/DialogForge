import type {
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    WorkspacePaneController,
    WorkspacePaneOptions,
    WorkspaceSnapshotPayload,
    WorkspaceVariable,
    WorkspaceVariableGroup,
    WorkspaceVariableKind,
    WorkspaceVariableViewItem
} from "./workspacePane.types";


const RECENT_MS = 2000;
const EMPTY_SNAPSHOT: WorkspaceSnapshotPayload = {
    variables: [],
    objectCount: 0,
    updatedAt: 0
};


const ensureNumber = function(value: unknown, fallback = 0): number {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
};


const normalizeVariableKind = function(value: unknown): WorkspaceVariableKind {
    switch (String(value || "").toLowerCase()) {
        case "table":
        case "function":
        case "class":
        case "boolean":
        case "number":
        case "string":
        case "collection":
            return String(value || "").toLowerCase() as WorkspaceVariableKind;
        default:
            return "other";
    }
};


const firstTypeToken = function(value: string): string {
    return String(value || "")
        .split(/[\/,]/)
        .map((entry) => {
            return entry.trim();
        })
        .find(Boolean) || "";
};


const compactTypeToken = function(value: string): string {
    switch (firstTypeToken(value).toLowerCase()) {
        case "character":
            return "chr";
        case "numeric":
        case "double":
            return "dbl";
        case "integer":
            return "int";
        case "logical":
            return "lgl";
        case "complex":
            return "cplx";
        case "factor":
            return "fct";
        case "ordered":
            return "ord";
        case "data.frame":
            return "df";
        case "matrix":
            return "matrix";
        case "array":
            return "array";
        case "list":
            return "list";
        case "function":
        case "closure":
            return "fn";
        case "environment":
            return "env";
        default:
            return firstTypeToken(value) || "obj";
    }
};


const normalizeDims = function(value: string): string {
    return String(value || "").replace(/\s*x\s*/gi, " x ").trim();
};


const stripOuterQuotes = function(value: string): string {
    const text = String(value || "").trim();
    const match = text.match(/^(['"])(.*)\1$/);

    return match ? String(match[2] || "").trim() : text;
};


const formatDimSummary = function(value: string, t: (key: string) => string): string {
    const dims = normalizeDims(value);
    const match = dims.match(/^(\d+)\s*x\s*(\d+)$/);

    if (!match) {
        return dims ? `[${dims}]` : "";
    }

    const rows = match[1];
    const columns = match[2];

    return `[${rows} ${rows === "1" ? t("row") : t("rows")} x ${columns} ${columns === "1" ? t("column") : t("columns")}]`;
};


const isVisibleWorkspaceName = function(value: unknown): boolean {
    const name = String(value || "").trim();

    return Boolean(name) && !name.startsWith(".");
};


const isDatasetVariable = function(variable: WorkspaceVariable): boolean {
    return firstTypeToken(variable.display_type || variable.type_info).toLowerCase() === "data.frame";
};


const isMatrixArrayVariable = function(variable: WorkspaceVariable): boolean {
    return variable.kind === "table" && !isDatasetVariable(variable);
};


const isRuntimeWorkspaceSnapshot = function(value: unknown): value is WorkspaceSnapshot {
    const snapshot = value as WorkspaceSnapshot;

    return Boolean(snapshot && Array.isArray(snapshot.objects));
};


const createVariableFromWorkspaceObject = function(object: WorkspaceObjectSnapshot): WorkspaceVariable {
    const kind = normalizeVariableKind(object.kind === "data.frame" || object.kind === "matrix" || object.kind === "array" ? "table" : object.kind);
    const displayType = object.kind === "table" ? "data.frame" : object.kind;
    const detail = String(object.detail || "").trim();

    return {
        access_key: String(object.name || "").trim(),
        display_name: String(object.name || "").trim(),
        display_value: detail,
        display_type: displayType,
        type_info: displayType,
        size: 0,
        kind,
        length: 0,
        has_children: false,
        has_viewer: Boolean(object.hasViewer),
        is_truncated: false,
        updated_time: Date.parse(object.provenance?.source || "") || 0
    };
};


export const normalizeWorkspaceSnapshot = function(value: unknown): WorkspaceSnapshotPayload {
    if (isRuntimeWorkspaceSnapshot(value)) {
        const variables = value.objects
            .map(createVariableFromWorkspaceObject)
            .filter((variable) => {
                return isVisibleWorkspaceName(variable.access_key);
            });

        return {
            variables,
            objectCount: variables.length,
            updatedAt: Date.parse(value.refreshedAt || "") || Date.now()
        };
    }

    if (!value || typeof value !== "object") {
        return { ...EMPTY_SNAPSHOT };
    }

    const raw = value as Record<string, unknown>;
    const rawVariables = Array.isArray(raw.variables) ? raw.variables : [];
    const variables = rawVariables
        .map((entry) => {
            if (!entry || typeof entry !== "object") {
                return null;
            }

            const variable = entry as Record<string, unknown>;
            const accessKey = String(variable.access_key || variable.display_name || "").trim();

            if (!isVisibleWorkspaceName(accessKey)) {
                return null;
            }

            return {
                access_key: accessKey,
                display_name: String(variable.display_name || accessKey),
                display_value: String(variable.display_value || ""),
                display_type: String(variable.display_type || variable.type_info || ""),
                type_info: String(variable.type_info || variable.display_type || ""),
                size: ensureNumber(variable.size, 0),
                kind: normalizeVariableKind(variable.kind),
                length: ensureNumber(variable.length, 0),
                has_children: Boolean(variable.has_children),
                has_viewer: Boolean(variable.has_viewer),
                is_truncated: Boolean(variable.is_truncated),
                updated_time: ensureNumber(variable.updated_time, 0)
            } satisfies WorkspaceVariable;
        })
        .filter((entry): entry is WorkspaceVariable => {
            return Boolean(entry);
        });

    return {
        variables,
        objectCount: variables.length,
        updatedAt: ensureNumber(raw.updatedAt, Date.now())
    };
};


export const formatWorkspaceSummary = function(variable: WorkspaceVariable, t: (key: string) => string = (key) => key): string {
    const token = compactTypeToken(variable.display_type || variable.type_info || variable.kind);

    if (variable.kind === "function") {
        return token;
    }

    if (variable.kind === "table") {
        return formatDimSummary(variable.display_value, t) || token;
    }

    if (variable.length > 0) {
        return `${token} [${variable.length}]`;
    }

    return token;
};


export const formatWorkspaceLead = function(variable: WorkspaceVariable): string {
    const name = String(variable.display_name || variable.access_key || "").trim();
    const value = stripOuterQuotes(String(variable.display_value || "").trim());

    if (!name) {
        return value;
    }

    if (!value || variable.kind === "function" || variable.kind === "table") {
        return name;
    }

    return `${name}: ${value}`;
};


const variableFingerprint = function(variable: WorkspaceVariable): string {
    return JSON.stringify({
        display_name: variable.display_name,
        display_value: variable.display_value,
        display_type: variable.display_type,
        kind: variable.kind,
        length: variable.length,
        has_children: variable.has_children,
        has_viewer: variable.has_viewer
    });
};


export const buildWorkspaceGroups = function(
    variables: WorkspaceVariable[],
    previousFingerprints: Map<string, string> = new Map()
): WorkspaceVariableGroup[] {
    const groupMap = new Map<string, WorkspaceVariableGroup>([
        ["datasets", { id: "datasets", titleKey: "Workspace Datasets", items: [] }],
        ["matrices", { id: "matrices", titleKey: "Workspace Matrices / Arrays", items: [] }],
        ["vectors", { id: "vectors", titleKey: "Workspace Values", items: [] }],
        ["functions", { id: "functions", titleKey: "Workspace Functions", items: [] }],
        ["classes", { id: "classes", titleKey: "Workspace Classes", items: [] }]
    ]);

    const byName = [...variables].sort((left, right) => {
        return left.display_name.localeCompare(right.display_name, undefined, { sensitivity: "base" });
    });

    byName.forEach((variable) => {
        const fingerprint = variableFingerprint(variable);
        const previous = previousFingerprints.get(variable.access_key);
        const viewItem: WorkspaceVariableViewItem = {
            ...variable,
            isRecent: !previous || previous !== fingerprint
        };

        if (isDatasetVariable(variable)) {
            groupMap.get("datasets")?.items.push(viewItem);
        }
        else if (isMatrixArrayVariable(variable)) {
            groupMap.get("matrices")?.items.push(viewItem);
        }
        else if (variable.kind === "function") {
            groupMap.get("functions")?.items.push(viewItem);
        }
        else if (variable.kind === "class") {
            groupMap.get("classes")?.items.push(viewItem);
        }
        else {
            groupMap.get("vectors")?.items.push(viewItem);
        }
    });

    return Array.from(groupMap.values()).filter((group) => {
        return group.items.length > 0;
    });
};


const buildFingerprintMap = function(variables: WorkspaceVariable[]): Map<string, string> {
    const next = new Map<string, string>();

    variables.forEach((variable) => {
        next.set(variable.access_key, variableFingerprint(variable));
    });

    return next;
};


const groupChevron = function(expanded: boolean): string {
    return expanded ? "▾" : "▸";
};


const createWorkspaceVariableRow = function(
    item: WorkspaceVariableViewItem,
    t: (key: string) => string,
    activeDataset = ""
): HTMLDivElement {
    const isActiveDataset = isDatasetVariable(item) && item.access_key === activeDataset;
    const row = document.createElement("div");
    const button = document.createElement("button");
    const main = document.createElement("span");
    const nameWrap = document.createElement("span");
    const summary = document.createElement("span");
    const deleteButton = document.createElement("button");

    row.className = `workspace-variable-row${item.isRecent ? " recent" : ""}${isActiveDataset ? " active-dataset" : ""}`;
    row.dataset.workspaceVariableRow = item.access_key;

    button.type = "button";
    button.className = "workspace-variable";
    button.dataset.workspaceVariable = item.access_key;

    main.className = "workspace-variable-main";
    main.textContent = formatWorkspaceLead(item);

    nameWrap.className = "workspace-variable-name-wrap";
    nameWrap.appendChild(main);

    if (isActiveDataset) {
        const badge = document.createElement("span");

        badge.className = "workspace-active-dataset-badge";
        badge.textContent = t("Active");
        badge.setAttribute("aria-label", t("Active dataset"));
        nameWrap.appendChild(badge);
    }

    summary.className = "workspace-variable-summary";
    summary.textContent = formatWorkspaceSummary(item, t);

    button.appendChild(nameWrap);
    button.appendChild(summary);

    deleteButton.type = "button";
    deleteButton.className = "workspace-variable-delete";
    deleteButton.dataset.workspaceDelete = item.access_key;
    deleteButton.setAttribute("aria-label", t("Delete Object"));

    const icon = document.createElement("span");

    icon.className = "codicon codicon-trash";
    icon.setAttribute("aria-hidden", "true");
    deleteButton.appendChild(icon);

    row.appendChild(button);
    row.appendChild(deleteButton);

    return row;
};


const updateWorkspaceVariableRow = function(
    row: HTMLElement,
    item: WorkspaceVariableViewItem,
    t: (key: string) => string,
    activeDataset = ""
): void {
    const isActiveDataset = isDatasetVariable(item) && item.access_key === activeDataset;

    row.className = `workspace-variable-row${item.isRecent ? " recent" : ""}${isActiveDataset ? " active-dataset" : ""}`;
    row.dataset.workspaceVariableRow = item.access_key;

    const button = row.querySelector("[data-workspace-variable]") as HTMLButtonElement | null;
    const deleteButton = row.querySelector("[data-workspace-delete]") as HTMLButtonElement | null;

    if (button) {
        button.dataset.workspaceVariable = item.access_key;

        let nameWrap = button.querySelector(".workspace-variable-name-wrap") as HTMLElement | null;

        if (!nameWrap) {
            nameWrap = document.createElement("span");
            nameWrap.className = "workspace-variable-name-wrap";
            button.prepend(nameWrap);
        }

        let main = nameWrap.querySelector(".workspace-variable-main") as HTMLElement | null;

        if (!main) {
            main = document.createElement("span");
            main.className = "workspace-variable-main";
            nameWrap.prepend(main);
        }

        const summary = button.querySelector(".workspace-variable-summary") as HTMLElement | null;

        main.textContent = formatWorkspaceLead(item);
        if (summary) {
            summary.textContent = formatWorkspaceSummary(item, t);
        }

        let badge = nameWrap.querySelector(".workspace-active-dataset-badge") as HTMLElement | null;

        if (isActiveDataset) {
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "workspace-active-dataset-badge";
                nameWrap.appendChild(badge);
            }

            badge.textContent = t("Active");
            badge.setAttribute("aria-label", t("Active dataset"));
        }
        else if (badge) {
            badge.remove();
        }
    }

    if (deleteButton) {
        deleteButton.dataset.workspaceDelete = item.access_key;
        deleteButton.setAttribute("aria-label", t("Delete Object"));
    }
};


const createWorkspaceGroupSection = function(
    group: WorkspaceVariableGroup,
    expanded: boolean,
    t: (key: string) => string
): HTMLElement {
    const section = document.createElement("section");
    const header = document.createElement("button");
    const chevron = document.createElement("span");
    const title = document.createElement("span");
    const count = document.createElement("span");
    const items = document.createElement("div");

    section.className = "workspace-group";
    section.dataset.workspaceGroup = group.id;

    header.type = "button";
    header.className = "workspace-group-header";
    header.dataset.workspaceGroupToggle = group.id;
    header.setAttribute("aria-expanded", expanded ? "true" : "false");

    chevron.className = "workspace-group-chevron";
    chevron.textContent = groupChevron(expanded);

    title.className = "workspace-group-title";
    title.textContent = t(group.titleKey);

    count.className = "workspace-group-count";
    count.textContent = String(group.items.length);

    items.className = "workspace-group-items";
    items.hidden = !expanded;

    header.appendChild(chevron);
    header.appendChild(title);
    header.appendChild(count);

    section.appendChild(header);
    section.appendChild(items);

    return section;
};


export const createWorkspacePane = function(options: WorkspacePaneOptions): WorkspacePaneController {
    const container = options.container;
    let t = options.t || ((key: string) => key);
    let snapshot: WorkspaceSnapshotPayload = { ...EMPTY_SNAPSHOT };
    let previousFingerprints = new Map<string, string>();
    let collapsedGroups = new Set<string>();
    let recentTimer: ReturnType<typeof setTimeout> | null = null;
    let shellEl: HTMLDivElement | null = null;
    let titleEl: HTMLDivElement | null = null;
    let clearButtonEl: HTMLButtonElement | null = null;
    let bodyEl: HTMLDivElement | null = null;
    let emptyEl: HTMLDivElement | null = null;
    let contextMenuEl: HTMLDivElement | null = null;
    let contextMenuItem: WorkspaceVariableViewItem | null = null;
    let currentItemsByName = new Map<string, WorkspaceVariableViewItem>();
    let activeDataset = "";

    const hideContextMenu = function(): void {
        contextMenuItem = null;

        if (contextMenuEl) {
            contextMenuEl.hidden = true;
        }
    };

    const positionContextMenu = function(event: MouseEvent): void {
        if (!contextMenuEl) {
            return;
        }

        contextMenuEl.hidden = false;

        const hostRect = container.getBoundingClientRect();
        const menuRect = contextMenuEl.getBoundingClientRect();
        const left = Math.min(Math.max(0, event.clientX - hostRect.left), Math.max(0, hostRect.width - menuRect.width - 4));
        const top = Math.min(Math.max(0, event.clientY - hostRect.top), Math.max(0, hostRect.height - menuRect.height - 4));

        contextMenuEl.style.left = `${left}px`;
        contextMenuEl.style.top = `${top}px`;
    };

    const render = function(): void {
        ensureShell();

        if (!bodyEl || !titleEl || !clearButtonEl) {
            return;
        }

        const normalized = normalizeWorkspaceSnapshot(snapshot);
        const groups = buildWorkspaceGroups(normalized.variables, previousFingerprints);

        previousFingerprints = buildFingerprintMap(normalized.variables);
        titleEl.textContent = t("Workspace");

        if (contextMenuEl) {
            const makeActiveButton = contextMenuEl.querySelector('[data-workspace-context-action="make-active"]') as HTMLButtonElement | null;

            if (makeActiveButton) {
                makeActiveButton.textContent = t("Make active");
            }
        }

        clearButtonEl.disabled = normalized.variables.length === 0;
        clearButtonEl.dataset.tooltip = t("Clear Workspace");
        clearButtonEl.setAttribute("aria-label", t("Clear Workspace"));

        currentItemsByName = new Map(groups.flatMap((group) => {
            return group.items.map((item) => {
                return [item.access_key, item] as const;
            });
        }));

        const existingSections = new Map<string, HTMLElement>();

        Array.from(bodyEl.querySelectorAll("[data-workspace-group]")).forEach((node) => {
            const section = node as HTMLElement;
            const id = String(section.dataset.workspaceGroup || "").trim();

            if (id) {
                existingSections.set(id, section);
            }
        });

        if (!groups.length) {
            existingSections.forEach((section) => {
                section.remove();
            });

            if (!emptyEl) {
                emptyEl = document.createElement("div");
                emptyEl.className = "workspace-pane-empty";
            }

            emptyEl.textContent = t("No objects in workspace");
            if (emptyEl.parentElement !== bodyEl) {
                bodyEl.replaceChildren(emptyEl);
            }
        }
        else {
            if (emptyEl && emptyEl.parentElement === bodyEl) {
                emptyEl.remove();
            }

            const orderedSections: HTMLElement[] = [];

            groups.forEach((group) => {
                const expanded = !collapsedGroups.has(group.id);
                let section = existingSections.get(group.id) || null;

                if (!section) {
                    section = createWorkspaceGroupSection(group, expanded, t);
                }

                section.dataset.workspaceGroup = group.id;

                const header = section.querySelector("[data-workspace-group-toggle]") as HTMLButtonElement | null;
                const chevron = section.querySelector(".workspace-group-chevron") as HTMLElement | null;
                const title = section.querySelector(".workspace-group-title") as HTMLElement | null;
                const count = section.querySelector(".workspace-group-count") as HTMLElement | null;
                const itemsHost = section.querySelector(".workspace-group-items") as HTMLDivElement | null;

                if (header) {
                    header.dataset.workspaceGroupToggle = group.id;
                    header.setAttribute("aria-expanded", expanded ? "true" : "false");
                }

                if (chevron) {
                    chevron.textContent = groupChevron(expanded);
                }

                if (title) {
                    title.textContent = t(group.titleKey);
                }

                if (count) {
                    count.textContent = String(group.items.length);
                }

                if (itemsHost) {
                    itemsHost.hidden = !expanded;

                    if (expanded) {
                        const rowByName = new Map<string, HTMLElement>();

                        Array.from(itemsHost.querySelectorAll("[data-workspace-variable-row]")).forEach((node) => {
                            const row = node as HTMLElement;
                            const key = String(row.dataset.workspaceVariableRow || "").trim();

                            if (key) {
                                rowByName.set(key, row);
                            }
                        });

                        const orderedRows = group.items.map((item) => {
                            const existing = rowByName.get(item.access_key);

                            if (existing) {
                                updateWorkspaceVariableRow(existing, item, t, activeDataset);
                                return existing;
                            }

                            return createWorkspaceVariableRow(item, t, activeDataset);
                        });

                        itemsHost.replaceChildren(...orderedRows);
                    }
                }

                orderedSections.push(section);
            });

            bodyEl.replaceChildren(...orderedSections);
        }

        if (recentTimer) {
            clearTimeout(recentTimer);
            recentTimer = null;
        }

        if (groups.some((group) => group.items.some((item) => item.isRecent))) {
            recentTimer = setTimeout(() => {
                recentTimer = null;
                render();
            }, RECENT_MS + 40);
        }
    };

    const ensureShell = function(): void {
        if (shellEl) {
            return;
        }

        container.innerHTML = "";

        shellEl = document.createElement("div");
        shellEl.className = "workspace-pane-shell";

        const headerEl = document.createElement("div");
        const actionsEl = document.createElement("div");

        headerEl.className = "workspace-pane-header";

        titleEl = document.createElement("div");
        titleEl.className = "workspace-pane-title";

        actionsEl.className = "workspace-pane-actions";

        clearButtonEl = document.createElement("button");
        clearButtonEl.type = "button";
        clearButtonEl.className = "workspace-pane-action";
        clearButtonEl.dataset.workspaceClear = "true";

        const clearIconWrap = document.createElement("span");

        clearIconWrap.className = "workspace-pane-action-icon";
        clearIconWrap.setAttribute("aria-hidden", "true");
        clearIconWrap.innerHTML = [
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
        clearButtonEl.appendChild(clearIconWrap);

        actionsEl.appendChild(clearButtonEl);
        headerEl.appendChild(titleEl);
        headerEl.appendChild(actionsEl);

        bodyEl = document.createElement("div");
        bodyEl.className = "workspace-pane-body";

        contextMenuEl = document.createElement("div");
        contextMenuEl.className = "workspace-context-menu";
        contextMenuEl.hidden = true;

        const makeActiveButton = document.createElement("button");

        makeActiveButton.type = "button";
        makeActiveButton.className = "workspace-context-menu-item";
        makeActiveButton.dataset.workspaceContextAction = "make-active";
        contextMenuEl.appendChild(makeActiveButton);

        shellEl.appendChild(headerEl);
        shellEl.appendChild(bodyEl);
        shellEl.appendChild(contextMenuEl);
        container.appendChild(shellEl);

        container.addEventListener("click", (event) => {
            const target = event.target as HTMLElement | null;

            if (!target) {
                return;
            }

            const contextAction = target.closest("[data-workspace-context-action]") as HTMLButtonElement | null;

            if (contextAction) {
                event.preventDefault();

                const item = contextMenuItem;

                hideContextMenu();

                if (item && isDatasetVariable(item)) {
                    void Promise.resolve(options.onMakeActiveDataset?.(item));
                }

                return;
            }

            if (!target.closest(".workspace-context-menu")) {
                hideContextMenu();
            }

            const clearButton = target.closest("[data-workspace-clear]") as HTMLButtonElement | null;

            if (clearButton) {
                event.preventDefault();

                if (!clearButton.disabled) {
                    void Promise.resolve(options.onClearWorkspace?.());
                }

                return;
            }

            const deleteButton = target.closest("[data-workspace-delete]") as HTMLButtonElement | null;

            if (deleteButton) {
                event.preventDefault();
                event.stopPropagation();

                const name = String(deleteButton.dataset.workspaceDelete || "").trim();

                if (name) {
                    void Promise.resolve(options.onDeleteVariable?.(name));
                }

                return;
            }

            const groupButton = target.closest("[data-workspace-group-toggle]") as HTMLButtonElement | null;

            if (groupButton) {
                event.preventDefault();

                const id = String(groupButton.dataset.workspaceGroupToggle || "").trim();

                if (id) {
                    if (collapsedGroups.has(id)) {
                        collapsedGroups.delete(id);
                    }
                    else {
                        collapsedGroups.add(id);
                    }

                    render();
                }
            }
        });

        container.addEventListener("contextmenu", (event) => {
            const target = event.target as HTMLElement | null;
            const variableButton = target?.closest("[data-workspace-variable]") as HTMLButtonElement | null;

            if (!variableButton) {
                hideContextMenu();
                return;
            }

            const name = String(variableButton.dataset.workspaceVariable || "").trim();
            const item = currentItemsByName.get(name) || null;

            if (!item || !isDatasetVariable(item)) {
                hideContextMenu();
                return;
            }

            event.preventDefault();
            contextMenuItem = item;
            positionContextMenu(event as MouseEvent);
        });

        container.addEventListener("dblclick", (event) => {
            const target = event.target as HTMLElement | null;
            const variableButton = target?.closest("[data-workspace-variable]") as HTMLButtonElement | null;

            if (!variableButton) {
                return;
            }

            const name = String(variableButton.dataset.workspaceVariable || "").trim();
            const item = currentItemsByName.get(name) || null;

            if (item && item.has_viewer && isDatasetVariable(item)) {
                void Promise.resolve(options.onOpenVariable?.(item));
                return;
            }

            if (name) {
                options.onInsertVariable?.(name);
            }
        });

        document.addEventListener("click", (event) => {
            if (!container.contains(event.target as Node | null)) {
                hideContextMenu();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                hideContextMenu();
            }
        });
    };

    render();

    return {
        setSnapshot(next: unknown): void {
            snapshot = normalizeWorkspaceSnapshot(next);
            render();
        },
        setActiveDataset(name: string): void {
            activeDataset = String(name || "").trim();
            render();
        },
        setTranslator(next: (key: string) => string): void {
            t = next || ((key: string) => key);
            render();
        }
    };
};


export const workspacePaneApi = {
    buildWorkspaceGroups,
    createWorkspacePane,
    formatWorkspaceLead,
    formatWorkspaceSummary,
    normalizeWorkspaceSnapshot
};
