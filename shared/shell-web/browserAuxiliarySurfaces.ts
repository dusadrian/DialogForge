export type BrowserAuxiliarySurfaceKind =
    | "modal"
    | "panel"
    | "route";


export interface BrowserAuxiliarySurfaceDefinition {
    id: string;
    label: string;
    kind: BrowserAuxiliarySurfaceKind;
    pagePath: string;
    state: "mapped" | "pending-runtime-wiring";
    notes: string;
}


const auxiliarySurfaces: BrowserAuxiliarySurfaceDefinition[] = [
    {
        id: "settings",
        label: "Settings",
        kind: "modal",
        pagePath: "shared/base-app/pages/settings.html",
        state: "mapped",
        notes: "Settings uses browser storage instead of Electron settings files."
    },
    {
        id: "help",
        label: "Help",
        kind: "panel",
        pagePath: "shared/base-app/pages/helpWindow.html",
        state: "pending-runtime-wiring",
        notes: "Help lookup needs browser-host runtime-help transport wiring."
    },
    {
        id: "about",
        label: "About",
        kind: "modal",
        pagePath: "shared/base-app/pages/about.html",
        state: "mapped",
        notes: "About can render as a simple browser modal surface."
    },
    {
        id: "plotViewer",
        label: "Plot Viewer",
        kind: "panel",
        pagePath: "shared/base-app/pages/plotViewer.html",
        state: "pending-runtime-wiring",
        notes: "Plot images need browser download/copy handling and runtime plot events."
    },
    {
        id: "scriptEditor",
        label: "Script Editor",
        kind: "route",
        pagePath: "shared/base-app/pages/scriptEditor.html",
        state: "pending-runtime-wiring",
        notes: "Script Editor needs browser file persistence and run-code transport wiring."
    },
    {
        id: "dataEditor",
        label: "Data Editor",
        kind: "route",
        pagePath: "shared/base-app/pages/datasetEditor.html",
        state: "pending-runtime-wiring",
        notes: "Data Editor needs browser-host tabular IPC replacement and storage-aware imports."
    }
];


export const listBrowserAuxiliarySurfaces = function(): BrowserAuxiliarySurfaceDefinition[] {
    return auxiliarySurfaces.map((surface) => {
        return Object.assign({}, surface);
    });
};


export const findBrowserAuxiliarySurface = function(
    id: string
): BrowserAuxiliarySurfaceDefinition | null {
    const surface = auxiliarySurfaces.find((candidate) => {
        return candidate.id === id;
    });

    return surface ? Object.assign({}, surface) : null;
};
