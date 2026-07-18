import {
    createDialogBindingState
} from "/browser-esm/src/dialog-runtime/custom-js/dialogBindings.js";
import {
    routeDialogStateCall
} from "/browser-esm/src/dialog-runtime/custom-js/dialogStateCallRouter.js";
import {
    routeDialogHostExternalCall
} from "/browser-esm/src/dialog-runtime/custom-js/dialogHostExternalCallRouter.js";
import {
    readDialogConsoleStateChips
} from "/browser-esm/src/core/contracts/productContribution.js";
import {
    createWorkspacePane
} from "/browser-esm/src/base-app/features/workspace-pane/workspacePane.js";
import {
    normalizeConsoleCommandText,
    normalizeConstructedConsoleCommandText
} from "/browser-esm/src/console/commandText.js";
import {
    createConsoleHistorySettingsStore
} from "/browser-esm/src/console/services/consoleHistorySettingsStore.js";
import {
    createMainDialogCommandPreviewController
} from "/browser-esm/src/base-app/features/dialog-host/mainDialogCommandPreviewController.js";
import {
    createMainMenuCommandHandler
} from "/browser-esm/src/base-app/features/menu-commands/mainMenuCommandRouter.js";
import {
    isDatasetGoToCommand,
    isDatasetOpenActiveCommand,
    isPlotViewerOpenCommand,
    isSupportedAuxiliaryShellCommand
} from "/browser-esm/src/base-app/features/menu-commands/menuCommandGroups.js";
import {
    createWebRDatasetChannelAdapter
} from "/browser-esm/src/runtime/providers/webr/webRDatasetChannelAdapter.js";
import {
    createWebRDatasetEditorRuntimeBindings
} from "/browser-esm/src/runtime/providers/webr/webRDatasetEditorRuntimeBindings.js";
import {
    createDialogChannelAdapter
} from "/browser-esm/src/dialog-runtime/dialogChannelAdapter.js";
import {
    createDialogExternalCallHost
} from "/browser-esm/src/dialog-runtime/custom-js/externalCallHost.js";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} from "/browser-esm/src/dialog-runtime/dialogRuntimeIpc.js";
import {
    readDialogContentSize
} from "/browser-esm/src/base-app/features/dialog-host/dialogContentAdapter.js";
import {
    createProductDialogWorkspaceDataFromEntries,
    readProductDialogDatasetDescriptors
} from "/browser-esm/src/dialog-runtime/dialog-builder/productDialogWorkspaceData.js";
import {
    createBrowserImportAdapter
} from "/browser-esm/src/shell-web/browserImportAdapter.js";
import {
    createBrowserModelessSurfaceController,
    createBrowserFrameSurfaceController
} from "/browser-esm/src/shell-web/browserFrameSurface.js";
import {
    createGeneralChannelAdapter
} from "/browser-esm/src/base-app/clipboard/generalChannelAdapter.js";
import {
    createBrowserHostAdapter
} from "/browser-esm/src/shell-web/browserHostAdapter.js";
import {
    createBrowserLiveScriptTransport
} from "/browser-esm/src/shell-web/browserLiveScriptTransport.js";
import {
    readLiveScriptJoinTextFromUrl
} from "/browser-esm/src/script-editor/collaboration/liveScriptTicket.js";
import {
    createBrowserMenuAdapter
} from "/browser-esm/src/shell-web/browserMenuAdapter.js";
import {
    createBrowserConsoleBootstrap,
    exposeBrowserConsoleHandle
} from "/browser-esm/src/shell-web/browserConsoleBootstrap.js";
import {
    createBrowserProductWorkingDirectory,
    findBrowserCompositionProductDialog,
    findBrowserCompositionSharedDialog,
    loadBrowserComposition
} from "/browser-esm/src/shell-web/browserCompositionClient.js";
import {
    createBrowserDataEditorSurface
} from "/browser-esm/src/shell-web/browserDataEditorSurface.js?v=20260709-data-editor-tabs";
import {
    findBrowserDialogLayerForMessage
} from "/browser-esm/src/shell-web/browserDialogSurface.js";
import {
    createBrowserHelpViewerSurface
} from "/browser-esm/src/shell-web/browserHelpViewerSurface.js";
import {
    createBrowserWorkbenchLayout
} from "/browser-esm/src/shell-web/browserWorkbenchLayout.js";
import {
    createBrowserWebRCompletionSessionManager,
    readWebRConsoleCompletionResult
} from "/browser-esm/src/runtime/providers/webr/webRConsoleCompletionAdapter.js";
import {
    executeWebRRuntimeMethod
} from "/browser-esm/src/runtime/providers/webr/webRRuntimeMethodRouter.js";
import {
    createWebRPromptCoordinator
} from "/browser-esm/src/runtime/providers/webr/webRPromptBridge.js";
import {
    getRCompletionContext
} from "/browser-esm/src/runtime/providers/r/completions/rCompletionContext.js";
import {
    readRRequestedPackages
} from "/browser-esm/src/runtime/providers/r/completions/rRequestedPackages.js";
import {
    rDefaultTerminalSymbols
} from "/browser-esm/src/runtime/providers/r/completions/rCompletionDefaults.js";
import {
    filterRInternalCompletionSymbols,
    rInternalCompletionSymbolNames
} from "/browser-esm/src/runtime/providers/r/completions/rInternalCompletionSymbols.js";
import {
    createBrowserWebRSessionSnapshot,
    startBrowserWebRRuntime,
    stopBrowserWebRRuntime
} from "/browser-esm/src/runtime/providers/webr/webRBrowserStartup.js";
import {
    fetchWebRHelpPageByUrl,
    fetchWebRHelpHomeDocument,
    fetchWebRHelpTopicDocument,
    runWebRHelpExample
} from "/browser-esm/src/runtime/providers/webr/webRHelpDocument.js";
import {
    parseHelpCommandUrl
} from "/browser-esm/src/runtime/help/helpCommandUrl.js";
import {
    buildRContextualHelpRequest,
    parseRConsoleHelpCommand
} from "/browser-esm/src/runtime/providers/r/help/rContextualHelp.js";
import {
    buildRClearWorkspaceCommand,
    buildRRemoveWorkspaceObjectCommand
} from "/browser-esm/src/runtime/providers/r/workspace/rWorkspaceSnapshotCommands.js";
import {
    createWebRDirectRuntimeTransport
} from "/browser-esm/src/runtime/providers/webr/webRDirectRuntimeTransport.js";
import {
    createWebRWorkspaceController
} from "/browser-esm/src/runtime/providers/webr/webRWorkspaceController.js";
import {
    ensureWebRDirectory
} from "/browser-esm/src/runtime/providers/webr/webRFileSystem.js";
import {
    createWorkspaceSnapshot
} from "/browser-esm/src/runtime/workspace/workspaceProtocol.js";
import {
    closeBrowserCapturedPlotImages,
    copyBrowserPlot,
    createBrowserPlotViewerHost,
    saveBrowserPlot
} from "/browser-esm/src/shell-web/browserPlotAdapter.js";
import {
    fetchBrowserJsonIfAvailable,
    mountBrowserProductPackageLibrary
} from "/browser-esm/src/runtime/providers/webr/webRBrowserPackageLibraryAdapter.js";
import {
    browserMoodleLaunchScriptEditorCode,
    loadBrowserMoodleLaunchDataset,
    readBrowserMoodleLaunchCode
} from "/browser-esm/src/shell-web/browserMoodleLaunchAdapter.js";
import {
    createBrowserPreloadHostRouter
} from "/browser-esm/src/shell-web/browserPreloadHostRouter.js";
import {
    createBrowserPreloadChannelBridge
} from "/browser-esm/src/shell-web/browserPreloadChannelBridge.js";
import {
    readBrowserConsoleOutputWidth
} from "/browser-esm/src/shell-web/browserRCommandCapture.js";
import {
    isRPlotCommand
} from "/browser-esm/src/runtime/providers/r/commands/rCommandIntents.js";
import {
    captureWebRHiddenText,
    executeWebRSourceVisibleCommand,
    prewarmWebRGraphicsCapture as runWebRGraphicsPrewarm
} from "/browser-esm/src/runtime/providers/webr/webRCommandCapture.js";
import {
    createWebRVisibleCommandRunner
} from "/browser-esm/src/runtime/providers/webr/webRVisibleCommandRunner.js";
import {
    createWebRRuntimePackageAdapter
} from "/browser-esm/src/runtime/providers/webr/webRRuntimePackageAdapter.js";
import {
    isWebRSessionPackageMenuCommand
} from "/browser-esm/src/runtime/providers/webr/webRPackageMenuPolicy.js";
import {
    executeWebRInvisibleMutation
} from "/browser-esm/src/runtime/providers/webr/webRInvisibleMutationAdapter.js";
import {
    createBrowserRuntimeProgressController
} from "/browser-esm/src/shell-web/browserRuntimeProgressAdapter.js";
import {
    installBrowserShellEventBindings
} from "/browser-esm/src/shell-web/browserShellEventBindings.js";
import {
    installBrowserSharedPageBridge,
    waitForBrowserAnimationFrameSettled,
    waitForBrowserPageFullyLoaded
} from "/browser-esm/src/shell-web/browserSharedPageBridge.js";
import {
    createBrowserScriptFileAdapter
} from "/browser-esm/src/shell-web/browserScriptFileAdapter.js";
import {
    createBrowserScriptEditorSurface
} from "/browser-esm/src/shell-web/browserScriptEditorSurface.js";
import {
    createBrowserStorageAdapter
} from "/browser-esm/src/shell-web/browserStorageAdapter.js";
import {
    datasetEditorEventChannels
} from "/browser-esm/src/dataset-editor/datasetEditorIpc.js";
import {
    readScriptBaseName
} from "/browser-esm/src/script-editor/files/scriptPath.js";
import {
    createScriptChannelAdapter
} from "/browser-esm/src/script-editor/scriptChannelAdapter.js";
import {
    isLikelyIncompleteScriptFragment
} from "/browser-esm/src/script-editor/run/scriptFragmentHeuristic.js";
import {
    checkRScriptFragmentCompleteness
} from "/browser-esm/src/runtime/providers/r/script/rScriptFragmentCompleteness.js";
import {
    installBrowserDraggableSurface,
    installBrowserResizableSurface
} from "/browser-esm/src/shell-web/browserSurfaceGeometry.js";
import {
    createWorkspaceChannelAdapter
} from "/browser-esm/src/base-app/features/workspace-pane/workspaceChannelAdapter.js";
import {
    createBrowserZoomAdapter
} from "/browser-esm/src/shell-web/browserZoomAdapter.js";
import {
    localeDisplayName
} from "/browser-esm/src/base-app/i18n/localeDisplayName.js";

const state = {
    composition: null,
    runtime: null,
    runtimeStartPromise: null,
    runtimeReady: false,
    runtimeStarting: false,
    moodleLaunchCode: "",
    moodleLaunchCodeProcessed: false,
    moodleLaunchScriptEditorOpened: false,
    console: null,
    commandPreviewText: "",
    commandPreviewDialogId: "",
    commandPreviewColorizer: null,
    commandPreviewController: null,
    dialogOpeningCover: null,
    dialogOpeningCoverId: "",
    productStateChips: [],
    dialogBindingState: createDialogBindingState(),
    dialogExternalCallHost: null,
    commandHistory: null,
    loadedRuntimePackages: new Set(),
    datasetChannelAdapter: null,
    datasetEditorRuntimeBindings: null,
    dialogChannelAdapter: null,
    generalChannelAdapter: null,
    browserImportAdapter: null,
    runtimePackageAdapter: null,
    browserRuntimeProgressController: null,
    completionSessionManager: null,
    workspaceController: null,
    workspaceControllerRuntime: null,
    scriptChannelAdapter: null,
    browserScriptEditorSurface: null,
    browserLiveScriptTransport: null,
    workspaceChannelAdapter: null,
    browserFrameSurfaces: null,
    browserDataEditorSurface: null,
    browserPlotViewerHost: null,
    browserHelpViewerSurface: null,
    browserWorkbenchLayout: null,
    settingsLayer: null,
    devDiagnosticsLayer: null,
    promptCoordinator: null,
    visibleCommandRunner: null,
    workingDirectoryPath: "/web",
    homeDirectoryPath: "",
    activeDatasetName: "",
    plotViewerGraphicsWarmupPromise: null,
    plotViewerGraphicsWarm: false,
    dataEditor: {
        layer: null,
        frame: null,
        datasetName: "",
        activeTab: "data",
        selectedCell: null,
        selectedColumn: "",
        selectedRow: 0,
        editingColumnName: "",
        editingRowIndex: 0,
        selectedVariableIndex: 0,
        variableSelection: {
            selectedRowIndex: -1,
            activeRowIndex: -1,
            activeCell: null,
            range: null
        },
        contextMenu: {
            kind: "",
            target: null
        },
        cache: new Map(),
        variableColumnWidths: {
            index: 58,
            name: 140,
            type: 116,
            width: 70,
            decimals: 78,
            label: 220,
            values: 108,
            align: 86,
            measure: 96
        }
    },
    scriptEditor: {
        layer: null,
        frame: null,
        editor: null,
        model: null,
        closeConfirmLayer: null,
        closeConfirmPromise: null,
        dirty: false,
        fileName: "Untitled.R",
        content: "",
        ignoreChanges: false,
        monaco: null,
        scriptStatement: null,
        tabs: [],
        activeTabId: "",
        sessionRestoring: false,
        sessionPersistTimer: null
    },
    workspacePane: null,
    browserMenuAdapter: null,
    workspaceSnapshot: {
        status: "ready",
        providerId: "webr",
        objects: [],
        message: "",
        refreshedAt: new Date().toISOString()
    }
};

const dialogRuntimePackageRequirements = {
    frequencies: ["admisc", "declared"],
    crosstable: ["admisc", "declared"],
    summaries: ["admisc", "declared"],
    independentsamplesttest: ["statistics"]
};

const elements = {
    menuBar: document.getElementById("webMenuBar"),
    workspaceSummary: document.getElementById("workspaceSummary")
};

const normalizeCommandText = normalizeConsoleCommandText;
const normalizeConstructedCommandText = normalizeConstructedConsoleCommandText;

const modelessSurfaces = createBrowserModelessSurfaceController(() => [
    {
        id: "workbench",
        element: document.getElementById("webWorkbenchWindow")
    },
    {
        id: "scriptEditor",
        element: state.scriptEditor.layer
    },
    {
        id: "dataEditor",
        element: state.dataEditor.layer
    },
    {
        id: "settings",
        element: state.settingsLayer
    },
    {
        id: "devDiagnostics",
        element: state.devDiagnosticsLayer
    },
    {
        id: "plotViewer",
        element: state.browserPlotViewerHost?.layer()
    }
]);

