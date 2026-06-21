import path = require("path");


export interface ScriptTabStripItem {
    id: string;
    filePath: string;
    dirty: boolean;
}


export interface ScriptTabStripLabels {
    untitled: string;
    closeTab: string;
}


export interface ScriptTabStripCallbacks {
    activate(tabId: string): void;
    close(tabId: string): void;
    reorder(sourceTabId: string, targetTabId: string, before: boolean): void;
}


export const renderScriptTabStrip = function(
    host: HTMLElement,
    tabs: ScriptTabStripItem[],
    activeTabId: string,
    labels: ScriptTabStripLabels,
    callbacks: ScriptTabStripCallbacks
): void {
    let draggedTabId = "";

    host.innerHTML = "";

    tabs.forEach((tab) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `dm-script-tab${tab.id === activeTabId ? " active" : ""}`;
        button.draggable = true;
        button.dataset.tabId = tab.id;

        const label = document.createElement("span");
        label.className = "dm-script-tab-label";
        const baseName = tab.filePath
            ? path.basename(tab.filePath)
            : labels.untitled;
        label.textContent = tab.dirty ? `${baseName} •` : baseName;
        label.title = tab.filePath || labels.untitled;

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "dm-script-tab-close";
        closeButton.textContent = "×";
        closeButton.title = labels.closeTab;
        closeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            callbacks.close(tab.id);
        });

        button.addEventListener("dragstart", (event) => {
            draggedTabId = tab.id;

            try {
                event.dataTransfer?.setData("text/plain", tab.id);

                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                }
            } catch {}

            button.style.opacity = "0.55";
        });

        button.addEventListener("dragend", () => {
            draggedTabId = "";
            button.style.opacity = "";
            button.style.borderLeft = "";
            button.style.borderRight = "";
        });

        button.addEventListener("dragover", (event) => {
            if (!draggedTabId || draggedTabId === tab.id) return;

            event.preventDefault();
            const rectangle = button.getBoundingClientRect();
            const before = event.clientX < rectangle.left + rectangle.width / 2;
            button.style.borderLeft = before ? "2px solid #4c8bf5" : "";
            button.style.borderRight = before ? "" : "2px solid #4c8bf5";

            try {
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                }
            } catch {}
        });

        button.addEventListener("dragleave", () => {
            button.style.borderLeft = "";
            button.style.borderRight = "";
        });

        button.addEventListener("drop", (event) => {
            event.preventDefault();
            button.style.borderLeft = "";
            button.style.borderRight = "";

            const sourceTabId = draggedTabId
                || String(event.dataTransfer?.getData("text/plain") || "");

            if (!sourceTabId || sourceTabId === tab.id) return;

            const rectangle = button.getBoundingClientRect();
            const before = event.clientX < rectangle.left + rectangle.width / 2;
            callbacks.reorder(sourceTabId, tab.id, before);
        });

        button.addEventListener("click", () => {
            callbacks.activate(tab.id);
        });
        button.appendChild(label);
        button.appendChild(closeButton);
        host.appendChild(button);
    });
};
