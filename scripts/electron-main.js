"use strict";

const fs = require("fs");
const path = require("path");
const electron = require("electron");
const composeApplicationModule = require("../shared/base-app/bootstrap/composeApplication");
const productResolver = require("../shared/base-app/bootstrap/productResolver");
const applicationEvents = require("../shared/base-app/bootstrap/applicationEvents");
const consoleHistorySettingsStoreModule = require("../shared/console/services/consoleHistorySettingsStore");
const consoleHistoryIpcController = require("../shared/console/services/consoleHistoryIpcController");
const importFileControllerModule = require("../shared/runtime/tabular-data/importFileController");
const importFileIpcController = require("../shared/runtime/tabular-data/importFileIpcController");
const externalCallIpcController = require("../shared/dialog-runtime/custom-js/externalCallIpcController");
const productDialogRuntimeComposition = require("../shared/dialog-runtime/dialog-builder/productDialogRuntimeComposition");
const productDialogCompositionModule = require("../shared/dialog-runtime/dialog-builder/productDialogComposition");
const datasetEditorWarmCacheModule = require("../shared/dataset-editor/main-process/datasetEditorWarmCache");
const datasetEditorCompositionModule = require("../shared/dataset-editor/main-process/datasetEditorComposition");
const datasetEditorSettingsModule = require("../shared/dataset-editor/main-process/datasetEditorSettings");
const datasetViewerReadIpcController = require("../shared/dataset-editor/main-process/datasetViewerReadIpcController");
const scriptEditorCompositionModule = require("../shared/script-editor/main-process/scriptEditorComposition");
const shellFileDialogControllerModule = require("../shared/shell-electron/filesystem/shellFileDialogController");
const shellFileDialogIpcController = require("../shared/shell-electron/filesystem/shellFileDialogIpcController");
const plotDownloadControllerModule = require("../shared/shell-electron/external/plotDownloadController");
const externalWindowCompositionModule = require("../shared/shell-electron/external/externalWindowComposition");
const mainWindowCompositionModule = require("../shared/shell-electron/windows/mainWindowComposition");
const workspacePaneWindowComposition = require("../shared/shell-electron/windows/workspacePaneWindowComposition");
const applicationShellIpcComposition = require("../shared/shell-electron/windows/applicationShellIpcComposition");
const runtimeLifecycleCompositionModule = require("../shared/shell-electron/lifecycle/runtimeLifecycleComposition");
const electronApplicationLifecycle = require("../shared/shell-electron/lifecycle/electronApplicationLifecycle");
const workspaceQuitDialogControllerModule = require("../shared/shell-electron/lifecycle/workspaceQuitDialogController");
const runtimeRecoveryDialogControllerModule = require("../shared/shell-electron/lifecycle/runtimeRecoveryDialogController");
const runtimeRestartComposition = require("../shared/shell-electron/lifecycle/runtimeRestartComposition");
const runtimeIpcCompositionModule = require("../shared/shell-electron/runtime/runtimeIpcComposition");
const runtimeSessionCompositionModule = require("../shared/shell-electron/runtime/runtimeSessionComposition");
const electronSmokeRunner = require("../shared/shell-electron/smoke/electronSmokeRunner");
const rHelpServerModule = require("../shared/runtime/providers/r/help/rHelpServer");
const rHelpPageProxyModule = require("../shared/runtime/providers/r/help/rHelpPageProxy");
const nodeResourceClientModule = require("../shared/core/host/nodeResourceClient");
const packageInstallDialogControllerModule = require("../shared/runtime/providers/r/dependencies/packageInstallDialogController");
const settingsStorage = require("../shared/shell-electron/settings/settingsStorage");
const applicationSupportWindowCompositionModule = require("../shared/shell-electron/windows/applicationSupportWindowComposition");
const args = process.argv.slice(2);