const activateModelessSurface = modelessSurfaces.activate;
const installModelessSurfaceActivation = modelessSurfaces.installActivation;

const escapeHtml = function (value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
};

const browserHostAdapter = createBrowserHostAdapter();
const browserApplicationStorageAdapter = createBrowserStorageAdapter({
    settingsKey: "dialogforge.settings"
});
const browserZoomAdapter = createBrowserZoomAdapter({
    document,
    window,
    storage: browserApplicationStorageAdapter
});
const browserStorageAdapter = createBrowserStorageAdapter({
    settingsKey: "dialogforge.web.console.history"
});
const browserConsoleHistoryStore = createConsoleHistorySettingsStore({
    defaultProductId: "base",
    defaultRuntimeId: "webr",
    maximumItems: 500,
    readSettings: browserStorageAdapter.readSettings,
    writeSettings: browserStorageAdapter.writeSettings
});

const readSelectedLocale = function () {
    const settings = browserApplicationStorageAdapter.readSettings();

    return String(settings.defaultLanguage || settings.languageNS || "en_US").trim() || "en_US";
};

const webTerminalDefaults = {
    fontFamily: "\"Dialog Mono\", monospace",
    cursorStyle: "bar",
    cursorBlink: true,
    selectionBackground: "rgba(86, 156, 214, 0.42)",
    startQuiet: false,
    inputMode: "console",
    showFullErrorContext: false
};

const webSettingsFontOptions = [
    {
        value: "\"Dialog Mono\", monospace",
        label: "Liberation Mono"
    },
    {
        value: "\"JetBrains Mono\", \"Dialog Mono\", monospace",
        label: "JetBrains Mono"
    },
    {
        value: "\"Fira Code\", \"Dialog Mono\", monospace",
        label: "Fira Code"
    },
    {
        value: "\"Source Code Pro\", \"Dialog Mono\", monospace",
        label: "Source Code Pro"
    }
];

const webSettingsCursorOptions = ["bar", "block", "underline"];

const readTerminalSettings = function () {
    const settings = browserApplicationStorageAdapter.readSettings();
    const terminalSettings = settings.terminalSettings;
    const productSettings = state.composition?.productSettings;
    const productTerminalSettings = productSettings
        && typeof productSettings === "object"
        && productSettings.terminalSettings
        && typeof productSettings.terminalSettings === "object"
        ? productSettings.terminalSettings
        : {};

    return Object.assign(
        {},
        webTerminalDefaults,
        productTerminalSettings,
        terminalSettings && typeof terminalSettings === "object"
            ? terminalSettings
            : {}
    );
};

const applyWebTerminalSettings = function () {
    const terminalSettings = readTerminalSettings();
    const fontFamily = String(
        terminalSettings.fontFamily || webTerminalDefaults.fontFamily
    );

    document.documentElement.style.setProperty(
        "--dm-console-font-family",
        fontFamily
    );
    document.body.style.setProperty("--dm-console-font-family", fontFamily);
};

const writeSelectedLocale = function (locale) {
    const cleanLocale = String(locale || "").trim();

    if (!cleanLocale) {
        return;
    }

    browserApplicationStorageAdapter.writeSettings(Object.assign(
        {},
        browserApplicationStorageAdapter.readSettings(),
        {
            defaultLanguage: cleanLocale,
            languageNS: cleanLocale
        }
    ));
};

const createSettingsSelect = function (frameDocument, id, options, value) {
    const select = frameDocument.createElement("dm-select");

    select.id = id;

    if (typeof select.setOptions === "function") {
        select.setOptions(options);
    } else {
        options.forEach((option) => {
            const normalized = typeof option === "string"
                ? { value: option, label: option }
                : option;
            const node = frameDocument.createElement("option");

            node.value = normalized.value;
            node.textContent = normalized.label;
            select.appendChild(node);
        });
    }

    select.value = String(value || "");

    return select;
};

const createSettingsCheckbox = function (frameDocument, id, checked) {
    const checkbox = frameDocument.createElement("dm-checkbox");

    checkbox.id = id;
    checkbox.checked = checked === true;

    return checkbox;
};

const createSettingsCheckboxField = function (
    frameDocument,
    grid,
    options
) {
    const field = frameDocument.createElement("div");
    const row = frameDocument.createElement("div");
    const label = frameDocument.createElement("label");
    const checkbox = createSettingsCheckbox(
        frameDocument,
        options.controlId,
        options.checked
    );

    field.className = options.wide
        ? "field wide checkbox-field"
        : "field checkbox-field";
    row.className = "field-inline";
    label.id = options.labelId || "";
    label.htmlFor = options.controlId;
    label.textContent = options.label;
    label.addEventListener("click", (event) => {
        event.preventDefault();
        checkbox.checked = !checkbox.checked;
    });
    row.append(checkbox, label);
    field.appendChild(row);
    grid.appendChild(field);
};

const appendSettingsField = function (
    frameDocument,
    grid,
    options
) {
    const field = frameDocument.createElement("div");
    const label = frameDocument.createElement("label");

    field.className = options.wide
        ? "field wide"
        : "field";
    label.id = options.labelId || "";
    label.htmlFor = options.controlId;
    label.textContent = options.label;
    field.append(label, options.control);
    grid.appendChild(field);
};

const createSettingsColorInput = function (frameDocument, id, value) {
    const row = frameDocument.createElement("div");
    const input = frameDocument.createElement("input");
    const button = frameDocument.createElement("button");

    row.className = "color-input-row";
    input.id = id;
    input.type = "text";
    input.spellcheck = false;
    input.value = String(value || "");

    button.id = `${id}Swatch`;
    button.className = "color-swatch-btn";
    button.type = "button";
    button.title = translateCompositionText("Pick color", "Pick color");
    button.setAttribute("aria-label", button.title);
    button.style.background = input.value || webTerminalDefaults.selectionBackground;
    button.addEventListener("click", () => {
        input.focus();
    });
    input.addEventListener("input", () => {
        button.style.background = input.value || webTerminalDefaults.selectionBackground;
    });

    row.append(input, button);

    return row;
};

const readSettingsControlValue = function (frameDocument, id) {
    return String(frameDocument.getElementById(id)?.value || "");
};

const readSettingsControlChecked = function (frameDocument, id) {
    return frameDocument.getElementById(id)?.checked === true;
};

const writeSettingsControlValue = function (frameDocument, id, value) {
    const control = frameDocument.getElementById(id);

    if (control) {
        control.value = String(value || "");
    }
};

const writeSettingsControlChecked = function (frameDocument, id, checked) {
    const control = frameDocument.getElementById(id);

    if (control) {
        control.checked = checked === true;
    }
};

const updateSettingsColorSwatch = function (frameDocument, id) {
    const input = frameDocument.getElementById(id);
    const button = frameDocument.getElementById(`${id}Swatch`);

    if (button) {
        button.style.background = input?.value || webTerminalDefaults.selectionBackground;
    }
};

const buildWebRuntimeProviderOptions = function () {
    const runtime = state.composition?.runtime || {};
    const id = String(runtime.id || "webr");

    return [{
        value: id,
        label: String(runtime.label || id)
    }];
};

const buildWebLocaleOptions = function () {
    const locales = Array.isArray(state.composition?.availableLocales)
        ? state.composition.availableLocales
        : [];

    if (locales.length === 0) {
        return [{
            value: "en_US",
            label: "English (United States)"
        }];
    }

    return locales.map((locale) => {
        const code = String(locale.code || "").trim();

        return {
            value: code,
            label: String(locale.label || localeDisplayName(code))
        };
    }).filter((locale) => locale.value);
};

const createSettingsFrameHtml = function () {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/base-app/pages/shared/dmTheme.css">
<script src="/src/base-app/pages/shared/dmControls.js"></script>
<style>
html, body {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
    background: #fff;
}
*, *::before, *::after { box-sizing: inherit; }
.settings-shell {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: auto;
    background: #fff;
}
.settings-root {
    box-sizing: border-box;
    width: 100%;
    padding: 20px 24px;
    background: #fff;
    --settings-control-width: 250px;
    --settings-column-gap: 32px;
    --settings-content-width:
        calc((2 * var(--settings-control-width)) + var(--settings-column-gap));
}
h1 {
    margin: 0 0 14px;
    font-size: 17px;
    font-weight: 600;
}
.settings-grid {
    display: flex;
    gap: var(--settings-column-gap);
    width: var(--settings-content-width);
}
.settings-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: var(--settings-control-width);
}
.field {
    display: flex;
    flex-direction: column;
    gap: 5px;
}
.field.wide {
    grid-column: 1 / -1;
}
.field-inline {
    display: flex;
    align-items: center;
    gap: 8px;
}
label {
    color: #222;
    font-size: 12px;
    font-weight: 600;
}
select, dm-select {
    display: block;
    width: var(--settings-control-width);
}
.color-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: var(--settings-control-width);
}
.color-input-row input[type="text"] {
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    height: 24px;
    padding: 1px 6px;
    border: 1px solid #8c8c8c;
    border-radius: 4px;
}
.color-swatch-btn {
    width: 24px;
    height: 24px;
    min-width: 24px;
    padding: 0;
    border: 0.5px solid #000;
    border-radius: 2px;
}
.color-swatch-btn:focus,
.color-swatch-btn:focus-visible {
    outline: none;
    box-shadow: none;
}
.checkbox-field .field-inline {
    gap: 0px;
}
.checkbox-field label {
    cursor: pointer;
    user-select: none;
}
.actions {
    width: var(--settings-content-width);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #e2e2e2;
}
.reset-button {
    margin-right: auto;
}
@media (max-width: 580px) {
    .settings-root {
        --settings-column-gap: 14px;
        --settings-content-width: 100%;
    }

    .settings-grid {
        flex-direction: column;
        gap: 16px;
    }

    .settings-column {
        width: 100%;
        max-width: var(--settings-control-width);
    }

    select, dm-select,
    .color-input-row {
        width: min(var(--settings-control-width), 100%);
    }
}
</style>
</head>
<body>
<div class="settings-shell">
    <div class="settings-root">
        <h1>${escapeHtml(translateCompositionText("Settings", "Settings"))}</h1>
        <div class="settings-grid" id="settingsGrid">
            <div class="settings-column" id="settingsColumn1"></div>
            <div class="settings-column" id="settingsColumn2"></div>
        </div>
        <div class="actions">
            <button id="resetSettings" class="dm-action-button reset-button" type="button">${escapeHtml(translateCompositionText("Reset", "Reset"))}</button>
            <button id="saveSettings" class="dm-action-button" type="button">${escapeHtml(translateCompositionText("Save", "Save"))}</button>
            <button id="cancelSettings" class="dm-action-button" type="button">${escapeHtml(translateCompositionText("Cancel", "Cancel"))}</button>
        </div>
    </div>
