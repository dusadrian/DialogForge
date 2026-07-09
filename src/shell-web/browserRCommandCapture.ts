export const readBrowserConsoleOutputWidth = function(
    documentRef: Document = document,
    windowRef: Window = window
): number {
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
        return 120;
    }

    const probe = documentRef.createElement("span");
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
    const characterWidth = Math.max(
        1,
        Number(probe.getBoundingClientRect?.().width || 0) / 10
    );
    probe.remove();

    return Math.max(80, Math.min(360, Math.floor(width / characterWidth)));
};
