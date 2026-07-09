import type {
    ActiveDatasetSnapshot,
    ObjectInspectionResult,
    RuntimeEventSnapshot,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    WorkspaceObjectSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";


interface RuntimePanelHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
}


interface RuntimeEventCallbacks {
    openViewerUrl?(url: string): void;
}


interface WorkspaceCallbacks {
    setActiveDataset(objectName: string): void;
    readTabularPreview(objectName: string): void;
    inspectObject(objectName: string): void;
    removeObject(objectName: string): void;
    isGroupCollapsed?(groupLabel: string): boolean;
    toggleGroup?(groupLabel: string): void;
}


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};


const createCommandButton = function(
    documentRef: Document,
    label: string,
    disabled: boolean,
    callback: () => void
): HTMLButtonElement {
    const button = documentRef.createElement("button");

    button.className = "commandButton";
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", callback);

    return button;
};


const getPlotViewerUrl = function(payload: Record<string, unknown>): string {
    return String(payload.viewerUrl || payload.url || "").trim();
};


const renderRuntimeEvents = function(
    documentRef: Document,
    status: HTMLElement,
    list: HTMLElement,
    snapshot: RuntimeEventSnapshot,
    helpers: RuntimePanelHelpers,
    callbacks: RuntimeEventCallbacks = {}
): void {
    helpers.empty(status);
    helpers.empty(list);

    helpers.appendField(status, "status", snapshot.status);
    helpers.appendField(status, "provider", snapshot.providerId);
    helpers.appendField(status, "message", snapshot.message);

    snapshot.events.slice(0, 8).forEach((event) => {
        const item = documentRef.createElement("li");

        helpers.appendField(item, "type", event.type);
        helpers.appendField(item, "object", event.objectName);
        helpers.appendField(item, "detail", event.detail);
        if (event.type === "plot") {
            const payload = asRecord(event.payload);
            const viewerUrl = getPlotViewerUrl(payload);

            helpers.appendField(item, "status", payload.status || "");
            helpers.appendField(item, "viewer", viewerUrl);

            if (viewerUrl) {
                item.appendChild(createCommandButton(documentRef, "Open viewer", false, () => {
                    callbacks.openViewerUrl?.(viewerUrl);
                }));
            }
        }
        list.appendChild(item);
    });
};


const renderRuntimeSession = function(
    panel: HTMLElement,
    startButton: HTMLButtonElement,
    stopButton: HTMLButtonElement,
    session: RuntimeSessionSnapshot,
    helpers: RuntimePanelHelpers
): void {
    helpers.empty(panel);

    helpers.appendField(panel, "provider", session.providerId);
    helpers.appendField(panel, "status", session.status);
    helpers.appendField(panel, "connection", session.connection);
    helpers.appendField(panel, "message", session.message);

    startButton.disabled = session.status === "starting" || session.status === "ready";
    stopButton.disabled = session.status === "not-started" || session.status === "stopped";
};


const renderTranscript = function(
    documentRef: Document,
    list: HTMLElement,
    events: TranscriptEvent[],
    helpers: RuntimePanelHelpers
): void {
    helpers.empty(list);

    events.slice(-80).forEach((event) => {
        if (event.type === "completed") {
            return;
        }

        const item = documentRef.createElement("li");
        const message = String(event.message || "").trim();

        if (event.type === "output" && message === "R command completed without output.") {
            return;
        }

        item.className = event.type;

        if (event.type === "submitted") {
            item.textContent = "> " + event.text;
        }
        else if (event.type === "output") {
            item.textContent = message || "";
        }
        else if (event.type === "failed" || event.type === "rejected") {
            item.textContent = message || event.type;
        }
        else {
            item.textContent = [event.type, message].filter(Boolean).join(": ");
        }

        list.appendChild(item);
    });
};


const createTextElement = function(documentRef: Document, tagName: string, className: string, text: string): HTMLElement {
    const element = documentRef.createElement(tagName);

    element.className = className;
    element.textContent = text;

    return element;
};


const isDatasetObject = function(object: WorkspaceObjectSnapshot): boolean {
    const kind = object.kind.toLowerCase();
    const detail = object.detail.toLowerCase();

    return kind === "data.frame" || detail.includes("data.frame") || detail.includes("tibble");
};


const isMatrixObject = function(object: WorkspaceObjectSnapshot): boolean {
    const kind = object.kind.toLowerCase();
    const detail = object.detail.toLowerCase();

    return kind === "matrix" || kind === "array" || detail.includes("matrix") || detail.includes("array");
};


const getWorkspaceObjectGroupLabel = function(object: WorkspaceObjectSnapshot): string {
    if (isDatasetObject(object)) {
        return "Datasets";
    }

    if (isMatrixObject(object)) {
        return "Matrices / Arrays";
    }

    if (object.kind === "function") {
        return "Functions";
    }

    return object.hasViewer ? "Datasets" : "Values";
};


const getWorkspaceObjectSummary = function(object: WorkspaceObjectSnapshot): string {
    const detail = object.detail.trim();

    if (detail) {
        return detail;
    }

    return object.kind || "object";
};