</div>
</body>
</html>`;
};


const renderSettingsFrame = function (frame, surface) {
    const frameDocument = frame?.contentDocument;

    if (!frameDocument) {
        return false;
    }

    const col1 = frameDocument.getElementById("settingsColumn1");
    const col2 = frameDocument.getElementById("settingsColumn2");

    if (!col1 || !col2) {
        return false;
    }

    col1.replaceChildren();
    col2.replaceChildren();

    const settings = browserApplicationStorageAdapter.readSettings();
    const terminalSettings = readTerminalSettings();
    const runtimeStartup = settings.runtimeStartup
        && typeof settings.runtimeStartup === "object"
        ? settings.runtimeStartup
        : {};
    const selectedRuntimeProvider = String(
        runtimeStartup.providerId || state.composition?.runtime?.id || "webr"
    );

    appendSettingsField(frameDocument, col1, {
        label: translateCompositionText("Language", "Language"),
        controlId: "defaultLanguage",
        control: createSettingsSelect(
            frameDocument,
            "defaultLanguage",
            buildWebLocaleOptions(),
            settings.defaultLanguage || settings.languageNS || "en_US"
        )
    });
    appendSettingsField(frameDocument, col2, {
        label: translateCompositionText("Runtime provider", "Runtime provider"),
        controlId: "runtimeProvider",
        control: createSettingsSelect(
            frameDocument,
            "runtimeProvider",
            buildWebRuntimeProviderOptions(),
            selectedRuntimeProvider
        )
    });
    appendSettingsField(frameDocument, col1, {
        label: translateCompositionText("Console font", "Console font"),
        controlId: "terminalFont",
        control: createSettingsSelect(
            frameDocument,
            "terminalFont",
            webSettingsFontOptions,
            terminalSettings.fontFamily
        )
    });
    appendSettingsField(frameDocument, col2, {
        label: translateCompositionText("Console cursor", "Console cursor"),
        controlId: "terminalCursorStyle",
        control: createSettingsSelect(
            frameDocument,
            "terminalCursorStyle",
            webSettingsCursorOptions,
            terminalSettings.cursorStyle
        )
    });
    createSettingsCheckboxField(frameDocument, col1, {
        label: translateCompositionText("Console cursor blink", "Console cursor blink"),
        controlId: "terminalCursorBlink",
        checked: Boolean(terminalSettings.cursorBlink)
    });
    appendSettingsField(frameDocument, col2, {
        label: translateCompositionText("Console selection color", "Console selection color"),
        controlId: "terminalSelectionColor",
        control: createSettingsColorInput(
            frameDocument,
            "terminalSelectionColor",
            terminalSettings.selectionBackground
        )
    });
    createSettingsCheckboxField(frameDocument, col1, {
        label: translateCompositionText("Start runtime quietly", "Start runtime quietly"),
        controlId: "terminalQuiet",
        checked: terminalSettings.startQuiet === true
    });
    createSettingsCheckboxField(frameDocument, col1, {
        label: translateCompositionText(
            "Show full console error context",
            "Show full console error context"
        ),
        controlId: "terminalErrorContext",
        checked: Boolean(terminalSettings.showFullErrorContext)
    });
    appendSettingsField(frameDocument, col2, {
        label: translateCompositionText("Input mode", "Input mode"),
        controlId: "terminalInputMode",
        control: createSettingsSelect(
            frameDocument,
            "terminalInputMode",
            ["console", "terminal"],
            terminalSettings.inputMode === "terminal" ? "terminal" : "console"
        )
    });
    createSettingsCheckboxField(frameDocument, col1, {
        label: translateCompositionText(
            "Enable authoring features",
            "Enable authoring features"
        ),
        controlId: "enableAuthoringFeatures",
        checked: settings.enableAuthoringFeatures === true
    });

    frameDocument.getElementById("resetSettings").addEventListener("click", () => {
        writeSettingsControlValue(frameDocument, "defaultLanguage", "en_US");
        writeSettingsControlValue(
            frameDocument,
            "runtimeProvider",
            state.composition?.runtime?.id || selectedRuntimeProvider
        );
        writeSettingsControlValue(
            frameDocument,
            "terminalFont",
            webTerminalDefaults.fontFamily
        );
        writeSettingsControlValue(
            frameDocument,
            "terminalCursorStyle",
            webTerminalDefaults.cursorStyle
        );
        writeSettingsControlChecked(
            frameDocument,
            "terminalCursorBlink",
            Boolean(webTerminalDefaults.cursorBlink)
        );
        writeSettingsControlValue(
            frameDocument,
            "terminalSelectionColor",
            webTerminalDefaults.selectionBackground
        );
        updateSettingsColorSwatch(frameDocument, "terminalSelectionColor");
        writeSettingsControlChecked(
            frameDocument,
            "terminalQuiet",
            webTerminalDefaults.startQuiet === true
        );
        writeSettingsControlChecked(
            frameDocument,
            "terminalErrorContext",
            Boolean(webTerminalDefaults.showFullErrorContext)
        );
        writeSettingsControlValue(
            frameDocument,
            "terminalInputMode",
            webTerminalDefaults.inputMode
        );
        writeSettingsControlChecked(
            frameDocument,
            "enableAuthoringFeatures",
            false
        );
    });
    frameDocument.getElementById("cancelSettings").addEventListener("click", () => {
        browserFrameSurfaces().close("settings");
    });
    frameDocument.getElementById("saveSettings").addEventListener("click", () => {
        const previousLocale = readSelectedLocale();
        const nextLocale = readSettingsControlValue(frameDocument, "defaultLanguage") || "en_US";
        const nextSettings = browserApplicationStorageAdapter.writeSettings(Object.assign(
            {},
            settings,
            {
                defaultLanguage: nextLocale,
                languageNS: nextLocale,
                terminalSettings: {
                    fontFamily: readSettingsControlValue(frameDocument, "terminalFont")
                        || webTerminalDefaults.fontFamily,
                    cursorStyle: readSettingsControlValue(frameDocument, "terminalCursorStyle")
                        || webTerminalDefaults.cursorStyle,
                    cursorBlink: readSettingsControlChecked(frameDocument, "terminalCursorBlink"),
                    selectionBackground: readSettingsControlValue(frameDocument, "terminalSelectionColor")
                        || webTerminalDefaults.selectionBackground,
                    startQuiet: readSettingsControlChecked(frameDocument, "terminalQuiet"),
                    inputMode: readSettingsControlValue(frameDocument, "terminalInputMode") === "terminal"
                        ? "terminal"
                        : "console",
                    showFullErrorContext:
                        readSettingsControlChecked(frameDocument, "terminalErrorContext")
                },
                runtimeStartup: Object.assign({}, runtimeStartup, {
                    providerId: readSettingsControlValue(frameDocument, "runtimeProvider")
                        || selectedRuntimeProvider
                }),
                enableAuthoringFeatures:
                    readSettingsControlChecked(frameDocument, "enableAuthoringFeatures")
            }
        ));

        applyWebTerminalSettings(nextSettings.terminalSettings);
        browserFrameSurfaces().close("settings");

        if (nextLocale !== previousLocale) {
            void applyBrowserLanguage(nextLocale);
        }
    });

    return true;
};

const openSettingsModal = function () {
    const title = translateCompositionText("Settings", "Settings");
    let surface = null;
    let rendered = false;
    const render = function () {
        if (rendered) {
            return;
        }

        if (surface) {
            rendered = renderSettingsFrame(surface.frame, surface);
        }
    };

    surface = browserFrameSurfaces().open({
        id: "settings",
        title,
        src: "about:blank",
        srcdoc: createSettingsFrameHtml(),
        width: 600,
        height: 400,
        role: "dialog",
        ariaModal: false,
        frameTitle: title,
        storageKey: "settings",
        shellClass: "dialogforge-web-settings-window",
        layerClass: "dialogforge-web-settings-layer",
        frameClass: "dialogforge-web-settings-frame",
        onFrameLoad: render,
        onActivate: function (layer) {
            activateModelessSurface("settings");
            state.settingsLayer = layer;
        },
        onClose: function () {
            state.settingsLayer = null;
        }
    });

    state.settingsLayer = surface.layer;
    installModelessSurfaceActivation("settings", surface.layer);
    if (!surface.created) {
        rendered = false;
    }
    render();
};

applyWebTerminalSettings();

const browserPreloadChannelBridge = createBrowserPreloadChannelBridge({
    workspaceChannels() {
        return browserWorkspaceChannels();
    },
    datasetChannels() {
        return browserDatasetChannels();
    },
    generalChannels() {
        return browserGeneralChannels();
    },
    scriptChannels() {
        return browserScriptChannels();
    },
    liveScriptChannels() {
        return browserLiveScriptChannels();
    },
    dialogChannels() {
        return browserDialogChannels();
    },
    readActiveDatasetEditorState() {
        return {
            datasetName: state.dataEditor.datasetName || state.activeDatasetName || "",
            activeTab: state.dataEditor.activeTab || "data",
            selectedVariableIndex: state.dataEditor.selectedVariableIndex || 0,
            selectedCell: state.dataEditor.selectedCell || null
        };
    },
    readGoToContext() {
        return {
            datasetName: state.dataEditor.datasetName || state.activeDatasetName || "",
            mode: "Variable"
        };
    },
    async gotoVariable(input) {
        const variableName = String(input.variableName || "").trim();
        const datasetName = String(input.datasetName || state.dataEditor.datasetName || state.activeDatasetName || "").trim();

        if (variableName && datasetName) {
            await handleBrowserGoToStateUpdate({
                dataset: datasetName,
                value: { variableName }
            });
        }

        return { status: "ready" };
    },
    async gotoCase(input) {
        const caseNumber = Number(input.caseNumber || 0);
        const datasetName = String(input.datasetName || state.dataEditor.datasetName || state.activeDatasetName || "").trim();

        if (caseNumber > 0 && datasetName) {
            await handleBrowserGoToStateUpdate({
                dataset: datasetName,
                value: { caseNumber }
            });
        }

        return { status: "ready" };
    },
    async runScriptCodeBatch(input) {
        activateModelessSurface("scriptEditor");

        try {
            return await browserScriptChannels().runCodeBatch(input);
        }
        finally {
            activateModelessSurface("scriptEditor");
        }
    },
    runVisibleDialogCommand(args) {
        return browserPreloadChannelBridge.invoke(
            dialogRuntimeIpcChannels.runVisibleCommand,
            args
        );
    },
    handleDialogStateUpdate: handleBrowserGoToStateUpdate,
    updateDialogCommandPane: updateCommandPane,
    closeDialogLayer(input) {
        closeDialogLayerForMessage(input || {}, null);
    },
    handleFrameKeyDown(input) {
        handleBrowserKeyDown(input || {});
    },
    openScriptEditorWithCode(code) {
        return openSharedScriptEditorModal(code || "");
    },
    appendMessage: function (text, className = "") {
        appendTranscript(text, className);
    },
    clearDialogOpeningCover: function (dialogId = "") {
        clearDialogOpeningCover(dialogId);
    },
    async handleDialogBrowserReady(sourceWindow) {
        const frames = Array.from(document.querySelectorAll(".dialogforge-web-dialog__frame"));
        const frame = frames.find((candidate) => candidate.contentWindow === sourceWindow);
        const dialogId = frame?.closest(".dialogforge-web-dialog-layer")?.dataset.dialogId || "";

        browserZoomAdapter.postToWindow(sourceWindow);
        await postSharedDialogCreatedEvent(frame, dialogId);
    },
    updateScriptDirtyState(input) {
        state.scriptEditor.dirty = input?.dirty === true;
        state.scriptEditor.fileName = readScriptBaseName(input?.filePath || state.scriptEditor.fileName || "Untitled.R");
        state.scriptEditor.content = String(input?.content ?? state.scriptEditor.content ?? "");
    },
    handleScriptBrowserReady() {
        browserScriptEditorSurface().handleBrowserReady();
    },
    resolveScriptCloseRequest(input) {
        browserScriptEditorSurface().resolveCloseRequest(input || {});
    }
});

const browserPreloadHostRouter = createBrowserPreloadHostRouter({
    invoke(channel, args) {
        return browserPreloadChannelBridge.invoke(channel, args);
    },
    send(channel, args, sourceWindow) {
        browserPreloadChannelBridge.send(channel, args, sourceWindow);
    },
    onError(error) {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    }
});

const browserScriptFileAdapter = createBrowserScriptFileAdapter({
    getCurrentDocument() {
        return {
            filePath: state.scriptEditor.fileName || "Untitled.R",
            content: String(state.scriptEditor.content || "")
        };
    },
    updateCurrentDocument(document) {
        state.scriptEditor.fileName = document.filePath;
        state.scriptEditor.content = document.content;
        state.scriptEditor.dirty = document.dirty === true;
    }
});

const recordCommandHistory = function (command) {
    state.commandHistory?.record?.(command);
};

const transcript = function () {
    return state.console?.coordinator?.getTranscript?.() || null;
};

const webRPromptCoordinator = function () {
    if (!state.promptCoordinator) {
        state.promptCoordinator = createWebRPromptCoordinator({
            getRuntime: function () {
                return state.runtimeReady ? state.runtime : null;
            }
        });
    }

    return state.promptCoordinator;
};

const webRCompletionSessionManager = function () {
    if (!state.runtimeReady || !state.runtime) {
        return null;
    }

    if (!state.completionSessionManager) {
        state.completionSessionManager = createBrowserWebRCompletionSessionManager(
            state.runtime,
            function () {
                return !state.console?.session?.isRuntimeBusy?.();
            }
        );
    }

    return state.completionSessionManager;
};

const webRWorkspaceController = function () {
    if (!state.runtimeReady || !state.runtime) {
        return null;
    }

    if (
        !state.workspaceController
        || state.workspaceControllerRuntime !== state.runtime
    ) {
        const transport = createWebRDirectRuntimeTransport(state.runtime, "webr");

        state.workspaceController = createWebRWorkspaceController(transport);
        state.workspaceControllerRuntime = state.runtime;
    }

    return state.workspaceController;
};

const appendTranscript = function (text, className = "") {
    const activityId = `web_message_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const streamName = className.includes("stderr") ? "stderr" : "stdout";

    transcript()?.recordRuntimeMessageStream?.({
        id: `${activityId}_stream`,
        parent_id: activityId,
        name: streamName,
        text: String(text || "")
    });
};

