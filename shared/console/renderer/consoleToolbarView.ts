export interface ConsoleToolbarRenderState {
    runtimeStatus: string;
    runtimeBusy: boolean;
    workingDirectoryPath: string;
    homeDirectoryPath: string;
    activeDatasetName: string;
}

const elementById = function(document: Document, id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error("Missing console toolbar element: " + id);
    }

    return element;
};

const buttonById = function(document: Document, id: string): HTMLButtonElement {
    return elementById(document, id) as HTMLButtonElement;
};

const normalizePathForDisplayCompare = function(value: string): string {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/\/+$/g, "");
};

export const formatConsoleWorkingDirectory = function(
    pathValue: string,
    homeValue: string
): string {
    const raw = String(pathValue || "").trim();
    const home = normalizePathForDisplayCompare(homeValue);

    if (!raw) {
        return "";
    }

    if (!home) {
        return raw;
    }

    const normalized = normalizePathForDisplayCompare(raw);
    const isWindowsPath = /^[A-Za-z]:\//.test(normalized)
        || /^[A-Za-z]:\//.test(home);
    const comparePath = isWindowsPath ? normalized.toLowerCase() : normalized;
    const compareHome = isWindowsPath ? home.toLowerCase() : home;

    if (comparePath === compareHome) {
        return "~";
    }

    if (comparePath.startsWith(compareHome + "/")) {
        return "~/" + normalized.slice(home.length + 1);
    }

    return raw;
};

export const renderConsoleToolbar = function(
    document: Document,
    state: ConsoleToolbarRenderState
): void {
    const status = String(state.runtimeStatus || "not-started");
    const isReady = status === "ready";
    const isStarting = status === "starting";
    const cwdButton = elementById(document, "consoleCwd");
    const cwdText = elementById(document, "consoleCwdText");
    const activeDataset = elementById(document, "consoleActiveDataset");
    const activeDatasetLabel = elementById(document, "consoleActiveDatasetLabel");
    const activeDatasetName = elementById(document, "consoleActiveDatasetName");
    const workingDirectoryDisplay = formatConsoleWorkingDirectory(
        state.workingDirectoryPath,
        state.homeDirectoryPath
    );
    const datasetName = String(state.activeDatasetName || "").trim();

    document.body.classList.toggle(
        "console-runtime-busy",
        state.runtimeBusy
    );
    cwdText.textContent = workingDirectoryDisplay
        || "(working directory pending)";
    cwdText.title = state.workingDirectoryPath || "";
    cwdButton.title = state.workingDirectoryPath || "Set working directory";
    activeDatasetLabel.textContent = "Active:";

    if (datasetName) {
        activeDataset.hidden = false;
        activeDataset.title = datasetName;
        activeDataset.setAttribute(
            "aria-label",
            "Active dataset: " + datasetName
        );
        activeDatasetName.textContent = datasetName;
    }
    else {
        activeDataset.hidden = true;
        activeDataset.removeAttribute("title");
        activeDataset.removeAttribute("aria-label");
        activeDatasetName.textContent = "";
    }

    buttonById(document, "consoleToolbarStart").disabled = isReady || isStarting;
    buttonById(document, "consoleToolbarStop").disabled = !state.runtimeBusy;
    buttonById(document, "consoleToolbarRestart").disabled = isStarting;
    buttonById(document, "consoleToolbarRestartWorkspace").disabled = isStarting;
};