const renderWorkspace = function(
    documentRef: Document,
    status: HTMLElement,
    list: HTMLElement,
    snapshot: WorkspaceSnapshot,
    activeObjectName: string,
    callbacks: WorkspaceCallbacks,
    helpers: RuntimePanelHelpers
): void {
    const groupedObjects = new Map<string, WorkspaceObjectSnapshot[]>();

    helpers.empty(status);
    helpers.empty(list);

    status.className = "workspaceStatus";
    status.textContent = [
        snapshot.providerId || "runtime",
        snapshot.status || "unknown",
        snapshot.message || ""
    ].filter(Boolean).join(" - ");

    if (!snapshot.objects.length) {
        list.appendChild(createTextElement(documentRef, "li", "workspaceEmpty", "No workspace objects."));
        return;
    }

    snapshot.objects.forEach((object) => {
        const groupLabel = getWorkspaceObjectGroupLabel(object);
        const groupObjects = groupedObjects.get(groupLabel) || [];

        groupObjects.push(object);
        groupedObjects.set(groupLabel, groupObjects);
    });

    groupedObjects.forEach((objects, groupLabel) => {
        const group = documentRef.createElement("li");
        const heading = documentRef.createElement("button");
        const groupItems = documentRef.createElement("div");
        const isCollapsed = callbacks.isGroupCollapsed?.(groupLabel) === true;

        group.className = "workspaceGroup";
        heading.className = "workspaceGroupHeading";
        heading.type = "button";
        heading.textContent = `${isCollapsed ? ">" : "v"} ${groupLabel} (${objects.length})`;
        heading.addEventListener("click", () => {
            callbacks.toggleGroup?.(groupLabel);
        });
        group.appendChild(heading);

        groupItems.className = isCollapsed ? "workspaceGroupItems collapsed" : "workspaceGroupItems";

        objects.forEach((object) => {
            const item = documentRef.createElement("div");
            const main = documentRef.createElement("div");
            const nameRow = documentRef.createElement("div");
            const details = documentRef.createElement("div");
            const buttonRow = documentRef.createElement("div");
            const canReadTabular = object.capabilities.includes("tabular.read");
            const canRemove = object.capabilities.includes("workspace.remove");
            const canOpenViewer = object.hasViewer || canReadTabular;
            const canMakeActive = object.kind === "table" || object.kind === "data.frame" || object.kind === "tibble" || canReadTabular;
            const isActive = object.name === activeObjectName;
            const makeActiveObject = function(): void {
                callbacks.setActiveDataset(object.name);
            };
            const openObject = function(): void {
                makeActiveObject();
                if (canReadTabular) {
                    callbacks.readTabularPreview(object.name);
                }
            };

            item.className = isActive ? "workspaceObject active" : "workspaceObject";
            main.className = "workspaceObjectMain";
            nameRow.className = "workspaceObjectNameRow";
            details.className = "workspaceObjectDetails";

            nameRow.appendChild(createTextElement(documentRef, "span", "workspaceObjectName", object.name));
            nameRow.appendChild(createTextElement(documentRef, "span", "workspaceObjectKind", getWorkspaceObjectSummary(object)));

            if (isActive) {
                nameRow.appendChild(createTextElement(documentRef, "span", "workspaceActiveBadge", "active"));
            }

            if (object.detail) {
                details.appendChild(createTextElement(documentRef, "span", "workspaceObjectDetail", object.detail));
            }
            if (object.hasViewer) {
                details.appendChild(createTextElement(documentRef, "span", "workspaceObjectViewer", "viewer"));
            }

            if (canOpenViewer) {
                item.addEventListener("dblclick", openObject);
            }

            if (object.provenance) {
                details.appendChild(createTextElement(
                    documentRef,
                    "span",
                    "workspaceObjectSource",
                    [object.provenance.source, object.provenance.format].filter(Boolean).join(" / ")
                ));
            }

            main.appendChild(nameRow);
            main.appendChild(details);

            buttonRow.className = "workspaceObjectActions";
            buttonRow.appendChild(createCommandButton(documentRef, "Make active", !canMakeActive, makeActiveObject));
            buttonRow.appendChild(createCommandButton(documentRef, "Open", !canOpenViewer, openObject));
            buttonRow.appendChild(createCommandButton(documentRef, "Preview", !canReadTabular, () => {
                callbacks.readTabularPreview(object.name);
            }));
            buttonRow.appendChild(createCommandButton(documentRef, "Inspect", false, () => {
                callbacks.inspectObject(object.name);
            }));
            buttonRow.appendChild(createCommandButton(documentRef, "Remove", !canRemove, () => {
                callbacks.removeObject(object.name);
            }));

            item.appendChild(main);
            item.appendChild(buttonRow);
            groupItems.appendChild(item);
        });

        group.appendChild(groupItems);
        list.appendChild(group);
    });
};


const renderObjectInspection = function(
    status: HTMLElement,
    result: ObjectInspectionResult,
    helpers: RuntimePanelHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "object", result.objectName);
    helpers.appendField(status, "kind", result.kind);
    helpers.appendField(status, "message", result.message);

    result.summary.forEach((item) => {
        helpers.appendField(status, item.name, item.value);
    });
};


const renderActiveDataset = function(
    status: HTMLElement,
    snapshot: ActiveDatasetSnapshot,
    helpers: RuntimePanelHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "active", snapshot.objectName || "(none)");
    helpers.appendField(status, "state", snapshot.status);
    helpers.appendField(status, "message", snapshot.message);
};


export const runtimePanelsApi = {
    renderActiveDataset,
    renderObjectInspection,
    renderRuntimeEvents,
    renderRuntimeSession,
    renderTranscript,
    renderWorkspace
};