const createVisibleCommandActivity = function (text, activityId = "") {
    const id = activityId || `web_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const commandText = normalizeConstructedCommandText(text);
    const consoleTranscript = transcript();

    consoleTranscript?.recordRuntimeMessageInput?.({
        id: `${id}_input`,
        parent_id: id,
        code: commandText
    });
    recordCommandHistory(commandText);
    consoleTranscript?.recordRuntimeMessageState?.({
        parent_id: id,
        state: "busy"
    });

    return {
        id,
        commandText
    };
};

const finishVisibleCommandActivity = function (activityId, stateName) {
    transcript()?.recordRuntimeMessageState?.({
        parent_id: activityId,
        state: stateName
    });
};

const workspaceEntries = function () {
    return Array.isArray(state.workspaceSnapshot?.objects)
        ? state.workspaceSnapshot.objects
        : [];
};

const workspaceObjectNames = function () {
    return workspaceEntries().map((entry) => {
        return String(entry.name || "").trim();
    }).filter(Boolean);
};

const workspaceObjectByName = function (objectName) {
    const cleanName = String(objectName || "").trim();

    return workspaceEntries().find((entry) => {
        return String(entry.name || "").trim() === cleanName;
    }) || null;
};

const browserDialogDatasets = async function () {
    return readProductDialogDatasetDescriptors(
        workspaceEntries().map((entry) => ({
            ...entry,
            columnEntries: workspaceColumnEntries(entry.name)
        })),
        {
            allowAllTypes: isTokenLaunchSession(),
            readVariables: readDataEditorVariableBatch
        }
    );
};

const readDataEditorVariableBatch = function (datasetName, start, count) {
    return browserDatasetEditorRuntimeBindings().readVariableBatch(
        datasetName,
        start,
        count
    );
};

const browserDialogExternalCallHost = function () {
    if (!state.dialogExternalCallHost) {
        state.dialogExternalCallHost = createDialogExternalCallHost({
            resolveDatasets: browserDialogDatasets,
            state: state.dialogBindingState
        });
    }

    return state.dialogExternalCallHost;
};

const notifyBrowserDialogsWorkspaceChanged = function () {
    document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
        frame.contentWindow?.postMessage({
            source: "dialogforge.web-host",
            kind: "event",
            channel: "dialogIncomingData",
            args: [readBrowserDialogWorkspaceData()]
        }, window.location.origin);
    });
};

const clearDialogOpeningCover = function (dialogId = "") {
    const cover = state.dialogOpeningCover;

    if (!cover) {
        return;
    }

    const requestedDialogId = String(dialogId || "").trim();

    if (
        requestedDialogId
        && state.dialogOpeningCoverId
        && requestedDialogId !== state.dialogOpeningCoverId
    ) {
        return;
    }

    cover.remove();
    state.dialogOpeningCover = null;
    state.dialogOpeningCoverId = "";
};

const showDialogOpeningCover = function (dialog) {
    clearDialogOpeningCover();

    const cover = document.createElement("div");
    const spinner = document.createElement("div");
    const dialogId = String(dialog?.id || "").trim();
    const label = String(dialog?.label || dialogId || "dialog").trim();

    cover.className = "dialogforge-web-dialog-cover";
    cover.dataset.dialogId = dialogId;
    cover.setAttribute("role", "status");
    cover.setAttribute("aria-label", `Opening ${label}`);
    spinner.className = "dialogforge-web-dialog-cover__spinner";
    spinner.setAttribute("aria-hidden", "true");

    cover.append(spinner);
    document.body.appendChild(cover);
    state.dialogOpeningCover = cover;
    state.dialogOpeningCoverId = dialogId;

    return cover;
};

const browserProductContributionContext = function () {
    return {
        async callSharedDialogExternal(name, parameters = {}) {
            const result = await browserDialogExternalCallHost().call(name, parameters);

            return result?.status === "ready" ? result.value : null;
        }
    };
};

const readBrowserConsoleStateChips = async function (dataset) {
    const datasetName = String(dataset || state.activeDatasetName || "").trim();

    return datasetName
        ? readDialogConsoleStateChips(
            browserProductContributionContext(),
            datasetName
        )
        : [];
};

const refreshBrowserConsoleStateChips = function (dataset = state.activeDatasetName) {
    const datasetName = String(dataset || "").trim();
    const activeDatasetName = String(state.activeDatasetName || "").trim();

    if (!datasetName || datasetName !== activeDatasetName) {
        state.productStateChips = [];
        state.console?.toolbar?.render?.();
        return;
    }

    readBrowserConsoleStateChips(datasetName).then((chips) => {
        if (datasetName !== String(state.activeDatasetName || "").trim()) {
            return;
        }

        state.productStateChips = chips;
        state.console?.toolbar?.render?.();
    }).catch((error) => {
        console.error(error);
    });
};

const notifyBrowserDialogsStateChanged = function (dataset = state.activeDatasetName) {
    document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
        frame.contentWindow?.postMessage({
            source: "dialogforge.web-host",
            kind: "event",
            channel: "dialogIncomingData",
            args: [Object.assign(readBrowserDialogWorkspaceData(), {
                dataset: String(dataset || "")
            })]
        }, window.location.origin);
    });
};

const refreshWebRWorkspaceSurfaces = async function () {
    await refreshWebRWorkspacePane();
    notifyBrowserDialogsWorkspaceChanged();
    refreshBrowserConsoleStateChips();
};

const workspaceColumnNames = function (objectName) {
    const object = workspaceObjectByName(objectName);

    return Array.isArray(object?.columns)
        ? object.columns
        : [];
};

const workspaceColumnEntries = function (objectName) {
    const object = workspaceObjectByName(objectName);

    if (Array.isArray(object?.columnEntries) && object.columnEntries.length > 0) {
        return object.columnEntries;
    }

    return workspaceColumnNames(objectName).map((name) => ({ name }));
};

const isTokenLaunchSession = function () {
    return Boolean(String(state.moodleLaunchCode || "").trim());
};

const executeWorkspaceRemove = async function (name) {
    const objectName = String(name || "").trim();

    if (!objectName) {
        return;
    }

    await executeVisibleCommand(buildRRemoveWorkspaceObjectCommand(objectName));
};

const executeWorkspaceClear = async function () {
    await executeVisibleCommand(buildRClearWorkspaceCommand());
};

const readWorkspacePaneSnapshot = function () {
    return state.workspaceSnapshot;
};

const setActiveWorkspaceDataset = function (name) {
    const datasetName = String(name || "").trim();
    const object = workspaceObjectByName(datasetName);

    if (!datasetName || object?.kind !== "data.frame") {
        return;
    }

    if (state.activeDatasetName === datasetName) {
        return;
    }

    applyActiveWorkspaceDatasetName(datasetName);
    state.workspacePane?.setActiveDataset(datasetName);
};

const renderWorkspacePane = function () {
    if (!elements.workspaceSummary) {
        return;
    }

    if (!state.workspacePane) {
        state.workspacePane = createWorkspacePane({
            container: elements.workspaceSummary,
            t: (key) => translateCompositionText(key, key),
            onSelectVariable: async function (item) {
                setActiveWorkspaceDataset(item.access_key);
            },
            onOpenVariable: async function (item) {
                const objectName = String(item.access_key || "").trim();

                if (objectName) {
                    await openSharedDataEditorModal(objectName);
                }
            },
            onMakeActiveDataset: async function (item) {
                setActiveWorkspaceDataset(item.access_key);
            },
            onDeleteVariable: executeWorkspaceRemove,
            onClearWorkspace: executeWorkspaceClear
        });
    }

    state.workspacePane.setSnapshot(readWorkspacePaneSnapshot());
    state.workspacePane.setActiveDataset(state.activeDatasetName);
};

const workspaceDatasetNames = function () {
    return workspaceEntries()
        .filter((entry) => entry.kind === "data.frame")
        .map((entry) => entry.name);
};

const applyActiveWorkspaceDatasetName = function (datasetName) {
    state.activeDatasetName = String(datasetName || "").trim();
    refreshBrowserConsoleStateChips(state.activeDatasetName);
    notifyBrowserDialogsStateChanged(state.activeDatasetName);
};

const selectActiveDatasetAfterWorkspaceRefresh = function (previousDatasetNames = []) {
    const previous = new Set(
        (Array.isArray(previousDatasetNames) ? previousDatasetNames : [])
            .map((name) => String(name || "").trim())
            .filter(Boolean)
    );
    const datasetNames = workspaceDatasetNames();
    const addedDatasetNames = datasetNames.filter((name) => !previous.has(name));
    const latestAddedDataset = addedDatasetNames[addedDatasetNames.length - 1] || "";

    if (latestAddedDataset) {
        applyActiveWorkspaceDatasetName(latestAddedDataset);
        return;
    }

    if (workspaceObjectByName(state.activeDatasetName)) {
        return;
    }

    applyActiveWorkspaceDatasetName(datasetNames[0] || "");
};

const refreshWebRWorkspacePaneFast = async function () {
    const controller = webRWorkspaceController();

    if (!controller) {
        renderWorkspacePane();
        return;
    }

    const previousDatasetNames = workspaceDatasetNames();

    state.workspaceSnapshot = createWorkspaceSnapshot({
        status: "ready",
        providerId: "webr",
        objects: await controller.listWorkspaceObjects(
            createBrowserWebRSessionSnapshot("ready", "WebR ready."),
            { forceRefresh: false }
        ),
        message: "Workspace objects were read from the WebR provider."
    });

    selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    renderWorkspacePane();
};

const refreshWebRWorkspaceMetadataInBackground = function () {
    refreshWebRWorkspaceSurfaces().catch((error) => {
        console.error(error);
    });
};

const refreshWebRWorkspacePane = async function () {
    const controller = webRWorkspaceController();

    if (!controller) {
        renderWorkspacePane();
        return;
    }

    const previousDatasetNames = workspaceDatasetNames();

    state.workspaceSnapshot = createWorkspaceSnapshot({
        status: "ready",
        providerId: "webr",
        objects: await controller.listWorkspaceObjects(
            createBrowserWebRSessionSnapshot("ready", "WebR ready."),
            { forceRefresh: true }
        ),
        message: "Workspace objects were read from the WebR provider."
    });

    selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    renderWorkspacePane();
};

const DATA_EDITOR_INITIAL_ROWS = 40;
const DATA_EDITOR_INITIAL_COLUMNS = 32;
const DATA_EDITOR_VARIABLE_OVERSCAN_ROWS = 20;

const getDataEditorCache = function (datasetName) {
    const key = String(datasetName || "").trim();
    let cache = state.dataEditor.cache.get(key);

    if (!cache) {
        cache = {
            snapshot: null,
            variables: [],
            variablesLoaded: 0,
            variablesLoading: false,
            variablesViewportLoading: false,
            dataLoading: false,
            loadedWindow: {
                rowStart: 1,
                rowEnd: 0,
                columnStart: 1,
                columnEnd: 0
            },
            pendingDataViewport: null,
            dataScrollTimer: 0,
            variablesScrollTimer: 0
        };
        state.dataEditor.cache.set(key, cache);
    }

    return cache;
};

const browserDatasetEditorRuntimeBindings = function () {
    if (!state.datasetEditorRuntimeBindings) {
        state.datasetEditorRuntimeBindings = createWebRDatasetEditorRuntimeBindings({
            ensureRuntime,
            invalidateDataset(datasetName) {
                state.dataEditor.cache.delete(String(datasetName || "").trim());
            }
        });
    }

    return state.datasetEditorRuntimeBindings;
};

const readBrowserDatasetNames = function () {
    return workspaceEntries().filter((entry) => {
        return entry.kind === "data.frame";
    }).map((entry) => {
        return entry.name;
    });
};

const createSharedDataEditorInitPayload = function (datasetName) {
    const datasetNames = readBrowserDatasetNames();

    return {
        appPath: "/",
        datasetName,
        datasetNames,
        i18n: state.composition?.i18n || {},
        languageNS: readSelectedLocale(),
        variableColumnWidths: state.dataEditor.variableColumnWidths
    };
};

const browserDataEditorSurface = function () {
    if (!state.browserDataEditorSurface) {
        state.browserDataEditorSurface = createBrowserDataEditorSurface({
            frameSurfaces: browserFrameSurfaces(),
            postEvent: postBrowserPreloadEvent,
            installActivation: installModelessSurfaceActivation,
            activateSurface: activateModelessSurface,
            readDatasetNames: readBrowserDatasetNames,
            createInitPayload: createSharedDataEditorInitPayload,
            formatTitle(datasetName) {
                return translateCompositionTemplate(
                    "Data editor: {name}",
                    `Data editor: ${datasetName}`,
                    { name: datasetName }
                );
            },
            onStateChanged: function (surfaceState) {
                state.dataEditor.layer = surfaceState.layer;
                state.dataEditor.frame = surfaceState.frame;
            }
        });
    }

    return state.browserDataEditorSurface;
};

const openSharedDataEditorModal = async function (datasetName) {
    const cleanName = String(datasetName || state.activeDatasetName || "").trim();

    if (!cleanName) {
        return;
    }

    const object = workspaceObjectByName(cleanName);

    if (object?.kind === "data.frame") {
        setActiveWorkspaceDataset(cleanName);
    }

    state.dataEditor.datasetName = cleanName;
    await browserDataEditorSurface().open(cleanName);
};

async function handleBrowserGoToStateUpdate(message) {
    const value = message.value && typeof message.value === "object"
        ? message.value
        : {};
    const datasetName = String(message.dataset || state.activeDatasetName || "").trim();

    if (!datasetName) {
        return;
    }

    if (String(value.variableName || "").trim()) {
        const variableName = String(value.variableName || "").trim();
        const columnIndex = workspaceColumnNames(datasetName).indexOf(variableName) + 1;

        if (columnIndex > 0) {
            state.dataEditor.selectedVariableIndex = columnIndex;
        }
        state.dataEditor.activeTab = "variables";
        await openSharedDataEditorModal(datasetName);
        await browserDataEditorSurface().gotoVariable(datasetName, variableName);
        return;
    }

    if (Number(value.caseNumber || 0) > 0) {
        const caseNumber = Number(value.caseNumber || 0);
        const firstColumn = workspaceColumnNames(datasetName)[0] || "";

        state.dataEditor.selectedCell = {
            rowIndex: caseNumber,
            columnName: firstColumn
        };
        state.dataEditor.activeTab = "data";
        await openSharedDataEditorModal(datasetName);
        await browserDataEditorSurface().gotoCase(datasetName, caseNumber);
    }
}

const chooseBrowserScriptFile = function () {
    return browserScriptFileAdapter.openFile();
};

const saveBrowserScriptFile = function (input, saveAs = false) {
    return browserScriptFileAdapter.saveFile(input || {}, saveAs);
};

const browserScriptChannels = function () {
    if (!state.scriptChannelAdapter) {
        state.scriptChannelAdapter = createScriptChannelAdapter({
            ensureRuntimeReady,
            checkFragment: checkCodeFragmentComplete,
            executeVisibleCommand,
            getDocument() {
                return {
                    filePath: state.scriptEditor.fileName || "Untitled.R",
                    content: String(state.scriptEditor.content || ""),
                    message: ""
                };
            },
            saveFile: saveBrowserScriptFile,
            openFile: chooseBrowserScriptFile
        });
    }

    return state.scriptChannelAdapter;
};

const browserLiveScriptChannels = function () {
    if (!state.browserLiveScriptTransport) {
        state.browserLiveScriptTransport = createBrowserLiveScriptTransport({
            publish(channel, event) {
                postBrowserPreloadEvent(
                    state.scriptEditor.frame?.contentWindow,
                    channel,
                    event
                );
            }
        });
    }

    return state.browserLiveScriptTransport;
};

const browserScriptEditorSurface = function () {
    if (!state.browserScriptEditorSurface) {
        state.browserScriptEditorSurface = createBrowserScriptEditorSurface({
            frameSurfaces: browserFrameSurfaces(),
            postEvent: postBrowserPreloadEvent,
            installActivation: installModelessSurfaceActivation,
            activateSurface: activateModelessSurface,
            readDocument: function () {
                return {
                    filePath: state.scriptEditor.fileName || "Untitled.R",
                    content: String(state.scriptEditor.content || "")
                };
            },
            getI18n: function () {
                return state.composition?.i18n || {};
            },
            getLocale: readSelectedLocale,
            formatTitle: function () {
                return translateCompositionText("Script editor", "Script editor");
            },
            readLiveScriptJoinText: function () {
                return readLiveScriptJoinTextFromUrl(window.location.href);
            },
            onStateChanged: function (surfaceState) {
                state.scriptEditor.layer = surfaceState.layer;
                state.scriptEditor.frame = surfaceState.frame;
            },
            onError: function (error) {
                appendTranscript(
                    error instanceof Error ? error.message : String(error),
                    "web-transcript__line--stderr"
                );
            }
        });
    }

    return state.browserScriptEditorSurface;
};

const openSharedScriptEditorModal = async function (initialCode = "") {
    await browserScriptEditorSurface().open(initialCode);
};

const openSharedScriptEditorLocalFile = async function () {
    const file = await chooseBrowserScriptFile();

    if (!file || file.canceled || file.status !== "ready") {
        if (file?.message && file.status !== "canceled") {
            appendTranscript(file.message, "web-transcript__line--stderr");
        }
        return;
    }

    state.scriptEditor.fileName = readScriptBaseName(file.filePath || "Untitled.R");
    state.scriptEditor.content = String(file.content || "");
    await browserScriptEditorSurface().openDocument({
        filePath: state.scriptEditor.fileName,
        content: state.scriptEditor.content
    });
};

const readBrowserPickerFile = async function (options) {
    const pickerOptions = Object.assign({
        multiple: false
    }, options || {});

    if (window.showOpenFilePicker) {
        try {
            const handles = await window.showOpenFilePicker(pickerOptions);
            const handle = handles[0] || null;

            return handle ? await handle.getFile() : null;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return null;
            }

            throw error;
        }
    }

    return new Promise((resolve) => {
        const input = document.createElement("input");
        const types = Array.isArray(pickerOptions.types) ? pickerOptions.types : [];
        const accept = types
            .flatMap((type) => {
                return Object.values(type?.accept || {});
            })
            .flat()
            .join(",");

        input.type = "file";
        input.accept = accept;
        input.style.position = "fixed";
        input.style.left = "-10000px";
        input.style.top = "0";
        input.addEventListener("change", () => {
            const file = input.files && input.files[0];

            input.remove();
            resolve(file || null);
        }, { once: true });
        input.addEventListener("cancel", () => {
            input.remove();
            resolve(null);
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    });
};

const sanitizeWebRFileName = function (name, fallback) {
    const value = String(name || fallback || "file")
        .replace(/[\\/:\0]/g, "_")
        .replace(/^\.+$/, "")
        .trim();

    return value || fallback || "file";
};

const joinWebRPath = function (directory, fileName) {
    const base = String(directory || "/web").replace(/\/+$/g, "") || "/web";

    return `${base}/${sanitizeWebRFileName(fileName, "file")}`;
};

const writeFileToWebRWorkingDirectory = async function (file) {
    const runtime = await ensureRuntime();
    const virtualPath = joinWebRPath(
        state.workingDirectoryPath,
        file.name || "file"
    );

    await ensureWebRDirectory(runtime, state.workingDirectoryPath);
    await runtime.FS.writeFile(virtualPath, new Uint8Array(await file.arrayBuffer()));

    return virtualPath;
};

const downloadBrowserBytes = function (fileName, bytes, type) {
    const blob = new Blob([bytes], {
        type: type || "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = sanitizeWebRFileName(fileName, "workspace.RData");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
};

const selectBrowserSaveFileHandle = async function (fileName, type, extensions) {
    if (!window.showSaveFilePicker) {
        return null;
    }

    try {
        return await window.showSaveFilePicker({
            suggestedName: sanitizeWebRFileName(fileName, "workspace.RData"),
            types: [{
                description: "R workspace files",
                accept: {
                    [type || "application/octet-stream"]: extensions || [".RData"]
                }
            }]
        });
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return false;
        }

        throw error;
    }
};

const writeBrowserSaveFile = async function (handle, bytes) {
    const writable = await handle.createWritable();

    try {
        await writable.write(bytes);
    }
    finally {
        await writable.close();
    }
};

const runBrowserScriptFile = async function () {
    const file = await readBrowserPickerFile({
        types: [{
            description: "R script files",
            accept: {
                "text/plain": [".R", ".r", ".q"]
            }
        }]
    });

    if (!file) {
        return;
    }

    const virtualPath = await writeFileToWebRWorkingDirectory(file);

    await executeVisibleCommand(`source(${JSON.stringify(virtualPath)}, local = .GlobalEnv)`);
};

const openBrowserWorkspaceFile = async function () {
    const file = await readBrowserPickerFile({
        types: [{
            description: "R workspace files",
            accept: {
                "application/octet-stream": [".RData", ".rda", ".Rda"]
            }
        }]
    });

    if (!file) {
        return;
    }

    const virtualPath = await writeFileToWebRWorkingDirectory(file);

    await executeVisibleCommand(`load(${JSON.stringify(virtualPath)}, envir = .GlobalEnv)`);
    await refreshWebRWorkspaceSurfaces();
};

const saveBrowserWorkspaceFile = async function () {
    const fileName = "workspace.RData";
    const type = "application/octet-stream";
    const saveHandle = await selectBrowserSaveFileHandle(
        fileName,
        type,
        [".RData", ".rda", ".Rda"]
    );

    if (saveHandle === false) {
        return;
    }

    const runtime = await ensureRuntime();
    const virtualPath = joinWebRPath(
        state.workingDirectoryPath,
        fileName
    );

    await ensureWebRDirectory(runtime, state.workingDirectoryPath);
    await runtime.evalRVoid([
        "save(",
        "list = ls(envir = .GlobalEnv, all.names = TRUE),",
        `file = ${JSON.stringify(virtualPath)},`,
        "envir = .GlobalEnv",
        ")"
    ].join(" "));

    const bytes = await runtime.FS.readFile(virtualPath);

    if (saveHandle) {
        await writeBrowserSaveFile(saveHandle, bytes);
        return;
    }

    downloadBrowserBytes(fileName, bytes, type);
};

const cleanupWebRDefaultPlotFile = async function (runtime) {
    if (!runtime?.FS) {
        return;
    }

    const candidates = [
        joinWebRPath(state.workingDirectoryPath, "Rplots.pdf"),
        "/web/Rplots.pdf"
    ];

    for (const candidate of candidates) {
        try {
            await runtime.FS.unlink(candidate);
        }
        catch { }
    }
};

const browserFrameSurfaces = function () {
    if (!state.browserFrameSurfaces) {
        state.browserFrameSurfaces = createBrowserFrameSurfaceController({
            root: document.body,
            installDraggable: installBrowserDraggableSurface,
            installResizable: installBrowserResizableSurface
        });
    }

    return state.browserFrameSurfaces;
};

const browserWorkbenchLayout = function () {
    if (!state.browserWorkbenchLayout) {
        state.browserWorkbenchLayout = createBrowserWorkbenchLayout({
            document,
            installDraggableSurface: installBrowserDraggableSurface,
            installResizableSurface: installBrowserResizableSurface,
            initialWorkspacePaneWidth: 280
        });
    }

    return state.browserWorkbenchLayout;
};

const browserPlotViewerHost = function () {
    if (!state.browserPlotViewerHost) {
        state.browserPlotViewerHost = createBrowserPlotViewerHost({
            frameSurfaces: browserFrameSurfaces(),
            activateSurface: activateModelessSurface,
            installSurfaceActivation: installModelessSurfaceActivation,
            executeMutation: executeBrowserPlotMutation,
            savePlot: saveBrowserPlot,
            copyPlot: copyBrowserPlot,
            closeCapturedImages: closeBrowserCapturedPlotImages,
            getI18n: function () {
                return state.composition?.i18n || {};
            }
        });
    }

    return state.browserPlotViewerHost;
};

const browserHelpViewerSurface = function () {
    if (!state.browserHelpViewerSurface) {
        state.browserHelpViewerSurface = createBrowserHelpViewerSurface({
            frameSurfaces: browserFrameSurfaces()
        });
    }

    return state.browserHelpViewerSurface;
};

const loadCommandPreviewColorizer = async function () {
    if (!state.commandPreviewColorizer) {
        state.commandPreviewColorizer = import("/browser-esm/src/console/consoleSyntax.js")
            .then((module) => module.colorizeConsoleCodeInto || module.colorizeConsoleRCodeInto);
    }

    return state.commandPreviewColorizer;
};

const browserCommandPreviewController = function () {
    if (!state.commandPreviewController) {
        state.commandPreviewController = createMainDialogCommandPreviewController({
            document,
            window,
            containerSelector: ".web-console",
            resetSizeModeOnHide: true,
            usePointerResize: true,
            colorize: async function (target, text) {
                const colorize = await loadCommandPreviewColorizer();

                await colorize(target, text);
            },
            copyCommand: function (text) {
                state.console?.coordinator?.setText?.(text);
                state.console?.coordinator?.focus?.();
            },
            writeClipboardText: async function (text) {
                await navigator.clipboard?.writeText?.(text);
            },
            insertScriptEditorCode: async function (text) {
                await openSharedScriptEditorModal(text);
            }
        });
        state.commandPreviewController.bind();
    }

    return state.commandPreviewController;
};

async function updateCommandPane(text) {
    const value = normalizeConstructedCommandText(text);

    state.commandPreviewText = value;
    if (!value.trim()) {
        state.commandPreviewDialogId = "";
    }

    browserCommandPreviewController().render(value);
}

const toggleWorkspacePane = function () {
    browserWorkbenchLayout().toggleWorkspacePane();
};

const browserImportAdapter = function () {
    if (!state.browserImportAdapter) {
        state.browserImportAdapter = createBrowserImportAdapter({
            getWorkingDirectoryPath: function () {
                return state.workingDirectoryPath;
            },
            ensureRuntime,
            captureHiddenRText: captureWebRHiddenText,
            executeHiddenImport: async function (command) {
                const runtime = await ensureRuntime();

                await executeWebRSourceVisibleCommand(runtime, command);
            },
            executeVisibleImport: executeVisibleCommand,
            refreshWorkspace: refreshWebRWorkspaceSurfaces,
            setActiveDataset: setActiveWorkspaceDataset
        });
    }

    return state.browserImportAdapter;
};

const selectBrowserImportFile = function () {
    return browserImportAdapter().selectFile();
};

const stageBrowserImportFile = function (payload) {
    return browserImportAdapter().stageFile(payload || {});
};

const readBrowserImportPreview = function (payload) {
    return browserImportAdapter().readPreview(payload || {});
};

const restoreBrowserImportFilesToWebR = function () {
    return browserImportAdapter().restoreFilesToWebR();
};

const browserRuntimeProgress = function () {
    if (!state.browserRuntimeProgressController) {
        state.browserRuntimeProgressController = createBrowserRuntimeProgressController({
            document,
            window,
            onStatusChange: function () {
                state.console?.toolbar?.render?.();
            }
        });
    }

    return state.browserRuntimeProgressController;
};

const runtimeProgressFromStage = function (message, fraction = 0) {
    return browserRuntimeProgress().progressFromStage(message, fraction);
};

const setRuntimeStatus = function (text, progress) {
    browserRuntimeProgress().setStatus(text, progress);
};

const notifyConsoleSession = function () {
    try {
        state.console?.session?.notifySessionPhase?.();
        state.console?.toolbar?.render?.();
    }
    catch { }
};

const runtimeSnapshot = function (status, message = "") {
    return createBrowserWebRSessionSnapshot(status, message);
};

const readWebRRestartVersion = async function () {
    try {
        const runtime = await ensureRuntime();
        const text = await captureWebRHiddenText(
            runtime,
            "cat(paste(R.version$major, R.version$minor, sep = \".\"))"
        );

        return String(text || "").trim();
    }
    catch {
        return "";
    }
};

const loadComposition = async function () {
    state.composition = await loadBrowserComposition({
        fetch: window.fetch.bind(window),
        locale: readSelectedLocale()
    });
    state.workingDirectoryPath = createBrowserProductWorkingDirectory(state.composition);
    state.homeDirectoryPath = state.workingDirectoryPath;
};

const findProductDialog = function (dialogId) {
    return findBrowserCompositionProductDialog(state.composition, dialogId);
};

const findSharedDialog = function (dialogId) {
    return findBrowserCompositionSharedDialog(state.composition, dialogId);
};

const closeMenus = function () {
    state.browserMenuAdapter?.close?.();
};

const browserZoomActionForMenuRole = function (role) {
    const cleanRole = String(role || "").trim();

    if (cleanRole === "zoomIn") {
        return "in";
    }

    if (cleanRole === "zoomOut") {
        return "out";
    }

    if (cleanRole === "resetZoom") {
        return "reset";
    }

    return "";
};

const handleBrowserKeyDown = function (input) {
    if (browserZoomAdapter.handleKeyDown(input)) {
        return true;
    }

    if (input?.key === "Escape") {
        closeMenus();
        return true;
    }

    return false;
};

const isMenuActionSupported = function (item) {
    return item.type === "language"
        || item.type === "product-dialog"
        || item.type === "shared-dialog"
        || item.type === "product-command"
        || (
            item.type === "native-role"
            && Boolean(browserZoomActionForMenuRole(item.role))
        )
        || (
            item.type === "shell-command"
            && isSupportedAuxiliaryShellCommand(item.command)
        );
};

const translateCompositionText = function (key, fallback) {
    const strings = state.composition?.i18n || {};
    const text = strings[key] || strings[fallback] || fallback || key;

    return String(text || key || "");
};

const translateCompositionTemplate = function (key, fallback, values = {}) {
    return translateCompositionText(key, fallback).replace(/\{([^}]+)\}/g, (_match, name) => {
        return Object.prototype.hasOwnProperty.call(values, name)
            ? String(values[name])
            : "";
    });
};

const setTranslatedElementText = function (id, key, fallback = key) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = translateCompositionText(key, fallback);
    }
};

const setTranslatedElementLabel = function (id, key, fallback = key, options = {}) {
    const element = document.getElementById(id);

    if (!element) {
        return;
    }

    const label = translateCompositionText(key, fallback);

    element.setAttribute("aria-label", label);
    element.dataset.tooltip = label;

    if (options.title) {
        element.setAttribute("title", label);
    }

    if (options.text) {
        element.textContent = label;
    }
};

const applyWebShellTranslations = function () {
    const workbench = document.getElementById("webWorkbenchWindow");
    const menuBar = document.getElementById("webMenuBar");
    const commandActions = document.getElementById("commandActions");
    const consoleToolbar = document.getElementById("consoleToolbar");

    document.title = translateCompositionTemplate(
        "{productName} Web",
        "{productName} Web",
        { productName: state.composition?.product?.name || "DialogForge" }
    );
    const windowTitle = document.querySelector(".web-workbench-window__title");

    if (windowTitle) {
        windowTitle.textContent = translateCompositionText(
            "WebR console",
            "WebR console"
        );
    }

    if (menuBar) {
        menuBar.setAttribute(
            "aria-label",
            translateCompositionText("Application menu", "Application menu")
        );
    }

    if (workbench) {
        workbench.setAttribute(
            "aria-label",
            translateCompositionText(
                "Runtime console and workspace",
                "Runtime console and workspace"
            )
        );
    }

    if (commandActions) {
        commandActions.setAttribute(
            "aria-label",
            translateCompositionText(
                "Command preview actions",
                "Command preview actions"
            )
        );
    }

    if (consoleToolbar) {
        consoleToolbar.setAttribute(
            "aria-label",
            translateCompositionText("Console toolbar", "Console toolbar")
        );
    }

    setTranslatedElementLabel("commandPreviewToConsole", "Copy to Console");
    setTranslatedElementLabel(
        "commandPreviewToScriptEditor",
        "Send to Script Editor"
    );
    setTranslatedElementLabel("consoleCwd", "Set working directory");
    setTranslatedElementText("consoleActiveDatasetLabel", "Active:");
    setTranslatedElementLabel("consoleToolbarStart", "Start runtime", "Start runtime", {
        text: true
    });
    setTranslatedElementLabel("consoleToolbarStop", "Interrupt");
    setTranslatedElementLabel("consoleToolbarRestart", "Restart Clean");
    setTranslatedElementLabel(
        "consoleToolbarRestartWorkspace",
        "Restart and Restore Workspace"
    );
    setTranslatedElementLabel("consoleToolbarInfo", "Info");
    setTranslatedElementLabel("consoleToolbarClear", "Clear Console");
    setTranslatedElementLabel("workspacePaneToggle", "Toggle Workspace");
    setTranslatedElementText(
        "consoleCoverMessage",
        "Loading web runtime...",
        "Loading web runtime..."
    );
};

const translateAboutItems = function (items, keyPrefix, itemPrefix) {
    return (items || []).map((text, index) => {
        const key = `${keyPrefix}.${itemPrefix}${index + 1}`;
        const translated = translateCompositionText(key, key);

        if (translated !== key) {
            return translated;
        }

        return translateCompositionText(text, text);
    });
};

const buildAboutPayload = function () {
    const composition = state.composition || {};
    const about = composition.productAbout || {};
    const product = composition.product || {};
    const productName = String(product.name || "Application");
    const version = String(product.version || "");
    const currentYear = new Date().getFullYear();
    const startYear = Number(about.copyrightStartYear || currentYear);
    const yearText = currentYear > startYear
        ? `${startYear}-${currentYear}`
        : String(startYear);
    const holder = about.copyrightHolder || about.authorName || productName;

    return {
        title: translateCompositionTemplate(
            "About {productName}",
            `About ${productName}`,
            { productName }
        ),
        version: version
            ? translateCompositionTemplate(
                "Version {version}",
                `Version ${version}`,
                { version }
            )
            : "",
        body: translateAboutItems(about.body || [], "about.body", "b"),
        highlights: translateAboutItems(
            about.highlights || [],
            "about.highlights",
            "h"
        ),
        authorLabel: translateCompositionText(about.authorLabel || "Author:", "Author:"),
        authorName: String(about.authorName || ""),
        authorUrl: String(about.authorUrl || ""),
        copyright: translateCompositionTemplate(
            "Copyright © {yearText}, {holder}",
            `Copyright © ${yearText}, ${holder}`,
            { yearText, holder }
        )
    };
};

const renderAboutPayload = function (frame, payload) {
    const frameDocument = frame?.contentDocument;

    if (!frameDocument) {
        return false;
    }

    const title = frameDocument.getElementById("aboutTitle");
    const version = frameDocument.getElementById("aboutVersion");
    const body = frameDocument.getElementById("aboutBody");
    const highlights = frameDocument.getElementById("aboutHighlights");
    const authorLabel = frameDocument.getElementById("authorLabel");
    const author = frameDocument.getElementById("authorName");
    const copyright = frameDocument.getElementById("aboutCopyright");

    if (
        !title
        || !version
        || !body
        || !highlights
        || !authorLabel
        || !author
        || !copyright
    ) {
        return false;
    }

    frameDocument.title = payload.title;
    title.textContent = payload.title;
    version.textContent = payload.version;

    body.replaceChildren(...payload.body.map((text) => {
        const paragraph = frameDocument.createElement("p");

        paragraph.textContent = text;

        return paragraph;
    }));

    highlights.replaceChildren(...payload.highlights.map((text) => {
        const item = frameDocument.createElement("li");

        item.textContent = text;

        return item;
    }));
    highlights.hidden = payload.highlights.length === 0;

    authorLabel.textContent = payload.authorLabel;

    if (payload.authorUrl) {
        const link = frameDocument.createElement("a");

        link.href = payload.authorUrl;
        link.textContent = payload.authorName;
        link.target = "_blank";
        link.rel = "noreferrer";
        author.replaceChildren(link);
    }
    else {
        author.textContent = payload.authorName;
    }

    copyright.textContent = payload.copyright;

    return true;
};

const openAboutModal = function () {
    const payload = buildAboutPayload();
    let surface = null;
    const render = function () {
        if (surface) {
            renderAboutPayload(surface.frame, payload);
        }
    };

    surface = browserFrameSurfaces().open({
        id: "about",
        title: payload.title,
        src: "/src/base-app/pages/about.html",
        width: 610,
        height: 500,
        role: "dialog",
        ariaModal: false,
        frameTitle: payload.title,
        storageKey: "about",
        onFrameLoad: render
    });

    render();
};

const createDeveloperDiagnosticsFrameHtml = function () {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(translateCompositionText("menu.root.view.developerDiagnostics", "Developer Diagnostics"))}</title>
    <style>
        :root {
            color-scheme: light;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px;
            color: #20242a;
            background: #f4f5f7;
        }

        body {
            margin: 0;
        }

        .shell {
            padding: 14px;
            display: grid;
            gap: 14px;
        }

        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }

        h1 {
            margin: 0;
            font-size: 16px;
        }

        h2 {
            margin: 0 0 10px;
            font-size: 14px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 14px;
        }

        .panel {
            border: 1px solid #d7dbe2;
            border-radius: 4px;
            background: #ffffff;
            padding: 12px;
            min-width: 0;
        }

        button {
            border: 1px solid #cbd1da;
            border-radius: 4px;
            background: #ffffff;
            padding: 5px 10px;
            font: inherit;
            cursor: pointer;
        }

        pre {
            margin: 0;
            overflow: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
    </style>
</head>
<body>
    <div class="shell">
        <div class="toolbar">
            <h1>${escapeHtml(translateCompositionText("menu.root.view.developerDiagnostics", "Developer Diagnostics"))}</h1>
            <button id="refresh" type="button">${escapeHtml(translateCompositionText("Refresh", "Refresh"))}</button>
        </div>
        <div class="grid">
            <section class="panel">
                <h2>Runtime Session</h2>
                <pre id="runtimeSession">Loading...</pre>
            </section>
            <section class="panel">
                <h2>Runtime Events</h2>
                <pre id="runtimeEvents">Loading...</pre>
            </section>
            <section class="panel">
                <h2>Runtime Prompts</h2>
                <pre id="runtimePrompts">Loading...</pre>
            </section>
            <section class="panel">
                <h2>Workspace</h2>
                <pre id="workspace">Loading...</pre>
            </section>
            <section class="panel">
                <h2>Settings</h2>
                <pre id="settings">Loading...</pre>
            </section>
            <section class="panel">
                <h2>Composition</h2>
                <pre id="composition">Loading...</pre>
            </section>
        </div>
    </div>
</body>
</html>`;
};

