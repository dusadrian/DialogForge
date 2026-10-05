export const renderWorkspacePaneToggle = function(
    document: Document,
    visible: boolean,
    translate: (key: string) => string = (key) => key
): void {
    const button = document.getElementById("workspacePaneToggle");

    if (!button) {
        throw new Error("Missing workspace pane toggle button.");
    }

    const label = translate(visible ? "Hide Workspace" : "Show Workspace");
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);

    const icon = button.querySelector(".codicon");

    if (icon) {
        icon.classList.toggle("codicon-chevron-left", visible);
        icon.classList.toggle("codicon-chevron-right", !visible);
    }
};
