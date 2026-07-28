import type {
    EvaluatedMenuItem
} from "../core/contracts/applicationComposition";


export interface BrowserMenuAdapterOptions {
    menuBar: HTMLElement;
    isRootDisabled?(item: EvaluatedMenuItem): boolean;
    rootDisabledReason?(item: EvaluatedMenuItem): string;
    onMenuOpening?(): void;
    isActionSupported(item: EvaluatedMenuItem): boolean;
    execute(item: EvaluatedMenuItem): Promise<void> | void;
    onError?(error: unknown): void;
}


export interface BrowserMenuAdapter {
    close(): void;
    render(menu: EvaluatedMenuItem[]): void;
}


const menuLabel = function(item: EvaluatedMenuItem, fallback: string): string {
    return String(item.label || item.id || fallback);
};


export const createBrowserMenuAdapter = function(
    options: BrowserMenuAdapterOptions
): BrowserMenuAdapter {
    const close = function(): void {
        options.menuBar.querySelectorAll(".is-open").forEach((node) => {
            node.classList.remove("is-open");
        });
    };

    const createItemButton = function(
        item: EvaluatedMenuItem,
        hasChildren: boolean
    ): HTMLButtonElement {
        const button = options.menuBar.ownerDocument.createElement("button");

        button.type = "button";
        button.className = "web-menu-item";
        button.textContent = menuLabel(item, "Menu item");
        button.disabled = !hasChildren && (
            !item.enabled || !options.isActionSupported(item)
        );

        if (!item.enabled && item.reason) {
            button.title = item.reason;
        }

        if (hasChildren) {
            const arrow = options.menuBar.ownerDocument.createElement("span");

            arrow.className = "web-menu-item__arrow";
            arrow.textContent = "\u203a";
            button.appendChild(arrow);
            return button;
        }

        button.addEventListener("click", () => {
            Promise.resolve(options.execute(item)).catch((error) => {
                options.onError?.(error);
            });
        });

        return button;
    };

    const createSeparator = function(item: EvaluatedMenuItem): HTMLElement {
        const separator = options.menuBar.ownerDocument.createElement("div");

        separator.className = "web-menu-separator";
        separator.setAttribute("role", "separator");
        separator.setAttribute("aria-hidden", "true");
        if (item.id) {
            separator.dataset.menuSeparator = String(item.id);
        }

        return separator;
    };

    const renderItems = function(
        items: EvaluatedMenuItem[],
        parent: HTMLElement
    ): void {
        for (const item of items || []) {
            if (item?.type === "separator") {
                parent.appendChild(createSeparator(item));
                continue;
            }

            const children = Array.isArray(item.items) ? item.items : [];
            const hasChildren = children.some((child) => {
                return child?.type !== "separator";
            });
            const container = options.menuBar.ownerDocument.createElement("div");
            const button = createItemButton(item, hasChildren);

            container.className = hasChildren
                ? "web-menu-submenu"
                : "web-menu-command";
            container.appendChild(button);

            if (hasChildren) {
                const popup = options.menuBar.ownerDocument.createElement("div");

                popup.className = "web-menu-popup";
                popup.setAttribute("role", "menu");
                renderItems(children, popup);
                container.appendChild(popup);
                container.addEventListener("mouseenter", () => {
                    Array.from(container.parentElement?.children || [])
                        .forEach((sibling) => {
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

    const render = function(menu: EvaluatedMenuItem[]): void {
        options.menuBar.replaceChildren();

        for (const item of menu || []) {
            const root = options.menuBar.ownerDocument.createElement("div");
            const button = options.menuBar.ownerDocument.createElement("button");
            const popup = options.menuBar.ownerDocument.createElement("div");
            const disabledRoot = options.isRootDisabled?.(item) === true;

            root.className = "web-menu-root";
            button.type = "button";
            button.className = "web-menu-button";
            button.textContent = menuLabel(item, "Menu");

            if (disabledRoot) {
                button.disabled = true;
                button.title = options.rootDisabledReason?.(item) || "";
                root.appendChild(button);
                options.menuBar.appendChild(root);
                continue;
            }

            button.setAttribute("aria-haspopup", "menu");
            button.addEventListener("pointerdown", () => {
                options.onMenuOpening?.();
            });
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const open = root.classList.contains("is-open");

                close();
                if (!open) {
                    root.classList.add("is-open");
                }
            });

            popup.className = "web-menu-popup";
            popup.setAttribute("role", "menu");
            renderItems(Array.isArray(item.items) ? item.items : [], popup);
            root.appendChild(button);
            root.appendChild(popup);
            options.menuBar.appendChild(root);
        }
    };

    return {
        close,
        render
    };
};