const readDeveloperDiagnosticsPayload = async function () {
    return {
        runtimeSession: state.runtimeReady
            ? runtimeSnapshot("ready", "WebR ready.")
            : state.runtimeStarting
                ? runtimeSnapshot("starting", "WebR is starting.")
                : runtimeSnapshot("stopped", "WebR not started."),
        runtimeEvents: {
            status: state.runtimeReady ? "ready" : state.runtimeStarting ? "starting" : "stopped",
            records: []
        },
        runtimePrompts: state.promptCoordinator
            ? await state.promptCoordinator.listPrompts()
            : { status: "ready", prompts: [] },
        workspace: state.workspaceSnapshot,
        settings: browserApplicationStorageAdapter.readSettings(),
        composition: state.composition
    };
};

const renderDeveloperDiagnosticsFrame = async function (frame) {
    const frameDocument = frame.contentDocument;

    if (!frameDocument) {
        return;
    }

    const write = function (id, value) {
        const target = frameDocument.getElementById(id);

        if (target) {
            target.textContent = JSON.stringify(value, null, 4);
        }
    };
    const refresh = async function () {
        const payload = await readDeveloperDiagnosticsPayload();

        write("runtimeSession", payload.runtimeSession);
        write("runtimeEvents", payload.runtimeEvents);
        write("runtimePrompts", payload.runtimePrompts);
        write("workspace", payload.workspace);
        write("settings", payload.settings);
        write("composition", payload.composition);
    };
    const refreshButton = frameDocument.getElementById("refresh");

    if (refreshButton) {
        refreshButton.onclick = function () {
            refresh().catch((error) => {
                write("runtimeEvents", {
                    status: "error",
                    message: error instanceof Error ? error.message : String(error)
                });
            });
        };
    }
    await refresh();
};

