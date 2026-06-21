import {
    createScriptBreadcrumbModel,
    createScriptBreadcrumbPopupContext,
    resolveScriptBreadcrumbEntry
} from "../files/scriptBreadcrumbs";


export interface ScriptDirectoryEntry {
    name: string;
    isDirectory?: boolean;
    isFile?: boolean;
}


export interface ScriptBreadcrumbViewOptions {
    listDirectory(directoryPath: string): Promise<ScriptDirectoryEntry[]>;
    openFile(filePath: string): Promise<void>;
}


export interface ScriptBreadcrumbView {
    render(filePath: string): void;
    closePopup(): void;
}


export const createScriptBreadcrumbView = function(
    pathText: HTMLSpanElement,
    crumbs: HTMLSpanElement,
    options: ScriptBreadcrumbViewOptions
): ScriptBreadcrumbView {
    let popup: HTMLDivElement | null = null;

    const closePopup = function(): void {
        try {
            popup?.remove();
        } catch {}

        popup = null;
    };

    const showPopup = async function(
        anchor: HTMLElement,
        segmentPath: string
    ): Promise<void> {
        closePopup();

        const {
            parentDirectory,
            activeName
        } = createScriptBreadcrumbPopupContext(segmentPath);
        const entries = await options.listDirectory(parentDirectory);

        if (entries.length === 0) {
            return;
        }

        const nextPopup = document.createElement("div");
        nextPopup.className = "dm-script-crumb-popup";

        entries.forEach((entry) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "dm-script-crumb-popup-item";

            const icon = document.createElement("span");
            icon.className = `codicon ${
                entry.isDirectory
                    ? "codicon-folder-opened"
                    : "codicon-save"
            }`;

            const text = document.createElement("span");
            text.textContent = String(entry.name || "");

            if (String(entry.name || "") === activeName) {
                item.style.background = "#dde8ff";
            }

            item.appendChild(icon);
            item.appendChild(text);
            item.addEventListener("click", (event) => {
                event.stopPropagation();

                const fullPath = resolveScriptBreadcrumbEntry(
                    parentDirectory,
                    String(entry.name || "")
                );

                if (entry.isFile) {
                    void options.openFile(fullPath);
                }

                closePopup();
            });
            nextPopup.appendChild(item);
        });

        document.body.appendChild(nextPopup);
        popup = nextPopup;

        const anchorRect = anchor.getBoundingClientRect();
        const maximumX = window.innerWidth - 16;
        const width = nextPopup.offsetWidth || 260;
        const height = nextPopup.offsetHeight || 200;
        let left = anchorRect.left;
        let top = anchorRect.bottom + 6;

        if (left + width > maximumX) {
            left = Math.max(8, maximumX - width);
        }

        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, anchorRect.top - height - 6);
        }

        nextPopup.style.left = `${Math.round(left)}px`;
        nextPopup.style.top = `${Math.round(top)}px`;
    };

    const render = function(filePath: string): void {
        crumbs.innerHTML = "";
        pathText.textContent = "";

        if (crumbs.parentElement !== pathText) {
            pathText.appendChild(crumbs);
        }

        const model = createScriptBreadcrumbModel(filePath);

        if (!model.fullPath) {
            pathText.title = "";
            return;
        }

        model.breadcrumbs.forEach((breadcrumb, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "dm-script-crumb";
            button.textContent = breadcrumb.label;
            button.title = breadcrumb.filePath;
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                void showPopup(button, breadcrumb.filePath);
            });
            crumbs.appendChild(button);

            if (index < model.breadcrumbs.length - 1) {
                const separator = document.createElement("span");
                separator.className = "dm-script-sep";
                separator.textContent = ">";
                crumbs.appendChild(separator);
            }
        });
        pathText.title = model.fullPath;
    };

    return {
        render,
        closePopup
    };
};
