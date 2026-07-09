import type {
    ProductConsoleStateChip
} from "../../core/contracts/productContribution";


export interface ConsoleToolbarRenderState {
    runtimeStatus: string;
    runtimeBusy: boolean;
    workingDirectoryPath: string;
    homeDirectoryPath: string;
    activeDatasetName: string;
    productStateChips: ProductConsoleStateChip[];
    translate(key: string): string;
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
    const productStateChips = elementById(document, "consoleProductStateChips");
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
    activeDatasetLabel.textContent = state.translate("Active") + ":";

    if (datasetName) {
        activeDataset.hidden = false;
        activeDataset.title = datasetName;
        activeDataset.setAttribute(
            "aria-label",
            state.translate("Active dataset") + ": " + datasetName
        );
        activeDatasetName.textContent = datasetName;
    }
    else {
        activeDataset.hidden = true;
        activeDataset.removeAttribute("title");
        activeDataset.removeAttribute("aria-label");
        activeDatasetName.textContent = "";
    }

    productStateChips.replaceChildren();
    if (datasetName) {
        state.productStateChips.forEach((stateChip) => {
            const value = String(stateChip.value || "").trim();

            if (!value) {
                return;
            }

            const chip = document.createElement("span");
            const label = document.createElement("span");
            const valueElement = document.createElement("span");

            chip.className = "dm-console-state-chip";
            chip.dataset.productStateChip = stateChip.id;
            chip.title = value;
            chip.setAttribute(
                "aria-label",
                state.translate(stateChip.accessibilityLabelKey) + ": " + value
            );
            label.className = "dm-console-state-chip-label";
            label.textContent = state.translate(stateChip.labelKey) + ":";
            valueElement.className = "dm-console-state-chip-value";
            valueElement.textContent = value;
            chip.append(label, valueElement);
            productStateChips.appendChild(chip);
        });
    }

    buttonById(document, "consoleToolbarStart").disabled = isReady || isStarting;
    buttonById(document, "consoleToolbarStop").disabled = !state.runtimeBusy;
    buttonById(document, "consoleToolbarRestart").disabled = isStarting;
    buttonById(document, "consoleToolbarRestartWorkspace").disabled = isStarting;
};