const openDeveloperDiagnosticsModal = function () {
    const title = translateCompositionText("menu.root.view.developerDiagnostics", "Developer Diagnostics");
    let surface = null;
    const render = function () {
        if (surface) {
            renderDeveloperDiagnosticsFrame(surface.frame).catch((error) => {
                appendTranscript(
                    error instanceof Error ? error.message : String(error),
                    "web-transcript__line--stderr"
                );
            });
        }
    };

    surface = browserFrameSurfaces().open({
        id: "devDiagnostics",
        title,
        src: "about:blank",
        srcdoc: createDeveloperDiagnosticsFrameHtml(),
        width: 980,
        height: 720,
        role: "dialog",
        ariaModal: false,
        frameTitle: title,
        storageKey: "devDiagnostics",
        shellClass: "dialogforge-web-dev-diagnostics-window",
        layerClass: "dialogforge-web-dev-diagnostics-layer",
        frameClass: "dialogforge-web-dev-diagnostics-frame",
        onFrameLoad: render,
        onActivate: function (layer) {
            activateModelessSurface("devDiagnostics");
            state.devDiagnosticsLayer = layer;
        },
        onClose: function () {
            state.devDiagnosticsLayer = null;
        }
    });

    state.devDiagnosticsLayer = surface.layer;
    installModelessSurfaceActivation("devDiagnostics", surface.layer);
    render();
};

const insertLanguageMenu = function (menu) {
    const composition = state.composition || {};
    const locales = Array.isArray(composition.availableLocales)
        ? composition.availableLocales
        : [];

    if (locales.length === 0) {
        return menu || [];
    }

    const currentLocale = String(composition.locale || readSelectedLocale() || "en_US");
    const languageMenu = {
        id: "Language",
        type: "submenu",
        label: translateCompositionText("menu.root.language", "Language"),
        enabled: true,
        reason: "",
        missing: [],
        items: locales.map((locale) => {
            const code = String(locale.code || "").trim();

            return {
                id: `Language.${code}`,
                type: "language",
                label: String(locale.label || localeDisplayName(code)),
                enabled: Boolean(code),
                reason: "",
                missing: [],
                locale: code,
                checked: code === currentLocale
            };
        })
    };
    const withoutExistingLanguage = (menu || []).filter((item) => {
        return item?.id !== "Language";
    });
    const aboutIndex = withoutExistingLanguage.findIndex((item) => {
        return item?.id === "About";
    });

    if (aboutIndex < 0) {
        return withoutExistingLanguage.concat([languageMenu]);
    }

    return withoutExistingLanguage.slice(0, aboutIndex).concat([
        languageMenu,
        ...withoutExistingLanguage.slice(aboutIndex)
    ]);
};

const refreshOpenTranslatedSurfaces = async function () {
    const plotLayer = state.browserPlotViewerHost?.layer?.();

    if (plotLayer?.isConnected) {
        openPlotViewerModal(null, { hidden: plotLayer.style.display === "none" });
    }

    if (state.dataEditor.layer?.isConnected && state.dataEditor.datasetName) {
        await browserDataEditorSurface().open(state.dataEditor.datasetName);
    }

    if (state.scriptEditor.layer?.isConnected) {
        await browserScriptEditorSurface().open();
    }

    if (browserFrameSurfaces().get("about")) {
        openAboutModal();
    }

    if (state.settingsLayer?.isConnected) {
        openSettingsModal();
    }

    if (state.devDiagnosticsLayer?.isConnected) {
        openDeveloperDiagnosticsModal();
    }
};

const applyBrowserLanguage = async function (locale) {
    const cleanLocale = String(locale || "").trim();

    if (!cleanLocale || cleanLocale === state.composition?.locale) {
        return;
    }

    writeSelectedLocale(cleanLocale);
    await loadComposition();
    renderComposition();
    browserZoomAdapter.broadcast();
    await refreshOpenTranslatedSurfaces();
};

