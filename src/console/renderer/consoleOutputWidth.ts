export const readConsoleOutputWidth = function(
    documentRef: Document,
    windowRef: Window
): number | null {
    let probe: HTMLSpanElement | null = null;

    try {
        const terminal = documentRef.getElementById("consoleTerminal");
        const root = terminal?.firstElementChild instanceof HTMLElement
            ? terminal.firstElementChild
            : terminal;
        const viewport = root?.firstElementChild instanceof HTMLElement
            ? root.firstElementChild
            : terminal;
        const rect = viewport?.getBoundingClientRect?.();
        const style = viewport ? windowRef.getComputedStyle(viewport) : null;
        const horizontalPadding = style
            ? Number.parseFloat(style.paddingLeft || "0")
                + Number.parseFloat(style.paddingRight || "0")
            : 0;
        const width = Number(rect?.width || 0) - Math.max(0, horizontalPadding || 0);

        if (!Number.isFinite(width) || width <= 0) {
            return null;
        }

        probe = documentRef.createElement("span");
        probe.textContent = "0000000000";
        probe.style.position = "absolute";
        probe.style.left = "-10000px";
        probe.style.top = "-10000px";
        probe.style.visibility = "hidden";
        probe.style.whiteSpace = "pre";

        if (style) {
            probe.style.fontFamily = style.fontFamily;
            probe.style.fontSize = style.fontSize;
            probe.style.fontWeight = style.fontWeight;
            probe.style.letterSpacing = style.letterSpacing;
        }

        (terminal || documentRef.body).appendChild(probe);
        const characterWidth = Number(probe.getBoundingClientRect?.().width || 0) / 10;

        if (!Number.isFinite(characterWidth) || characterWidth <= 0) {
            return null;
        }

        return Math.max(80, Math.min(360, Math.floor(width / characterWidth)));
    }
    catch {
        return null;
    }
    finally {
        try {
            probe?.remove();
        }
        catch {
            // An unavailable layout probe must not prevent command submission.
        }
    }
};
