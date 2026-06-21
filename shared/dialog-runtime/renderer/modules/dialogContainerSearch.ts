import type {
    RuntimeControl,
    SearchableContainerControl
} from "./dialogRuntimeTypes";

export interface DialogContainerSearch {
    setHovered: (control: SearchableContainerControl) => void;
    clearHovered: (control: SearchableContainerControl) => void;
    close: (clearQuery?: boolean) => void;
}

const isSearchableContainer = function(
    control: RuntimeControl | null
): control is SearchableContainerControl {
    if (
        !control
        || control.kind !== "container"
        || !(control.host instanceof HTMLElement)
        || !control.visible
        || !control.enabled
        || !control.autoSearchEnabled
    ) {
        return false;
    }

    return Boolean(control.host.querySelector(".container-content"));
};

export const createDialogContainerSearch = function(
    document: Document
): DialogContainerSearch {
    let hovered: SearchableContainerControl | null = null;
    let active: SearchableContainerControl | null = null;
    let overlay: HTMLDivElement | null = null;
    let input: HTMLInputElement | null = null;

    const positionOverlay = function(
        control: SearchableContainerControl,
        target: HTMLDivElement
    ): void {
        const paper = document.getElementById("paper");

        if (!(paper instanceof HTMLElement)) {
            return;
        }

        const hostRect = control.host.getBoundingClientRect();
        const paperRect = paper.getBoundingClientRect();
        const overlayHeight = target.offsetHeight || 26;
        const spacing = 4;
        const top = Math.max(
            0,
            hostRect.top - paperRect.top - overlayHeight - spacing
        );
        const left = Math.max(
            0,
            hostRect.left - paperRect.left
        );
        const maxWidth = Math.max(
            120,
            paperRect.width - left
        );

        target.style.top = top + "px";
        target.style.left = left + "px";
        target.style.width = Math.min(
            hostRect.width,
            maxWidth
        ) + "px";
    };

    const close = function(clearQuery = true): void {
        const current = active;
        const currentOverlay = overlay;

        if (currentOverlay) {
            try {
                currentOverlay.remove();
            }
            catch {
                try {
                    currentOverlay.parentElement?.removeChild(
                        currentOverlay
                    );
                }
                catch {}
            }
        }

        if (current && clearQuery) {
            current.searchQuery = "";
            current.applySearchFilter();
        }

        if (current?.host instanceof HTMLElement) {
            delete current.host.dataset.searchActive;
        }

        active = null;
        overlay = null;
        input = null;
    };

    const open = function(control: RuntimeControl | null): void {
        if (!isSearchableContainer(control)) {
            return;
        }

        if (active && active !== control) {
            close(true);
        }

        if (active === control && input) {
            input.focus();
            input.select();
            return;
        }

        const nextOverlay = document.createElement("div");

        nextOverlay.className = "preview-container-search";

        const nextInput = document.createElement("input");

        nextInput.type = "text";
        nextInput.className = "preview-container-search-input";
        nextInput.placeholder = "Search";
        nextInput.value = String(control.searchQuery || "");
        nextInput.setAttribute("aria-label", "Search in container");
        nextInput.addEventListener("input", function() {
            control.searchQuery = String(nextInput.value || "");
            control.applySearchFilter();
        });
        nextInput.addEventListener(
            "keydown",
            function(event: KeyboardEvent) {
                if (event.key !== "Escape" && event.key !== "Esc") {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                close(true);
            }
        );
        nextInput.addEventListener("blur", function() {
            if (!String(nextInput.value || "").trim()) {
                close(true);
            }
        });

        nextOverlay.appendChild(nextInput);

        const paper = document.getElementById("paper");
        const parent = paper instanceof HTMLElement
            ? paper
            : control.host;

        parent.appendChild(nextOverlay);
        control.host.dataset.searchActive = "true";
        active = control;
        overlay = nextOverlay;
        input = nextInput;
        control.applySearchFilter();

        queueMicrotask(function() {
            positionOverlay(control, nextOverlay);
            nextInput.focus();
            nextInput.select();
        });
    };

    document.addEventListener(
        "keydown",
        function(event: KeyboardEvent) {
            const key = String(event.key || event.code || "");
            const lowerKey = key.toLowerCase();

            if ((event.metaKey || event.ctrlKey) && lowerKey === "f") {
                event.preventDefault();
                event.stopPropagation();

                if (hovered) {
                    open(hovered);
                    return;
                }

                if (active) {
                    open(active);
                }
                return;
            }

            if (
                (key === "Escape" || key === "Esc")
                && active
            ) {
                close(true);
                event.preventDefault();
                event.stopPropagation();
            }
        }
    );

    return {
        setHovered: function(
            control: SearchableContainerControl
        ): void {
            hovered = control;
        },
        clearHovered: function(
            control: SearchableContainerControl
        ): void {
            if (hovered === control) {
                hovered = null;
            }
        },
        close
    };
};
