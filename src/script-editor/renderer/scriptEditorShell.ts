export interface ScriptEditorShell {
    shell: HTMLDivElement;
    tabsBar: HTMLDivElement;
    pathText: HTMLSpanElement;
    breadcrumbs: HTMLSpanElement;
    editorHost: HTMLDivElement;
}


export const createScriptEditorShell = function(
    toolbar: HTMLElement
): ScriptEditorShell {
    const shell = document.createElement("div");
    shell.style.display = "flex";
    shell.style.flexDirection = "column";
    shell.style.height = "100%";
    shell.style.minHeight = "0";
    shell.style.background = "#f8f8f8";

    const tabsBar = document.createElement("div");
    tabsBar.className = "dm-script-tabs";

    const pathBar = document.createElement("div");
    pathBar.className = "dm-script-pathbar";

    const pathText = document.createElement("span");
    pathText.className = "dm-script-pathbar-text";

    const breadcrumbs = document.createElement("span");
    breadcrumbs.className = "dm-script-breadcrumbs";
    pathText.appendChild(breadcrumbs);
    pathBar.appendChild(pathText);

    const editorHost = document.createElement("div");
    editorHost.style.flex = "1 1 auto";
    editorHost.style.minHeight = "0";
    editorHost.style.background = "#f8f8f8";

    shell.appendChild(toolbar);
    shell.appendChild(tabsBar);
    shell.appendChild(pathBar);
    shell.appendChild(editorHost);

    return {
        shell,
        tabsBar,
        pathText,
        breadcrumbs,
        editorHost
    };
};
