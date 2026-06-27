"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const composeApplication_1 = require("../shared/base-app/bootstrap/composeApplication");
const productResolver_1 = require("../shared/base-app/bootstrap/productResolver");
const applicationEvents_1 = require("../shared/base-app/bootstrap/applicationEvents");
const consoleHistorySettingsStore_1 = require("../shared/console/services/consoleHistorySettingsStore");
const consoleHistoryIpcController_1 = require("../shared/console/services/consoleHistoryIpcController");
const importFileController_1 = require("../shared/runtime/tabular-data/importFileController");
const importFileIpcController_1 = require("../shared/runtime/tabular-data/importFileIpcController");
const externalCallIpcController_1 = require("../shared/dialog-runtime/custom-js/externalCallIpcController");
const productDialogRuntimeComposition_1 = require("../shared/dialog-runtime/dialog-builder/productDialogRuntimeComposition");
const productDialogComposition_1 = require("../shared/dialog-runtime/dialog-builder/productDialogComposition");
const datasetEditorWarmCache_1 = require("../shared/dataset-editor/main-process/datasetEditorWarmCache");
const datasetEditorComposition_1 = require("../shared/dataset-editor/main-process/datasetEditorComposition");
const datasetEditorSettings_1 = require("../shared/dataset-editor/main-process/datasetEditorSettings");
const datasetViewerReadIpcController_1 = require("../shared/dataset-editor/main-process/datasetViewerReadIpcController");
const scriptEditorComposition_1 = require("../shared/script-editor/main-process/scriptEditorComposition");
const shellFileDialogController_1 = require("../shared/shell-electron/filesystem/shellFileDialogController");
const shellFileDialogIpcController_1 = require("../shared/shell-electron/filesystem/shellFileDialogIpcController");
const plotDownloadController_1 = require("../shared/shell-electron/external/plotDownloadController");
const externalWindowComposition_1 = require("../shared/shell-electron/external/externalWindowComposition");
const mainWindowComposition_1 = require("../shared/shell-electron/windows/mainWindowComposition");
const workspacePaneWindowComposition_1 = require("../shared/shell-electron/windows/workspacePaneWindowComposition");
const applicationShellIpcComposition_1 = require("../shared/shell-electron/windows/applicationShellIpcComposition");
const runtimeLifecycleComposition_1 = require("../shared/shell-electron/lifecycle/runtimeLifecycleComposition");
const electronApplicationLifecycle_1 = require("../shared/shell-electron/lifecycle/electronApplicationLifecycle");
const workspaceQuitDialogController_1 = require("../shared/shell-electron/lifecycle/workspaceQuitDialogController");
const runtimeRecoveryDialogController_1 = require("../shared/shell-electron/lifecycle/runtimeRecoveryDialogController");
const runtimeRestartComposition_1 = require("../shared/shell-electron/lifecycle/runtimeRestartComposition");
const runtimeIpcComposition_1 = require("../shared/shell-electron/runtime/runtimeIpcComposition");
const runtimeSessionComposition_1 = require("../shared/shell-electron/runtime/runtimeSessionComposition");
const electronSmokeRunner_1 = require("../shared/shell-electron/smoke/electronSmokeRunner");
const rHelpServer_1 = require("../shared/runtime/providers/r/help/rHelpServer");
const rHelpPageProxy_1 = require("../shared/runtime/providers/r/help/rHelpPageProxy");
const nodeResourceClient_1 = require("../shared/core/host/nodeResourceClient");
const packageInstallDialogController_1 = require("../shared/runtime/providers/r/dependencies/packageInstallDialogController");
const settingsStorage_1 = require("../shared/shell-electron/settings/settingsStorage");
const applicationSupportWindowComposition_1 = require("../shared/shell-electron/windows/applicationSupportWindowComposition");
const args = process.argv.slice(2);
const readOption = function (name, fallback) {
    for (let index = args.length - 2; index >= 0; index -= 1) {
        if (args[index] === "--" + name && args[index + 1]) {
            return args[index + 1];
        }
    }
    return fallback;
};
const rootDir = path.resolve(__dirname, "..");
const productPathArg = readOption("product-path", "")
    || String(process.env.DIALOGFORGE_PRODUCT_PATH || "").trim();