const sharedMenuCommandHandler = createMainMenuCommandHandler({
    recordCommand() { },
    startRuntime() {
        void ensureRuntimeReady();
    },
    stopRuntime() {
        void stopWebRRuntime("Runtime stopped.");
    },
    refreshWorkspace() {
        void refreshWebRWorkspacePane();
    },
    openWorkspaceFile() {
        void openBrowserWorkspaceFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    saveWorkspaceFile() {
        void saveBrowserWorkspaceFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    setWorkingDirectory() {
        appendTranscript(
            translateCompositionTemplate(
                "WebR uses the browser virtual working directory {path}. Browser directory mounting is not available from this menu yet.",
                `WebR uses the browser virtual working directory ${state.workingDirectoryPath}. Browser directory mounting is not available from this menu yet.`,
                { path: state.workingDirectoryPath }
            )
        );
    },
    openScriptFile() {
        void openSharedScriptEditorLocalFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    focusScriptEditor() {
        void openSharedScriptEditorModal();
    },
    showSettings() {
        openSettingsModal();
    },
    showProductInfo() {
        openAboutModal();
    },
    openDeveloperDiagnostics() {
        openDeveloperDiagnosticsModal();
    },
    runScriptFile() {
        void runBrowserScriptFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    executeDatasetCommand(command) {
        if (isDatasetOpenActiveCommand(command)) {
            void openSharedDataEditorModal(state.activeDatasetName);
            return;
        }

        if (isDatasetGoToCommand(command)) {
            const dialog = findProductDialog("goto");

            if (dialog) {
                void openDialog(dialog);
            }
        }
    },
    openDialog(dialogId) {
        const dialog = findProductDialog(dialogId)
            || findSharedDialog(dialogId);

        if (dialog) {
            void openDialog(dialog);
        }
    },
    async executeProductCommand() { },
    activateFeature(command) {
        if (isPlotViewerOpenCommand(command?.command)) {
            openPlotViewerModal();
        }
    }
});

const executeMenuItem = async function (item) {
    closeMenus();

    const zoomAction = browserZoomActionForMenuRole(item.role);

    if (item.type === "native-role" && zoomAction) {
        browserZoomAdapter.execute(zoomAction);
        return;
    }

    if (item.type === "language") {
        await applyBrowserLanguage(item.locale);
        return;
    }

    if (isWebRSessionPackageMenuCommand(item)) {
        await browserRuntimePackages().installSessionPackages(item.rPackages);
        return;
    }

    if (
        (
            item.type === "product-dialog"
            || item.type === "shared-dialog"
        )
        && item.target
    ) {
        void openDialog(item.target);
        return;
    }

    if (
        item.type === "shell-command"
        && isPlotViewerOpenCommand(item.command)
    ) {
        openPlotViewerModal();
        return;
    }

    sharedMenuCommandHandler(item);
};

const renderMenu = function (menu) {
    if (!elements.menuBar) {
        return;
    }

    if (!state.browserMenuAdapter) {
        state.browserMenuAdapter = createBrowserMenuAdapter({
            menuBar: elements.menuBar,
            isActionSupported: isMenuActionSupported,
            execute: executeMenuItem,
            onError(error) {
                appendTranscript(
                    error instanceof Error ? error.message : String(error),
                    "web-transcript__line--stderr"
                );
            }
        });
    }

    state.browserMenuAdapter.render(insertLanguageMenu(menu || []));
};

const renderComposition = function () {
    const composition = state.composition;

    applyWebShellTranslations();
    renderMenu(composition.menu || []);
    renderWorkspacePane();

    state.console?.toolbar?.render?.();
};

const mountProductPackageLibrary = async function (runtime) {
    const manifest = await fetchBrowserJsonIfAvailable("/api/webr-package-library");

    if (!manifest?.available) {
        return {
            mounted: false
        };
    }

    const result = await mountBrowserProductPackageLibrary(runtime, manifest, {
        setStatus: setRuntimeStatus,
        progressFromStage: runtimeProgressFromStage
    });

    window.dialogForgeWebRPackageLibraryMountSource = result.source || "";
    setRuntimeStatus("Mounting WebR package library...");

    return result;
};

const loadMoodleLaunchDataset = async function (runtime) {
    const launchCode = String(state.moodleLaunchCode || "").trim();

    if (!launchCode || state.moodleLaunchCodeProcessed) {
        return;
    }

    state.moodleLaunchCodeProcessed = true;

    try {
        const result = await loadBrowserMoodleLaunchDataset(runtime, launchCode);

        if (result.loaded) {
            state.activeDatasetName = result.datasetName;
            await refreshWebRWorkspacePane();
        }
    }
    catch (error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }
};

const openMoodleLaunchScriptEditor = async function () {
    if (
        !String(state.moodleLaunchCode || "").trim()
        || state.moodleLaunchScriptEditorOpened
    ) {
        return;
    }

    state.moodleLaunchScriptEditorOpened = true;

    try {
        await waitForBrowserPageFullyLoaded(document, window);
        await openSharedScriptEditorModal(browserMoodleLaunchScriptEditorCode);
    }
    catch (error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }
};

const ensureRuntime = async function () {
    if (state.runtimeReady) {
        return state.runtime;
    }

    if (state.runtimeStartPromise) {
        return state.runtimeStartPromise;
    }

    state.runtimeStarting = true;
    notifyConsoleSession();
    setRuntimeStatus("Starting WebR...");

    state.runtimeStartPromise = (async function () {
        const startQuiet = readTerminalSettings().startQuiet === true;

        state.loadedRuntimePackages.clear();

        const runtime = await startBrowserWebRRuntime({
            baseUrl: "/webr/",
            workingDirectoryPath: state.workingDirectoryPath,
            homeDirectoryPath: state.homeDirectoryPath,
            setStatus: setRuntimeStatus,
            importWebRModule: function () {
                return import("/webr/webr.js");
            },
            mountPackageLibrary: function (runtime) {
                return mountProductPackageLibrary(runtime);
            },
            startQuiet,
            writeStartupOutput: appendTranscript
        });

        state.runtime = runtime;
        state.runtimeReady = true;
        state.activeDatasetName = "";
        setRuntimeStatus("Reading WebR workspace...");
        await refreshWebRWorkspacePane();
        if (String(state.moodleLaunchCode || "").trim()) {
            setRuntimeStatus("Loading launch dataset...");
        }
        await loadMoodleLaunchDataset(runtime);
        setRuntimeStatus("WebR ready");
        prewarmPlotInfrastructure(runtime);
        void cleanupWebRDefaultPlotFile(runtime);

        return runtime;
    })();

    try {
        return await state.runtimeStartPromise;
    }
    finally {
        state.runtimeStartPromise = null;
        state.runtimeStarting = false;
        notifyConsoleSession();
    }
};

const ensureRuntimeReady = async function () {
    await ensureRuntime();

    return state.runtimeReady;
};

const checkCodeFragmentComplete = async function (code) {
    const text = normalizeCommandText(code);

    if (!text.trim()) {
        return "complete";
    }

    if (!state.runtimeReady) {
        return isLikelyIncompleteScriptFragment(text) ? "incomplete" : "complete";
    }

    return checkRScriptFragmentCompleteness(await ensureRuntime(), text);
};

const fetchHelpTopicDocument = async function (topic, packageName = "") {
    const runtime = await ensureRuntime();

    return fetchWebRHelpTopicDocument(
        topic,
        packageName,
        window.location.origin,
        function (command) {
            return captureWebRHiddenText(runtime, command);
        }
    );
};

const fetchHelpTopicHtml = async function (topic, packageName = "") {
    return (await fetchHelpTopicDocument(topic, packageName)).html;
};

const updateHelpViewer = function (topic, html, options = {}) {
    browserHelpViewerSurface().open({
        topic: String(options.topic || topic || ""),
        html: String(html || ""),
        baseUrl: String(options.baseUrl || ""),
        packageName: String(options.packageName || "")
    });
};

const openHelpTopicModal = async function (topic, packageName = "") {
    const cleanTopic = String(topic || "").trim();

    if (!cleanTopic) {
        return;
    }

    const document = await fetchHelpTopicDocument(cleanTopic, packageName);

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
};

const openHelpHomeModal = async function () {
    const runtime = await ensureRuntime();
    const document = await fetchWebRHelpHomeDocument(
        window.location.origin,
        function (command) {
            return captureWebRHiddenText(runtime, command);
        }
    );

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
};

const runHelpExampleInPage = async function (input = {}) {
    const runtime = await ensureRuntime();

    return runWebRHelpExample(input, function (command) {
        return captureWebRHiddenText(runtime, command);
    });
};

const executeBrowserPlotMutation = async function (input = {}) {
    const runtime = await ensureRuntime();

    return executeWebRInvisibleMutation(runtime, input);
};

const handleHelpViewerMessage = async function (event) {
    browserHelpViewerSurface().handleMessage(event);
};

const openBrowserHelpCommandUrl = async function (value) {
    const parsed = parseHelpCommandUrl(value);

    if (!parsed) {
        return { status: "invalid" };
    }

    try {
        if (parsed.kind === "run") {
            return executeVisibleCommand(parsed.value);
        }

        await openHelpTopicModal(parsed.value);
        return { status: "ready" };
    }
    catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error)
        };
    }
};

const fetchBrowserRHelpPage = async function (value) {
    const runtime = await ensureRuntime();

    return fetchWebRHelpPageByUrl(
        value,
        window.location.origin,
        function (command) {
            return captureWebRHiddenText(runtime, command);
        }
    );
};

const installBrowserHelpBridge = function () {
    installBrowserSharedPageBridge(window, {
        openHelpCommandUrl: openBrowserHelpCommandUrl,
        fetchHelpPage: fetchBrowserRHelpPage,
        runHelpExample: runHelpExampleInPage,
        selectImportFile: function () {
            return browserImportAdapter().selectOpenFile();
        },
        planImportFile: function (input) {
            return browserImportAdapter().planFile(input || {});
        },
        previewImportFile: readBrowserImportPreview,
        importData: function (input) {
            return browserImportAdapter().importData(input || {});
        },
        executeInvisibleMutation: executeBrowserPlotMutation,
        savePlot: saveBrowserPlot,
        copyPlot: copyBrowserPlot,
        getConsoleSyntaxModule: function () {
            return import("/browser-esm/src/console/consoleSyntax.js");
        }
    });
};

const refreshWorkspaceAfterVisibleCommand = async function (options) {
    if (options?.deferWorkspaceRefresh) {
        return;
    }

    if (options?.fastWorkspaceRefresh) {
        await refreshWebRWorkspacePaneFast();
        refreshWebRWorkspaceMetadataInBackground();
        return;
    }

    await refreshWebRWorkspaceSurfaces();
};

const webRVisibleCommandRunner = function () {
    if (!state.visibleCommandRunner) {
        state.visibleCommandRunner = createWebRVisibleCommandRunner({
            loadedPackages: state.loadedRuntimePackages,
            ensureRuntime,
            readConsoleOutputWidth: readBrowserConsoleOutputWidth,
            transcript,
            createActivity: function (text, options = {}) {
                return options.preRecorded
                    ? {
                        id: String(options.activityId || `web_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
                        commandText: normalizeConstructedCommandText(text)
                    }
                    : createVisibleCommandActivity(text, String(options.activityId || ""));
            },
            setRuntimeBusy: function (busy) {
                state.console?.session?.setRuntimeBusy?.(busy);
            },
            renderToolbar: function () {
                state.console?.toolbar?.render?.();
            },
            openHelpTopic: openHelpTopicModal,
            maybeOpenPlotViewer: maybeOpenPlotViewerForCommand,
            refreshWorkspace: refreshWorkspaceAfterVisibleCommand,
            updatePlotImages: updatePlotViewerFromCapturedImages,
            requestPrompt: function (input) {
                return webRPromptCoordinator().requestPrompt(input || {});
            }
        });
    }

    return state.visibleCommandRunner;
};

const executeVisibleCommand = async function (text, options = {}) {
    return webRVisibleCommandRunner().execute(text, options);
};

const webRRestartWorkspacePath = "/web/.dialogforge-runtime-restart.RData";

const saveWebRRestartWorkspace = async function () {
    if (!state.runtimeReady || !state.runtime) {
        return null;
    }

    await state.runtime.evalRVoid([
        "save(",
        "list = ls(envir = .GlobalEnv, all.names = TRUE),",
        `file = ${JSON.stringify(webRRestartWorkspacePath)},`,
        "envir = .GlobalEnv",
        ")"
    ].join(" "));

    return await state.runtime.FS.readFile(webRRestartWorkspacePath);
};

const loadWebRRestartWorkspace = async function (bytes) {
    if (!bytes || !state.runtimeReady || !state.runtime) {
        return;
    }

    await state.runtime.FS.writeFile(webRRestartWorkspacePath, bytes);
    await state.runtime.evalRVoid(
        `load(${JSON.stringify(webRRestartWorkspacePath)}, envir = .GlobalEnv)`
    );
};

const stopWebRRuntime = async function (message) {
    await stopBrowserWebRRuntime(state.runtime);

    state.runtime = null;
    state.runtimeStartPromise = null;
    state.runtimeReady = false;
    state.runtimeStarting = false;
    state.loadedRuntimePackages.clear();
    state.completionSessionManager = null;
    state.workspaceController = null;
    state.workspaceControllerRuntime = null;
    state.plotViewerGraphicsWarmupPromise = null;
    state.plotViewerGraphicsWarm = false;
    setRuntimeStatus(message || "WebR stopped");
    notifyConsoleSession();
};

const executeRuntimeMethod = async function (input) {
    return executeWebRRuntimeMethod(input, {
        checkCodeFragmentComplete,
        isRuntimeBusy: function () {
            return Boolean(state.console?.session?.isRuntimeBusy?.());
        },
        setRuntimeStatus,
        setRuntimeBusy: function (busy) {
            state.console?.session?.setRuntimeBusy?.(busy);
        },
        renderToolbar: function () {
            state.console?.toolbar?.render?.();
        },
        getRuntime: function () {
            return state.runtimeReady ? state.runtime : null;
        },
        getPromptCoordinator: webRPromptCoordinator
    });
};
const initializeSharedConsole = async function () {
    const readRuntimeStatus = function () {
        if (state.runtimeReady) return "ready";
        if (state.runtimeStarting) return "starting";
        return "not-started";
    };
    const readRuntimeSnapshot = function () {
        if (state.runtimeReady) return runtimeSnapshot("ready", "WebR ready.");
        if (state.runtimeStarting) return runtimeSnapshot("starting", "WebR is starting.");

        return runtimeSnapshot("stopped", "WebR not started.");
    };

    const consoleBootstrap = await createBrowserConsoleBootstrap({
        document,
        productId: String(state.composition?.product?.id || "base"),
        runtimeId: String(state.composition?.runtime?.id || "webr"),
        completionOptions: {
            initialTerminalSymbols: rDefaultTerminalSymbols || [],
            suppressedTerminalSymbols: rInternalCompletionSymbolNames || [],
            contextParser: getRCompletionContext,
            packageRequestParser: readRRequestedPackages,
            completionFetch: async function (params) {
                return readWebRConsoleCompletionResult(params, {
                    runtimeSessionManager: webRCompletionSessionManager(),
                    isRuntimeBusy: function () {
                        return Boolean(state.console?.session?.isRuntimeBusy?.());
                    },
                    workspaceObjectNames,
                    workspaceEntries,
                    workspaceColumnNames
                });
            }
        },
        readRuntimeStatus,
        readRuntimeSnapshot,
        startRuntimeSession: async function () {
            await ensureRuntime();

            return runtimeSnapshot("ready", "WebR ready.");
        },
        renderStatus: function (snapshot) {
            setRuntimeStatus(snapshot.message || snapshot.status || "Runtime status changed.");
        },
        readHistory: async function (scope) {
            return browserConsoleHistoryStore.read(scope);
        },
        writeHistory: function (request) {
            browserConsoleHistoryStore.write(request);
        },
        executeRuntimeMethod,
        executeVisibleCommand: async function (input) {
            return executeVisibleCommand(String(input?.text || ""), {
                outputWidth: input?.outputWidth
            });
        },
        buildContextualHelpRequest: buildRContextualHelpRequest,
        parseHelpCommand: parseRConsoleHelpCommand,
        openHelpTopic: function (input) {
            const topic = String(input.topic || "").trim();
            const packageName = String(input.package || "").trim();
            const operation = input.kind === "home"
                ? openHelpHomeModal()
                : openHelpTopicModal(topic, packageName);

            operation.catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        },
        writeClipboardText: function (text) {
            return browserHostAdapter.writeClipboardText(String(text || ""));
        },
        appendMessage: appendTranscript,
        readRestartVersion: readWebRRestartVersion,
        getWorkingDirectoryPath: function () {
            return state.workingDirectoryPath;
        },
        getHomeDirectoryPath: function () {
            return state.homeDirectoryPath;
        },
        getActiveDatasetName: function () {
            return state.activeDatasetName;
        },
        getProductStateChips: function () {
            return state.productStateChips || [];
        },
        translate: function (key) {
            return String(key || "");
        },
        setWorkingDirectoryPaths: function (path, home) {
            state.workingDirectoryPath = String(path || state.workingDirectoryPath);
            state.homeDirectoryPath = String(home || state.homeDirectoryPath);
        },
        readWorkingDirectory: async function () {
            return {
                path: state.workingDirectoryPath,
                home: state.homeDirectoryPath
            };
        },
        restartRuntime: async function (action) {
            try {
                const savedWorkspace = action === "restore"
                    ? await saveWebRRestartWorkspace()
                    : null;

                await stopWebRRuntime("Restarting R...");
                await ensureRuntime();
                await loadWebRRestartWorkspace(savedWorkspace);
                await refreshWebRWorkspacePane();

                return runtimeSnapshot("ready", "WebR ready.");
            }
            catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : String(error);

                appendTranscript(message, "web-transcript__line--stderr");
                setRuntimeStatus(message);

                return runtimeSnapshot("failed", message);
            }
        },
        refreshWorkspace: async function () {
            await refreshWebRWorkspacePane();
        }
    });
    const { session, completionModel, commandHistory, coordinator, toolbar } = consoleBootstrap;

    completionModel.ingestObjectNames(filterRInternalCompletionSymbols(workspaceObjectNames()));

    state.console = {
        session,
        completionModel,
        commandHistory,
        coordinator,
        toolbar,
        executeVisibleCommand,
        waitForPlotWarmup: async function () {
            if (state.runtimeReady && !state.plotViewerGraphicsWarmupPromise) {
                prewarmPlotInfrastructure(state.runtime);
            }

            await state.plotViewerGraphicsWarmupPromise;
            await waitForPlotViewerFrameReady();

            return {
                frameReady: browserPlotViewerHost().isFrameReady(),
                graphicsWarm: state.plotViewerGraphicsWarm
            };
        }
    };
    exposeBrowserConsoleHandle(window, state.console);
    session.onDidRuntimeBusy(function () {
        toolbar.render();
    });
    session.onDidSessionPhase(function () {
        toolbar.render();
    });
    coordinator.initializeFlow();
    await coordinator.initializeInput();
    coordinator.focus();
    toolbar.render();
    prewarmPlotViewerModal();

    document.getElementById("consoleToolbarStart")?.addEventListener("click", () => {
        ensureRuntime().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarStop")?.addEventListener("click", () => {
        executeRuntimeMethod({ method: "runtime.interrupt", params: {} }).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarRestart")?.addEventListener("click", () => {
        toolbar.restartClean().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarRestartWorkspace")?.addEventListener("click", () => {
        toolbar.restartRestoreWorkspace().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarClear")?.addEventListener("click", () => {
        toolbar.clearTranscript();
        coordinator.focus();
    });
    document.getElementById("consoleToolbarInfo")?.addEventListener("click", () => {
        openDeveloperDiagnosticsModal();
    });
    document.getElementById("workspacePaneToggle")?.addEventListener("click", () => {
        toggleWorkspacePane();
    });

    return coordinator;
};

const closeDialogLayerForMessage = function (message, sourceWindow) {
    const dialogId = String(message?.dialogId || message?.dialogID || "").trim();
    const layer = findBrowserDialogLayerForMessage(
        document,
        message,
        sourceWindow
    );

    layer?.remove();

    if (
        (dialogId && state.commandPreviewDialogId === dialogId)
        || !document.querySelector(".dialogforge-web-dialog-layer[data-dialog-id]")
    ) {
        updateCommandPane("").catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    }
};

const handleBrowserDialogStateCall = function (callName, parameters) {
    return routeDialogStateCall(callName, parameters, {
        state: state.dialogBindingState,
        onFilterStateChanged(dataset) {
            notifyBrowserDialogsStateChanged(dataset);
        },
        onConsoleStateChanged(dataset) {
            refreshBrowserConsoleStateChips(dataset);
        }
    });
};

const handleBrowserDialogExternalCall = async function (name, parameters) {
    return routeDialogHostExternalCall(name, parameters, {
        getActiveDataset() {
            return state.activeDatasetName || "";
        },
        setActiveDataset(datasetName) {
            setActiveWorkspaceDataset(datasetName);
        },
        clearActiveDataset() {
            state.activeDatasetName = "";
            renderWorkspacePane();
            refreshBrowserConsoleStateChips("");
        },
        listDatasets: browserDialogDatasets,
        getDatasetEditorState() {
            return {
                datasetName: state.dataEditor.datasetName || state.activeDatasetName || "",
                activeTab: state.dataEditor.activeTab || "data",
                selectedVariableIndex: state.dataEditor.selectedVariableIndex || 0,
                selectedCell: state.dataEditor.selectedCell || null
            };
        },
        goToDatasetVariable(variableName) {
            const datasetName = state.dataEditor.datasetName || state.activeDatasetName || "";

            if (datasetName) {
                return handleBrowserGoToStateUpdate({
                    dataset: datasetName,
                    value: { variableName }
                });
            }
        },
        goToDatasetCase(caseNumber) {
            const datasetName = state.dataEditor.datasetName || state.activeDatasetName || "";

            if (datasetName) {
                return handleBrowserGoToStateUpdate({
                    dataset: datasetName,
                    value: { caseNumber }
                });
            }
        },
        fallback(name, parameters) {
            return browserDialogExternalCallHost().call(name, parameters);
        }
    });
};

const browserDialogChannels = function () {
    if (!state.dialogChannelAdapter) {
        state.dialogChannelAdapter = createDialogChannelAdapter({
            getWorkingDirectory() {
                return state.workingDirectoryPath || "/";
            },
            readVariableValues(input) {
                return browserDatasetChannels().readDialogVariableValues(input);
            },
            loadRuntimePackages,
            executeVisibleCommand,
            callExternal(name, parameters) {
                return handleBrowserDialogExternalCall(name, parameters);
            },
            handleStateCall: handleBrowserDialogStateCall,
            readConsoleStateChips(dataset) {
                return readBrowserConsoleStateChips(dataset);
            }
        });
    }

    return state.dialogChannelAdapter;
};

const postBrowserPreloadEvent = function (sourceWindow, channel, ...args) {
    browserZoomAdapter.postToWindow(sourceWindow);
    browserPreloadHostRouter.postEvent(sourceWindow, channel, ...args);
};

const postSharedDialogCreatedEvent = async function (frame, dialogId, dialogPayload = null) {
    const cleanId = String(dialogId || "").trim();

    if (!frame?.contentWindow || !cleanId) {
        return;
    }

    let payload = dialogPayload;

    if (state.runtimeReady) {
        await refreshWebRWorkspacePane();
    }

    if (!payload) {
        const response = await fetch(`/api/dialog/${encodeURIComponent(cleanId)}`);

        if (!response.ok) {
            throw new Error(await response.text());
        }

        payload = await response.json();
    }

    const workspaceData = readBrowserDialogWorkspaceData();
    const dialogSource = Object.assign({}, payload.source || {});

    if (payload.actions && !dialogSource.customJS) {
        dialogSource.customJS = String(payload.actions || "");
    }

    postBrowserPreloadEvent(frame.contentWindow, dialogRuntimeEventChannels.created, {
        dialogID: cleanId,
        data: dialogSource,
        workspaceData
    });
    window.setTimeout(() => {
        postBrowserPreloadEvent(
            frame.contentWindow,
            dialogRuntimeEventChannels.incomingData,
            workspaceData
        );
    }, 0);
    clearDialogOpeningCover(cleanId);
};

const readBrowserDialogWorkspaceData = function () {
    return createProductDialogWorkspaceDataFromEntries(
        workspaceEntries(),
        { activeDataset: state.activeDatasetName || "" }
    );
};

const invalidateBrowserDataset = async function (datasetName) {
    state.dataEditor.cache.delete(String(datasetName || "").trim());
    await refreshWebRWorkspacePane();
};

const browserDatasetChannels = function () {
    if (!state.datasetChannelAdapter) {
        const datasetEditorRuntime = browserDatasetEditorRuntimeBindings();

        state.datasetChannelAdapter = createWebRDatasetChannelAdapter({
            initialRows: DATA_EDITOR_INITIAL_ROWS,
            initialColumns: DATA_EDITOR_INITIAL_COLUMNS,
            variableOverscanRows: DATA_EDITOR_VARIABLE_OVERSCAN_ROWS,
            ensureRuntime,
            readSnapshot: datasetEditorRuntime.readSnapshot,
            readVariableBatch: datasetEditorRuntime.readVariableBatch,
            writeCellValue: datasetEditorRuntime.writeCellValue,
            writeVariableName: datasetEditorRuntime.writeVariableName,
            writeVariableAttribute: datasetEditorRuntime.writeVariableAttribute,
            writeValueLabels: datasetEditorRuntime.writeValueLabels,
            invalidateDataset: invalidateBrowserDataset
        });
    }

    return state.datasetChannelAdapter;
};

const browserWorkspaceChannels = function () {
    if (!state.workspaceChannelAdapter) {
        state.workspaceChannelAdapter = createWorkspaceChannelAdapter({
            getDataEditorDatasetName() {
                return state.dataEditor.datasetName || "";
            },
            setDataEditorDatasetName(name) {
                state.dataEditor.datasetName = String(name || "").trim();
            },
            getActiveDatasetName() {
                return state.activeDatasetName || "";
            },
            setActiveDataset: setActiveWorkspaceDataset,
            clearActiveDataset() {
                state.activeDatasetName = "";
                renderWorkspacePane();
                refreshBrowserConsoleStateChips("");
            }
        });
    }

    return state.workspaceChannelAdapter;
};

const browserGeneralChannels = function () {
    if (!state.generalChannelAdapter) {
        state.generalChannelAdapter = createGeneralChannelAdapter(browserHostAdapter);
    }

    return state.generalChannelAdapter;
};

const handlePlotViewerMessage = async function (event) {
    await browserPlotViewerHost().handleMessage(event);
};

const waitForPlotViewerRender = function (renderToken, timeoutMs = 1200) {
    return browserPlotViewerHost().waitForRender(renderToken, timeoutMs);
};

const updatePlotViewerFromCapturedImages = async function (images) {
    await browserPlotViewerHost().updateFromCapturedImages(images);
};

const openPlotViewerModal = function (payload, options = {}) {
    browserPlotViewerHost().open(payload, options);
};

const prewarmPlotViewerModal = function () {
    browserPlotViewerHost().prewarm();
};

const waitForPlotViewerFrameReady = function (timeoutMs = 2500) {
    return browserPlotViewerHost().waitForFrameReady(timeoutMs);
};


const prewarmWebRGraphicsCapture = function (runtime) {
    if (!runtime?.Shelter || state.plotViewerGraphicsWarmupPromise) {
        return state.plotViewerGraphicsWarmupPromise;
    }

    state.plotViewerGraphicsWarmupPromise = runWebRGraphicsPrewarm(runtime, {
        closeImages: closeBrowserCapturedPlotImages
    }).then((result) => {
        state.plotViewerGraphicsWarm = result;
        void cleanupWebRDefaultPlotFile(runtime);

        return result;
    });

    return state.plotViewerGraphicsWarmupPromise;
};

const prewarmPlotInfrastructure = function (runtime) {
    prewarmPlotViewerModal();
    prewarmWebRGraphicsCapture(runtime);
};

const maybeOpenPlotViewerForCommand = function (text) {
    if (!isRPlotCommand(text)) {
        return;
    }

    prewarmPlotViewerModal();
};

const browserRuntimePackages = function () {
    if (!state.runtimePackageAdapter) {
        state.runtimePackageAdapter = createWebRRuntimePackageAdapter({
            loadedPackages: state.loadedRuntimePackages,
            packageRequirementsByDialogId: dialogRuntimePackageRequirements,
            createActivity: createVisibleCommandActivity,
            finishActivity: finishVisibleCommandActivity,
            recordRuntimeMessageStream(message) {
                transcript()?.recordRuntimeMessageStream?.(message);
            },
            setRuntimeBusy(busy) {
                state.console?.session?.setRuntimeBusy?.(busy);
            },
            renderToolbar() {
                state.console?.toolbar?.render?.();
            },
            ensureRuntime,
            captureHiddenText: captureWebRHiddenText,
            executeVisibleCommand
        });
    }

    return state.runtimePackageAdapter;
};

const loadRuntimePackages = function (packages, options = {}) {
    return browserRuntimePackages().loadPackages(packages, options);
};

const ensureDialogRuntimePackages = function (dialogPayload) {
    return browserRuntimePackages().ensureDialogPackages(dialogPayload);
};

const openDialog = async function (dialog) {
    showDialogOpeningCover(dialog);

    let dialogPayload;
    let contentSize;

    try {
        const response = await fetch(`/api/dialog/${encodeURIComponent(dialog.id)}`);

        if (!response.ok) {
            throw new Error(await response.text());
        }

        dialogPayload = await response.json();
        contentSize = await readDialogContentSize(dialog, fetchBrowserJsonIfAvailable);

        await ensureDialogRuntimePackages(dialogPayload);
    }
    catch (error) {
        clearDialogOpeningCover(dialog.id);
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
        return;
    }

    const result = browserFrameSurfaces().open({
        id: dialog.id,
        title: dialog.label || dialog.id,
        src: `/src/base-app/pages/dialogBuilder.html?dialog=${encodeURIComponent(dialog.id)}`,
        width: contentSize.width,
        height: contentSize.height + 32,
        role: "dialog",
        ariaModal: true,
        frameTitle: dialog.label || dialog.id,
        storageKey: `dialog.${dialog.id}`,
        onClose: function () {
            if (
                state.commandPreviewDialogId === dialog.id
                || !document.querySelector(".dialogforge-web-dialog-layer[data-dialog-id]")
            ) {
                updateCommandPane("").catch((error) => {
                    appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
                });
            }
        },
        onFrameLoad: function () {
            postSharedDialogCreatedEvent(result.frame, dialog.id, dialogPayload).catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        }
    });

    result.layer.dataset.dialogId = dialog.id;
    result.frame.focus();
};

installBrowserShellEventBindings({
    window,
    document,
    menuBar: elements.menuBar,
    routePreloadMessage(event) {
        return browserPreloadHostRouter.routeMessage(event);
    },
    handlePlotViewerMessage,
    handleHelpViewerMessage,
    closeMenus,
    handleKeyDown: handleBrowserKeyDown,
    onError(error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }
});

browserWorkbenchLayout().install();
browserCommandPreviewController().bind();
installBrowserHelpBridge();
installModelessSurfaceActivation(
    "workbench",
    document.getElementById("webWorkbenchWindow")
);
activateModelessSurface("workbench");

state.moodleLaunchCode = readBrowserMoodleLaunchCode();
browserZoomAdapter.apply(browserZoomAdapter.readZoomFactor(), { persist: false });

loadComposition()
    .then(async () => {
        await initializeSharedConsole();
        renderComposition();
        await ensureRuntime();
        await waitForBrowserAnimationFrameSettled(window);
        browserZoomAdapter.broadcast();
        await openMoodleLaunchScriptEditor();
    })
    .catch((error) => {
        console.error(error);
        state.runtimeReady = false;
        state.runtimeStarting = false;
        state.runtimeStartPromise = null;
        state.workspaceController = null;
        state.workspaceControllerRuntime = null;
        notifyConsoleSession();
        setRuntimeStatus(state.composition ? "WebR failed" : "Composition failed.");
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
