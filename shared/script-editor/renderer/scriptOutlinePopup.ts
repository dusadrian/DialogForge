export interface ScriptOutlinePopupSymbol {
    name: string;
    lineNumber: number;
}


export interface ScriptOutlinePopupOptions<Symbol extends ScriptOutlinePopupSymbol> {
    anchor: HTMLElement;
    symbols: Symbol[];
    lineLabel: string;
    select(symbol: Symbol): void;
}


export const removeScriptOutlinePopup = function(
    popup: HTMLElement | null
): void {
    try {
        popup?.remove();
    } catch {}
};


export const showScriptOutlinePopup = function<
    Symbol extends ScriptOutlinePopupSymbol
>(
    options: ScriptOutlinePopupOptions<Symbol>
): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "dm-script-outline-popup";

    options.symbols.forEach((symbol) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "dm-script-outline-popup-item";

        const icon = document.createElement("span");
        icon.className = "codicon codicon-symbol-function";

        const name = document.createElement("span");
        name.className = "dm-script-outline-popup-name";
        name.textContent = symbol.name;

        const line = document.createElement("span");
        line.className = "dm-script-outline-popup-line";
        line.textContent = `${options.lineLabel} ${symbol.lineNumber}`;

        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(line);
        item.addEventListener("click", (event) => {
            event.stopPropagation();
            options.select(symbol);
        });
        popup.appendChild(item);
    });

    document.body.appendChild(popup);

    const anchorRect = options.anchor.getBoundingClientRect();
    const maximumX = window.innerWidth - 8;
    const width = popup.offsetWidth || 260;
    const height = popup.offsetHeight || 220;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 6;

    if (left + width > maximumX) {
        left = Math.max(8, maximumX - width);
    }

    if (top + height > window.innerHeight - 8) {
        top = Math.max(8, anchorRect.top - height - 6);
    }

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
    return popup;
};
