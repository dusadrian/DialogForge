export type AuxiliarySurfaceKind =
    | "modal"
    | "panel"
    | "route";


export interface AuxiliarySurfaceDefinition {
    id: string;
    label: string;
    kind: AuxiliarySurfaceKind;
    pagePath: string;
    state: "mapped" | "pending-runtime-wiring";
    notes: string;
}


const auxiliarySurfaces: AuxiliarySurfaceDefinition[] = [
    {
        id: "settings",
        label: "Settings",
        kind: "modal",
        pagePath: "src/base-app/pages/settings.html",
        state: "mapped",
        notes: "Settings uses host storage instead of Electron settings files."
    },
    {
        id: "help",
        label: "Help",
        kind: "panel",
        pagePath: "src/base-app/pages/helpWindow.html",
        state: "pending-runtime-wiring",
        notes: "Help lookup needs host runtime-help transport wiring."
    },
    {
        id: "about",
        label: "About",
        kind: "modal",
        pagePath: "src/base-app/pages/about.html",
        state: "mapped",
        notes: "About can render as a simple modal surface."
    },
    {
        id: "plotViewer",
        label: "Plot Viewer",
        kind: "panel",
        pagePath: "src/base-app/pages/plotViewer.html",
        state: "pending-runtime-wiring",
        notes: "Plot images need host download/copy handling and runtime plot events."
    },
    {
        id: "scriptEditor",
        label: "Script Editor",
        kind: "route",
        pagePath: "src/base-app/pages/scriptEditor.html",
        state: "pending-runtime-wiring",
        notes: "Script Editor needs host file persistence and run-code transport wiring."
    },
    {
        id: "dataEditor",
        label: "Data Editor",
        kind: "route",
        pagePath: "src/base-app/pages/datasetEditor.html",
        state: "pending-runtime-wiring",
        notes: "Data Editor needs host tabular IPC replacement and storage-aware imports."
    }
];


export const listAuxiliarySurfaces = function(): AuxiliarySurfaceDefinition[] {
    return auxiliarySurfaces.map((surface) => {
        return Object.assign({}, surface);
    });
};


export const findAuxiliarySurface = function(
    id: string
): AuxiliarySurfaceDefinition | null {
    const surface = auxiliarySurfaces.find((candidate) => {
        return candidate.id === id;
    });

    return surface ? Object.assign({}, surface) : null;
};