/**
 * Read the last occurrence of a named command-line option from Electron's
 * argv. Environment variables handle packaged product selection separately.
 *
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
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
    electron.app.setPath("userData", testUserDataPath);
}
let location;
try {
    location = productResolver.resolveProductLocation(rootDir, requestedProduct, productPathArg);
}
catch (error) {
    console.error("Startup Error:", error.message);
    electron.dialog.showErrorBox("Startup Error", error.message);
    electron.app.quit();
    process.exit(1);
}
const product = location.id;
const initialSettings = settingsStorage.readEffectiveSettings({
    systemSettingsPath: location.settingsPath,
    userSettingsPath: path.join(electron.app.getPath("userData"), "settings.json")
});
let locale = requestedLocale
    || String(initialSettings.defaultLanguage
        || initialSettings.languageNS
        || "en_US");
const composition = composeApplicationModule.composeApplication({
    rootDir,
    location,
    runtime,
    persistedRuntimeProvider: initialSettings.runtimeStartup
        ? initialSettings.runtimeStartup.providerId
        : "",
    hostKind: "electron",
    locale
});


/**
 * Recompose locale-owned application state without replacing the long-lived
 * runtime/session objects.
 *
 * @param {string} nextLocale
 */
const applyLocale = function (nextLocale) {
    const localizedComposition = composeApplicationModule.composeApplication({
        rootDir,
        location,
        runtime,
        persistedRuntimeProvider: initialSettings.runtimeStartup
            ? initialSettings.runtimeStartup.providerId
            : "",
        hostKind: "electron",
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
const rHelpServer = rHelpServerModule.createRHelpServer();
const resourceClient = nodeResourceClientModule.createNodeResourceClient();
const rHelpPageProxy = rHelpPageProxyModule.createRHelpPageProxy({
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
const plotDownloadController = plotDownloadControllerModule.createPlotDownloadController({
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


/**
 * @returns {Promise<string[]>}
 */
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
        userSettingsPath: path.join(electron.app.getPath("userData"), "settings.json")
    };
};
const workspacePaneWindowController = workspacePaneWindowComposition.createWorkspacePaneWindowComposition({
    ipcMain: electron.ipcMain,
    screen: electron.screen,
    minimumWidth: mainWindowMinWidth,
    readSettings: function () {
        return settingsStorage.readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        settingsStorage.writeUserSettings(settingsStoragePaths(), settings);
    }
});
const userDialogsDirectory = function () {
    return path.join(electron.app.getPath("userData"), "dialogs");
};
const datasetEditorSettings = datasetEditorSettingsModule.createDatasetEditorSettings({
    readSettings: function () {
        return settingsStorage.readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        settingsStorage.writeUserSettings(settingsStoragePaths(), settings);
    }
});
const readDatasetEditorVariableColumnWidths = datasetEditorSettings.readVariableColumnWidths;
const writeDatasetEditorVariableColumnWidths = datasetEditorSettings.writeVariableColumnWidths;
const datasetEditorUiCommandVisibility = datasetEditorSettings.uiCommandVisibility;
const uiActionCommandVisibility = datasetEditorSettings.uiCommandVisibility;
const consoleHistorySettingsStore = consoleHistorySettingsStoreModule.createConsoleHistorySettingsStore({
    defaultProductId: product,
    defaultRuntimeId: runtime,
    readSettings: function () {
        return settingsStorage.readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        settingsStorage.writeUserSettings(settingsStoragePaths(), settings);
    }
});
consoleHistoryIpcController.createConsoleHistoryIpcController({
    ipcMain: electron.ipcMain,
    historyStore: consoleHistorySettingsStore
});
const runtimeSessionBootstrap = runtimeSessionCompositionModule.createRuntimeSessionComposition({
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
const datasetEditorWarmCache = datasetEditorWarmCacheModule.createDatasetEditorWarmCache(runtimeSessionManager);
const importFileController = importFileControllerModule.createImportFileController({
    executeRuntimeMethod: function (request) {
        return runtimeSessionManager.executeRuntimeMethod(request);
    }
});
importFileIpcController.createImportFileIpcController({
    ipcMain: electron.ipcMain,
    importFileController
});
const invalidateInitialDatasetPreview = datasetEditorWarmCache.invalidate;
const readInitialDatasetPreview = datasetEditorWarmCache.readPreview;
const readInitialVariableMetadataBatch = datasetEditorWarmCache.readVariableMetadata;
const warmInitialDatasetPreview = datasetEditorWarmCache.warmPreview;
const warmInitialVariableMetadata = datasetEditorWarmCache.warmVariableMetadata;
datasetViewerReadIpcController.createDatasetViewerReadIpcController({
    ipcMain: electron.ipcMain,
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
    electron.BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(channel, payload);
    });
};
externalCallIpcController.createDialogExternalCallIpcController({
    ipcMain: electron.ipcMain,
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
        sendToAllWindows(applicationEvents.applicationEventChannels.productConsoleStateChips, chips);
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
    sendToAllWindows(applicationEvents.applicationEventChannels.menuCommand, command);
};
const runtimeIpcComposition = runtimeIpcCompositionModule.createRuntimeIpcComposition({
    ipcMain: electron.ipcMain,
    clipboard: electron.clipboard,
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
productDialogRuntimeComposition.registerProductDialogRuntimeComposition({
    ipcMain: electron.ipcMain,
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
const mainWindowComposition = mainWindowCompositionModule.createMainWindowComposition({
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
        return settingsStorage.readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        settingsStorage.writeUserSettings(settingsStoragePaths(), settings);
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
const shellFileDialogController = shellFileDialogControllerModule.createShellFileDialogController({
    dialog: electron.dialog,
    translate: translateCompositionText
});
shellFileDialogIpcController.createShellFileDialogIpcController({
    ipcMain: electron.ipcMain,
    fileDialogController: shellFileDialogController
});
const packageInstallDialogController = packageInstallDialogControllerModule.createPackageInstallDialogController({
    dialog: electron.dialog,
    translate: translateCompositionText
});
const workspaceQuitDialogController = workspaceQuitDialogControllerModule.createWorkspaceQuitDialogController({
    dialog: electron.dialog,
    translate: translateCompositionText
});
const runtimeRecoveryDialogController = runtimeRecoveryDialogControllerModule.createRuntimeRecoveryDialogController({
    dialog: electron.dialog,
    productName: composition.product.name
});
runtimeLifecycleComposition = runtimeLifecycleCompositionModule.createRuntimeLifecycleComposition({
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
        electron.app.quit();
    }
});
const applicationSupportWindows = applicationSupportWindowCompositionModule.createApplicationSupportWindowComposition({
    app: electron.app,
    ipcMain: electron.ipcMain,
    dialog: electron.dialog,
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
        return settingsStorage.readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function (settings) {
        settingsStorage.writeUserSettings(settingsStoragePaths(), settings);
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
productDialogComposition = productDialogCompositionModule.createProductDialogComposition({
    ipcMain: electron.ipcMain,
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
            mainWindow.webContents.send(applicationEvents.applicationEventChannels.dialogCommandPreview, command);
        }
    },
    getLocale: function () {
        return locale;
    }
});
const productDialogWindowController = productDialogComposition.windowController;
externalWindowComposition = externalWindowCompositionModule.createExternalWindowComposition({
    ipcMain: electron.ipcMain,
    shell: electron.shell,
    dialog: electron.dialog,
    clipboard: electron.clipboard,
    downloadsPath: electron.app.getPath("downloads"),
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
scriptEditorComposition = scriptEditorCompositionModule.createScriptEditorComposition({
    ipcMain: electron.ipcMain,
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
        const settings = settingsStorage.readEffectiveSettings(settingsStoragePaths());
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
datasetEditorComposition = datasetEditorCompositionModule.createDatasetEditorComposition({
    ipcMain: electron.ipcMain,
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
        return settingsStorage.readEffectiveSettings(settingsStoragePaths())
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
applicationShellIpcComposition.registerApplicationShellIpc({
    ipcMain: electron.ipcMain,
    getComposition: function () {
        return composition;
    },
    openDevDiagnostics: createDevDiagnosticsWindow,
    showDevDiagnostics: !electronSmokeMode
});
runtimeRestartComposition.registerRuntimeRestartComposition({
    ipcMain: electron.ipcMain,
    runtimeSessionManager,
    temporaryDirectory: electron.app.getPath("temp"),
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
electronApplicationLifecycle.bindElectronApplicationLifecycle({
    app: electron.app,
    smokeMode: electronSmokeMode,
    initializeZoom: mainWindowZoomController.initialize,
    installApplicationMenu,
    createMainWindow,
    setMainWindow: function (win) {
        mainWindow = win;
    },
    autoStartRuntime,
    runSmoke: function (win) {
        return electronSmokeRunner.runElectronSmoke({
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