const requestedProduct = readOption("product", "") || "base";
const runtime = readOption("runtime", "r");
const requestedLocale = readOption("locale", "");
const electronSmokeMode = process.env.DIALOGFORGE_ELECTRON_SMOKE === "1";
const electronSmokeTarget = String(process.env.DIALOGFORGE_ELECTRON_SMOKE_TARGET || "console").trim();
const testUserDataPath = String(process.env.DIALOGFORGE_TEST_USER_DATA_PATH || "").trim();
if (testUserDataPath) {
    electron_1.app.setPath("userData", testUserDataPath);
}
let location;
try {
    location = (0, productResolver_1.resolveProductLocation)(rootDir, requestedProduct, productPathArg);
}
catch (error) {
    console.error("Startup Error:", error.message);
    electron_1.dialog.showErrorBox("Startup Error", error.message);
    electron_1.app.quit();
    process.exit(1);
}
const product = location.id;
const initialSettings = (0, settingsStorage_1.readEffectiveSettings)({
    systemSettingsPath: location.settingsPath,
    userSettingsPath: path.join(electron_1.app.getPath("userData"), "settings.json")
});
let locale = requestedLocale
    || String(initialSettings.defaultLanguage
        || initialSettings.languageNS
        || "en_US");
const composition = (0, composeApplication_1.composeApplication)({
    rootDir,
    location,
    runtime,
    locale
});
const applyLocale = function (nextLocale) {
    const localizedComposition = (0, composeApplication_1.composeApplication)({
        rootDir,
        location,
        runtime,
        locale: nextLocale
    });
    locale = localizedComposition.locale;
    composition.locale = localizedComposition.locale;
    composition.i18n = localizedComposition.i18n;
    composition.features = localizedComposition.features;
    composition.productCapabilities =
        localizedComposition.productCapabilities;
    composition.productAbout = localizedComposition.productAbout;
    composition.startupTasks = localizedComposition.startupTasks;
    composition.menu = localizedComposition.menu;
    try {
        void productDialogComposition.windowController.refreshLanguage();
    }
    catch { }
};
process.env.DIALOGFORGE_PRODUCT = product;
process.env.DIALOGFORGE_ROOT = composition.rootDir;
const rHelpServer = (0, rHelpServer_1.createRHelpServer)();
const resourceClient = (0, nodeResourceClient_1.createNodeResourceClient)();
const rHelpPageProxy = (0, rHelpPageProxy_1.createRHelpPageProxy)({
    rewriteUrl: rHelpServer.rewriteUrl,
    resourceClient
});
let runtimeSessionManager;
let mainWindow = null;
let runtimeLifecycleComposition;
let productDialogComposition;
let datasetEditorComposition;
const mainWindowMinWidth = 800;
const mainWindowMinHeight = 600;
const plotDownloadController = (0, plotDownloadController_1.createPlotDownloadController)({
    resourceClient
});
let externalWindowComposition;
let scriptEditorComposition;
const runtimeBootLogPath = "/tmp/dialogforge-runtime-boot.log";
const appendRuntimeBootLog = function (message) {
    try {
        fs.appendFileSync(runtimeBootLogPath, `${new Date().toISOString()} ${message}\n`);
    }
    catch { }
};
const listDatasetEditorDatasetNames = async function () {
    const workspace = await runtimeSessionManager.listWorkspaceObjects();
    return workspace.objects.filter((object) => {
        return object.capabilities.includes("tabular.read");
    }).map((object) => {
        return object.name;
    });
};
const settingsStoragePaths = function () {
    return {
        systemSettingsPath: location.settingsPath,
        userSettingsPath: path.join(electron_1.app.getPath("userData"), "settings.json")
    };
};
const workspacePaneWindowController = (0, workspacePaneWindowComposition_1.createWorkspacePaneWindowComposition)({
    ipcMain: electron_1.ipcMain,
    screen: electron_1.screen,
    minimumWidth: mainWindowMinWidth,
    readSettings: function () {
        return (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        (0, settingsStorage_1.writeUserSettings)(settingsStoragePaths(), settings);
    }
});
const userDialogsDirectory = function () {
    return path.join(electron_1.app.getPath("userData"), "dialogs");
};
const datasetEditorSettings = (0, datasetEditorSettings_1.createDatasetEditorSettings)({
    readSettings: function () {
        return (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        (0, settingsStorage_1.writeUserSettings)(settingsStoragePaths(), settings);
    }
});
const readDatasetEditorVariableColumnWidths = datasetEditorSettings.readVariableColumnWidths;
const writeDatasetEditorVariableColumnWidths = datasetEditorSettings.writeVariableColumnWidths;
const datasetEditorUiCommandVisibility = datasetEditorSettings.uiCommandVisibility;
const uiActionCommandVisibility = datasetEditorSettings.uiCommandVisibility;
const consoleHistorySettingsStore = (0, consoleHistorySettingsStore_1.createConsoleHistorySettingsStore)({
    defaultProductId: product,
    defaultRuntimeId: runtime,
    readSettings: function () {
        return (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        (0, settingsStorage_1.writeUserSettings)(settingsStoragePaths(), settings);
    }
});
(0, consoleHistoryIpcController_1.createConsoleHistoryIpcController)({
    ipcMain: electron_1.ipcMain,
    historyStore: consoleHistorySettingsStore
});
const runtimeSessionBootstrap = (0, runtimeSessionComposition_1.createRuntimeSessionComposition)({
    location,
    composition,
    runtimeId: runtime,
    productId: product,
    forwardTranscriptEvents: function (events) {
        sendTranscriptEvents(events);
    },
    handleUnexpectedExit: function (details) {
        void handleUnexpectedRuntimeExit(details);
    }
});
runtimeSessionManager = runtimeSessionBootstrap.runtimeSessionManager;
const dialogExternalCallHost = runtimeSessionBootstrap.dialogExternalCallHost;
const readDialogFilterState = runtimeSessionBootstrap.readFilterState;
const readConsoleStateChips = runtimeSessionBootstrap.readConsoleStateChips;
const shouldPublishConsoleStateChips = runtimeSessionBootstrap.shouldPublishConsoleStateChips;
const datasetEditorWarmCache = (0, datasetEditorWarmCache_1.createDatasetEditorWarmCache)(runtimeSessionManager);
const importFileController = (0, importFileController_1.createImportFileController)({
    executeRuntimeMethod: function (request) {
        return runtimeSessionManager.executeRuntimeMethod(request);
    }
});
(0, importFileIpcController_1.createImportFileIpcController)({
    ipcMain: electron_1.ipcMain,
    importFileController
});
const invalidateInitialDatasetPreview = datasetEditorWarmCache.invalidate;
const readInitialDatasetPreview = datasetEditorWarmCache.readPreview;
const readInitialVariableMetadataBatch = datasetEditorWarmCache.readVariableMetadata;
const warmInitialDatasetPreview = datasetEditorWarmCache.warmPreview;
const warmInitialVariableMetadata = datasetEditorWarmCache.warmVariableMetadata;
(0, datasetViewerReadIpcController_1.createDatasetViewerReadIpcController)({
    ipcMain: electron_1.ipcMain,
    runtimeSessionManager,
    readInitialDatasetPreview,
    readInitialVariableMetadataBatch,
    getFilterState: function (objectName) {
        return readDialogFilterState(objectName);
    }
});
composition.runtimeSession = runtimeSessionManager.getSnapshot();
const captureWorkspaceBaseline = async function (source) {
    await runtimeLifecycleComposition.captureWorkspaceBaseline(source);
};
const handleUnexpectedRuntimeExit = async function (details) {
    await runtimeLifecycleComposition.handleUnexpectedRuntimeExit(details);
};
const autoStartRuntime = async function () {
    await runtimeLifecycleComposition.autoStartRuntime();
};
const sendToAllWindows = function (channel, payload) {
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(channel, payload);
    });
};
(0, externalCallIpcController_1.createDialogExternalCallIpcController)({
    ipcMain: electron_1.ipcMain,
    host: dialogExternalCallHost,
    publishFilterState: function (dataset) {
        sendToAllWindows("filterStateChanged", {
            dataset,
            filter: dataset
                ? readDialogFilterState(dataset)
                : null
        });
    },
    shouldPublishConsoleStateChips,
    readConsoleStateChips,
    publishConsoleStateChips: function (chips) {
        sendToAllWindows(applicationEvents_1.applicationEventChannels.productConsoleStateChips, chips);
    }
});
const sendMenuCommand = function (command) {
    if (command.command === "app.showSettings") {
        createSettingsWindow();
        return;
    }
    if (command.command === "app.showProductInfo") {
        createAboutWindow();
        return;
    }
    if (command.command === "app.showDialogRuntimeRequirements") {
        createDialogRuntimeRequirementsWindow();
        return;
    }
    sendToAllWindows(applicationEvents_1.applicationEventChannels.menuCommand, command);
};
const runtimeIpcComposition = (0, runtimeIpcComposition_1.createRuntimeIpcComposition)({
    ipcMain: electron_1.ipcMain,
    clipboard: electron_1.clipboard,
    runtimeSessionManager,
    datasetWarmCache: datasetEditorWarmCache,
    datasetEditorUiCommandVisibility,
    setRuntimeSessionSnapshot: function (snapshot) {
        composition.runtimeSession = snapshot;
    },
    captureWorkspaceBaseline,
    scriptEditorSessionState: function (channel, payload) {
        scriptEditorComposition.windowController.send(channel, payload);
    },
    refreshProductDialogWorkspaceData: function (snapshot) {
        return productDialogComposition.windowController
            .refreshWorkspaceData("", snapshot);
    },
    hasDatasetEditorWindow: function () {
        return Boolean(datasetEditorComposition.windowController.getWindow());
    },
    sendDatasetEditor: function (channel, payload) {
        datasetEditorComposition.windowController.send(channel, payload);
    },
    presentRuntimeEvents: function (snapshot) {
        externalWindowComposition.plotViewerController
            .presentRuntimeEvents(snapshot);
    },
    reportError: function (error) {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});
const { sendRuntimeSession, sendTranscriptEvents, refreshWorkspaceAndBroadcast, sendActiveDataset, broadcastRuntimeEvents, executeVisibleCommandAndBroadcast } = runtimeIpcComposition;
(0, productDialogRuntimeComposition_1.registerProductDialogRuntimeComposition)({
    ipcMain: electron_1.ipcMain,
    runtimeSessionManager,
    productId: product,
    getUiCommandVisibility: uiActionCommandVisibility,
    executeVisibleCommandAndBroadcast,
    sendTranscriptEvents,
    invalidateDatasetPreview: invalidateInitialDatasetPreview,
    refreshWorkspaceAndBroadcast,
    broadcastRuntimeEvents,
    reportError: function (error) {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});
const ensureRuntimeReadyForScriptEditor = async function () {
    const snapshot = await runtimeSessionManager.start();
    composition.runtimeSession = snapshot;
    sendRuntimeSession(snapshot);
    return snapshot.status === "ready";
};
const mainWindowComposition = (0, mainWindowComposition_1.createMainWindowComposition)({
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    title: composition.windowTitle,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    minimumWidth: mainWindowMinWidth,
    minimumHeight: mainWindowMinHeight,
    showOnReady: function () {
        return !electronSmokeMode || electronSmokeTarget === "workspace-pane";
    },
    readSettings: function () {
        return (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        (0, settingsStorage_1.writeUserSettings)(settingsStoragePaths(), settings);
    },
    workspacePaneWindowController
});
const mainWindowZoomController = mainWindowComposition.zoomController;
const createMainWindow = mainWindowComposition.createWindow;
const translateCompositionText = function (key, values = {}) {
    let text = String(composition.i18n[key] || key);
    Object.entries(values).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, value);
    });
    return text;
};
const shellFileDialogController = (0, shellFileDialogController_1.createShellFileDialogController)({
    dialog: electron_1.dialog,
    translate: translateCompositionText
});
(0, shellFileDialogIpcController_1.createShellFileDialogIpcController)({
    ipcMain: electron_1.ipcMain,
    fileDialogController: shellFileDialogController
});
const packageInstallDialogController = (0, packageInstallDialogController_1.createPackageInstallDialogController)({
    dialog: electron_1.dialog,
    translate: translateCompositionText
});
const workspaceQuitDialogController = (0, workspaceQuitDialogController_1.createWorkspaceQuitDialogController)({
    dialog: electron_1.dialog,
    translate: translateCompositionText
});
const runtimeRecoveryDialogController = (0, runtimeRecoveryDialogController_1.createRuntimeRecoveryDialogController)({
    dialog: electron_1.dialog,
    productName: composition.product.name
});
runtimeLifecycleComposition = (0, runtimeLifecycleComposition_1.createRuntimeLifecycleComposition)({
    runtimeSessionManager,
    composition,
    productId: product,
    runtimeId: runtime,
    appendBootLog: appendRuntimeBootLog,
    sendRuntimeSession,
    chooseRecoveryAction: runtimeRecoveryDialogController.chooseRecoveryAction,
    refreshWorkspaceAndBroadcast,
    getScriptEditor: function () {
        return {
            getWindow: scriptEditorComposition.windowController.getWindow,
            isDirty: scriptEditorComposition.isDirty,
            isRendererReady: scriptEditorComposition.isRendererReady,
            requestSaveForClose: scriptEditorComposition.requestSaveForClose,
            saveDirtyContent: scriptEditorComposition.saveDirtyContent,
            allowClose: scriptEditorComposition.allowClose
        };
    },
    getMainWindow: function () {
        return mainWindow;
    },
    chooseWorkspaceQuitAction: workspaceQuitDialogController.chooseWorkspaceQuitAction,
    showWorkspaceSaveFailure: workspaceQuitDialogController.showWorkspaceSaveFailure,
    quitApp: function () {
        electron_1.app.quit();
    }
});
const applicationSupportWindows = (0, applicationSupportWindowComposition_1.createApplicationSupportWindowComposition)({
    app: electron_1.app,
    ipcMain: electron_1.ipcMain,
    dialog: electron_1.dialog,
    composition,
    productId: product,
    settingsPath: location.settingsPath,
    localePath: location.i18nPath,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    userDialogsDirectory,
    getMainWindow: function () {
        return mainWindow;
    },
    readSettings: function () {
        return (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        (0, settingsStorage_1.writeUserSettings)(settingsStoragePaths(), settings);
    },
    sendMenuCommand,
    sendToAllWindows,
    applyLocale,
    translate: translateCompositionText
});
const installApplicationMenu = applicationSupportWindows.installApplicationMenu;
const createSettingsWindow = applicationSupportWindows.createSettingsWindow;
const createDialogRuntimeRequirementsWindow = applicationSupportWindows.createDialogRuntimeRequirementsWindow;
const createMenuCustomizationWindow = applicationSupportWindows.createMenuCustomizationWindow;
const createAboutWindow = applicationSupportWindows.createAboutWindow;
const findDialogDefinitionForMenu = applicationSupportWindows.findDialogDefinition;
const findProductDialogDefinition = function (dialogId) {
    const registered = composition.productDialogs.find((dialogDefinition) => {
        return dialogDefinition.id === dialogId;
    });
    if (registered) {
        return registered;
    }
    return findDialogDefinitionForMenu(dialogId);
};
productDialogComposition = (0, productDialogComposition_1.createProductDialogComposition)({
    ipcMain: electron_1.ipcMain,
    rootDir: composition.rootDir,
    productId: product,
    productRootPath: composition.location.rootPath,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    runtimeSessionManager,
    findDefinition: findProductDialogDefinition,
    getParentWindow: function () {
        return mainWindow;
    },
    publishCommand: function (command) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(applicationEvents_1.applicationEventChannels.dialogCommandPreview, command);
        }
    },
    getLocale: function () {
        return locale;
    }
});
const productDialogWindowController = productDialogComposition.windowController;
externalWindowComposition = (0, externalWindowComposition_1.createExternalWindowComposition)({
    ipcMain: electron_1.ipcMain,
    shell: electron_1.shell,
    dialog: electron_1.dialog,
    clipboard: electron_1.clipboard,
    downloadsPath: electron_1.app.getPath("downloads"),
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    showOnOpen: !electronSmokeMode,
    getZoomFactor: function () {
        return mainWindowZoomController.getZoomFactor();
    },
    plotDownloadController,
    runtimeSessionManager,
    startHelpServer: function () {
        return rHelpServer.start();
    },
    executeVisibleCommand: executeVisibleCommandAndBroadcast,
    fetchHelpPage: function (value) {
        return rHelpPageProxy.fetchPage(value);
    }
});
const createDevDiagnosticsWindow = externalWindowComposition.createDevDiagnosticsWindow;
scriptEditorComposition = (0, scriptEditorComposition_1.createScriptEditorComposition)({
    ipcMain: electron_1.ipcMain,
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    title: translateCompositionText("Script editor"),
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    pagePath: path.join(composition.rootDir, "shared/base-app/pages/scriptEditor.html"),
    showOnOpen: !electronSmokeMode,
    getZoomFactor: function () {
        return mainWindowZoomController.getZoomFactor();
    },
    readTerminalSettings: function () {
        const settings = (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths());
        return settings.terminalSettings || {};
    },
    getLocale: function () {
        return locale;
    },
    runtimeSessionManager,
    ensureRuntimeReady: ensureRuntimeReadyForScriptEditor,
    executeVisibleCommand: executeVisibleCommandAndBroadcast
});
const scriptEditorWindowController = scriptEditorComposition.windowController;
const openScriptEditorWindow = scriptEditorComposition.openWindow;
const insertCodeInScriptEditor = scriptEditorComposition.insertCode;
const openScriptFilePathInScriptEditor = scriptEditorComposition.openFilePath;
datasetEditorComposition = (0, datasetEditorComposition_1.createDatasetEditorComposition)({
    ipcMain: electron_1.ipcMain,
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    translate: translateCompositionText,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    pagePath: path.join(composition.rootDir, "shared/base-app/pages/datasetEditor.html"),
    showOnOpen: !electronSmokeMode,
    getZoomFactor: function () {
        return mainWindowZoomController.getZoomFactor();
    },
    getLocale: function () {
        return locale;
    },
    readVariableColumnWidths: readDatasetEditorVariableColumnWidths,
    readTerminalSettings: function () {
        return (0, settingsStorage_1.readEffectiveSettings)(settingsStoragePaths())
            .terminalSettings || {};
    },
    listDatasetNames: listDatasetEditorDatasetNames,
    runtimeSessionManager,
    writeVariableColumnWidths: writeDatasetEditorVariableColumnWidths,
    uiCommandVisibility: datasetEditorUiCommandVisibility,
    executeVisibleCommand: executeVisibleCommandAndBroadcast,
    refreshWorkspaceAndBroadcast,
    broadcastRuntimeEvents,
    sendActiveDataset,
    warmInitialDatasetPreview,
    warmInitialVariableMetadata,
    reportError: function (error) {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});
const datasetEditorWindowController = datasetEditorComposition.windowController;
const openDatasetEditorWindow = datasetEditorComposition.open;
(0, applicationShellIpcComposition_1.registerApplicationShellIpc)({
    ipcMain: electron_1.ipcMain,
    getComposition: function () {
        return composition;
    },
    openDevDiagnostics: createDevDiagnosticsWindow,
    showDevDiagnostics: !electronSmokeMode
});
(0, runtimeRestartComposition_1.registerRuntimeRestartComposition)({
    ipcMain: electron_1.ipcMain,
    runtimeSessionManager,
    temporaryDirectory: electron_1.app.getPath("temp"),
    packageInstallDialogController,
    getMainWindow: function () {
        return mainWindow;
    },
    productId: product,
    invalidateDatasetPreview: invalidateInitialDatasetPreview,
    setRuntimeSession: function (snapshot) {
        composition.runtimeSession = snapshot;
    },
    sendRuntimeSession,
    refreshWorkspace: refreshWorkspaceAndBroadcast,
    captureWorkspaceBaseline
});
(0, electronApplicationLifecycle_1.bindElectronApplicationLifecycle)({
    app: electron_1.app,
    smokeMode: electronSmokeMode,
    initializeZoom: mainWindowZoomController.initialize,
    installApplicationMenu,
    createMainWindow,
    setMainWindow: function (win) {
        mainWindow = win;
    },
    autoStartRuntime,
    runSmoke: function (win) {
        return (0, electronSmokeRunner_1.runElectronSmoke)({
            win,
            product,
            runtime,
            target: electronSmokeTarget
        });
    },
    stopRuntime: async function () {
        await runtimeSessionManager.stop();
    },
    preloadDatasetEditor: function () {
        return datasetEditorComposition.windowController.ensureLoaded();
    },
    appendBootLog: appendRuntimeBootLog,
    requestApplicationQuit: runtimeLifecycleComposition.requestApplicationQuit,
    runtimeQuitController: runtimeLifecycleComposition.runtimeQuitController,
    stopHelpServer: rHelpServer.stop,
    reportError: function (error) {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});
