import {
  CONSOLE_THEME_NAME,
  ensureConsoleSyntaxReady
} from '../../console/consoleSyntax';
import {
  createScriptEditorTypographyController
} from './scriptEditorTypographyController';
import {
  createScriptFilePersistence
} from '../files/scriptFilePersistence';
import {
  bindScriptEditorIpc
} from './scriptEditorIpcBindings';
import {
  createScriptToolbarLabels,
} from './scriptToolbarView';
import {
  createScriptEditorTabController,
  type ScriptEditorTabController
} from './scriptEditorTabController';
import {
  createScriptEditorFileController,
  type ScriptEditorFileController
} from './scriptEditorFileController';
import {
  createScriptDiagnosticsController
} from './scriptDiagnosticsController';
import {
  createScriptExecutionController
} from './scriptExecutionController';
import {
  createScriptEditorBootstrapController
} from './scriptEditorBootstrapController';
import {
  createScriptEditorBootstrapFlowController
} from './scriptEditorBootstrapFlowController';
import {
  createScriptMonacoRuntime
} from './scriptMonacoRuntime';
import {
  createScriptOutlineController
} from './scriptOutlineController';
import {
  createScriptEditorInsertionController
} from './scriptEditorInsertionController';
import {
  createScriptEditorCloseController
} from './scriptEditorCloseController';
import {
  createScriptEditorRendererTransport
} from './scriptEditorRendererTransport';
import {
  createScriptEditorLocalizationController
} from './scriptEditorLocalizationController';
import {
  createScriptEditorViewStateController
} from './scriptEditorViewStateController';
import {
  createScriptEditorInputController
} from './scriptEditorInputController';
import {
  createScriptEditorIpcController
} from './scriptEditorIpcController';
import {
  createScriptEditorLifecycleController
} from './scriptEditorLifecycleController';
import {
  createScriptDocumentLifecycleController
} from './scriptDocumentLifecycleController';
import {
  createScriptEditorOpenFileController
} from './scriptEditorOpenFileController';
import {
  createScriptDroppedFilePathReader
} from './scriptDroppedFilePathReader';
import {
  createRDroppedScriptFilePlan
} from '../../runtime/providers/r/commands/rDroppedScriptFilePlan';
import {
  parseRFunctionOutline
} from '../../runtime/providers/r/script/rFunctionOutline';
import {
  buildRContextualHelpRequest
} from '../../runtime/providers/r/help/rContextualHelp';
import {
  createScriptEditorSurfaceStateController
} from './scriptEditorSurfaceStateController';
import {
  createScriptEditorReactionController
} from './scriptEditorReactionController';
import {
  createScriptEditorActionController
} from './scriptEditorActionController';
import type {
  ScriptEditorIpcBridge
} from './scriptEditorIpcBindings';
import type {
  ScriptEditorTransportBridge
} from './scriptEditorRendererTransport';
import {
  createLiveScriptRendererController
} from './liveScriptRendererController';
import {
  createLiveScriptPanelController,
  type LiveScriptPanelController,
  type LiveScriptPanelLabels
} from './liveScriptPanelController';
import type {
  LiveScriptRendererBridge
} from '../collaboration/index.js';
import {
  createLiveScriptJoinLink,
  parseLiveScriptJoinText,
  sanitizeLiveScriptDisplayName,
  type LiveScriptSessionTicket
} from '../collaboration/index.js';
// Static imports only: the Electron renderer runs this module as CommonJS and
// cannot service a dynamic import() (see scriptEditorHostModules).
import {
  createHttpLiveScriptRendezvous
} from '../collaboration/liveScriptRendezvous';
import {
  createHttpLiveScriptParticipantRendezvous
} from '../collaboration/liveScriptParticipantRendezvous';
import type {
  LiveScriptRendezvousProvider,
  LiveScriptRendezvousPublication
} from '../collaboration/liveScriptRendezvous';
import {
  scriptEditorEventChannels,
  scriptEditorIpcChannels
} from '../scriptEditorIpc';
import {
    i18n
} from '../../core/i18n';

const defaultRendererAppPath = function(): string {
  return '/';
};

type ScriptEditorBridge =
  ScriptEditorTransportBridge & ScriptEditorIpcBridge & {
    live: LiveScriptRendererBridge;
  };

const createNoopScriptEditorBridge = function(): ScriptEditorBridge {
  return {
    onInit: () => {},
    onLanguageChanged: () => {},
    onTerminalSettingsUpdated: () => {},
    onRequestSaveForClose: () => {},
    onRequestLiveSessionShutdown: () => {},
    onInsertCode: () => {},
    onOpenFile: () => {},
    onRuntimeExecuted: () => {},
    onCommandBoundary: () => {},
    onSessionState: () => {},
    publishDirtyState: () => {},
    publishLiveSessionShutdownResult: () => {},
    chooseScriptFile: async () => {
      return null;
    },
    publishReady: () => {},
    live: {
      capability: async () => ({
        available: false,
        endpointId: '',
        message: 'Live-script sharing is unavailable in this host.'
      }),
      host: async () => ({
        ok: false,
        message: 'Live-script sharing is unavailable in this host.'
      }),
      join: async () => ({
        ok: false,
        message: 'Live-script sharing is unavailable in this host.'
      }),
      send: async () => ({
        ok: false,
        message: 'Live-script sharing is unavailable in this host.'
      }),
      close: async () => ({
        ok: true,
        message: ''
      }),
      onFrame: () => {},
      onState: () => {}
    }
  };
};

const scriptEditorBridge =
  window.dialogForge?.scriptEditor || createNoopScriptEditorBridge();

const scriptEditorHostTransport = {
  invoke: async (channel: string, payload?: unknown) => {
    if (channel === scriptEditorIpcChannels.listDirectory) {
      return window.dialogForge?.listScriptDirectory(
        payload as { dirPath?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.openFilePath) {
      return window.dialogForge?.openScriptFilePath(String(payload || ""));
    }

    if (channel === scriptEditorIpcChannels.openFile) {
      return window.dialogForge?.openScriptFile();
    }

    if (channel === scriptEditorIpcChannels.confirmSave) {
      return window.dialogForge?.confirmScriptEditorSave(
        payload as { filePath?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.saveFile) {
      return window.dialogForge?.saveScriptFile(
        payload as { filePath?: string; content?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.saveFileAs) {
      return window.dialogForge?.saveScriptFileAs(
        payload as { filePath?: string; content?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.checkFragment) {
      return window.dialogForge?.checkScriptFragment(
        payload as { code?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.runCodeBatch) {
      return window.dialogForge?.runScriptCodeBatch(
        payload as { chunks?: string[] }
      );
    }

    return null;
  },
  send: (channel: string, payload?: unknown) => {
    if (channel === scriptEditorEventChannels.closeSaveResult) {
      window.dialogForge?.sendScriptEditorCloseSaveResult(
        payload as { requestId?: string; ok?: boolean }
      );
    }
  }
};

const scriptEditorTransport =
  createScriptEditorRendererTransport(scriptEditorBridge);

const localization = createScriptEditorLocalizationController({
  i18n,
  getDefaultAppPath: defaultRendererAppPath,
  relabel: () => {
    scriptEditorReactions.relabel();
  }
});
const t = (key: string) => localization.translate(key);

const scriptFilePersistence = createScriptFilePersistence(scriptEditorHostTransport);
const monacoRuntime = createScriptMonacoRuntime(
  ensureConsoleSyntaxReady
);
const surfaceState = createScriptEditorSurfaceStateController({
  setTabsHost: (host) => {
    tabController.setHost(host);
  }
});
let liveAvailable = false;
let liveCanHost = false;
let liveCanJoin = false;
let pendingLiveScriptJoinText = '';
let liveBrowserJoinUrl = '';
let livePanelController: LiveScriptPanelController | null = null;
let livePanelDocumentId = '';
let liveRendezvous: LiveScriptRendezvousProvider | null = null;
const hostedLinks = new Map<string, string>();
const hostedTickets = new Map<string, LiveScriptSessionTicket>();
const hostedPublications = new Map<string, LiveScriptRendezvousPublication>();

const updateLiveToolbarState = function(): void {
  const active = tabController.getActiveTab();

  surfaceState.toolbarView?.updateLiveState({
    available: liveAvailable,
    canHost: liveCanHost,
    canJoin: liveCanJoin,
    isParticipant: active?.kind === 'live-participant',
    participantSessionActive: active?.kind === 'live-participant'
      && active.liveStatus !== 'ended'
      && active.liveStatus !== 'failed',
    isHosting: Boolean(
      active && liveScriptController.getHostedSessionId(active.id)
    )
  });
};
const tabController: ScriptEditorTabController = createScriptEditorTabController({
  getEditor: () => surfaceState.editor,
  getLabels: () => ({
    untitled: t('Untitled'),
    closeTab: t('Close Tab'),
    liveReadOnly: t('Live · read-only'),
    sessionEndedReadOnly: t('Session ended · editable'),
    connectionLostReadOnly: t('Connection lost · editable')
  }),
  activeTabChanged: () => {
    scriptEditorReactions.activeTabChanged();
    updateLiveToolbarState();
  },
  tabStateChanged: () => {
    scriptEditorReactions.tabStateChanged();
  }
});
const getActiveTab = () => tabController.getActiveTab();
const hasDirtyTabs = () => tabController.hasDirtyTabs();
const outlineController = createScriptOutlineController({
  getEditor: () => surfaceState.editor,
  getActiveDocument: getActiveTab,
  getButtonAnchor: () => surfaceState.outlineButton,
  getLineLabel: () => t('Line'),
  languageId: 'r',
  parseFunctionOutline: parseRFunctionOutline,
  documentStateChanged: (hasDocument, symbolCount) => {
    surfaceState.toolbarView?.updateDocumentState(
      hasDocument,
      symbolCount,
      getActiveTab()?.kind !== 'live-participant'
    );
  }
});
const scriptEditorViewState = createScriptEditorViewStateController({
  document,
  tabs: tabController,
  outline: outlineController,
  getToolbarView: () => surfaceState.toolbarView,
  getBreadcrumbView: () => surfaceState.breadcrumbView,
  getLiveNotice: () => surfaceState.liveNotice,
  getToolbarLabels: () => getToolbarLabels(),
  translate: (key) => t(key),
  publishDirtyState: (state) => {
    scriptEditorTransport.publishDirtyState(state);
  }
});
const scriptDiagnostics = createScriptDiagnosticsController({
  transport: scriptEditorHostTransport,
  getMonaco: () => monacoRuntime.current,
  getActiveTab,
  getActiveTabId: () => tabController.getActiveTabId()
});
const scriptExecution = createScriptExecutionController({
  transport: scriptEditorHostTransport,
  getMonaco: () => monacoRuntime.current,
  getEditor: () => surfaceState.editor,
  getActiveTab,
  buildContextualHelpRequest: buildRContextualHelpRequest
});

const getToolbarLabels = () => createScriptToolbarLabels(t);
const getLivePanelLabels = (): LiveScriptPanelLabels => ({
  shareLive: t('Share live'),
  joinLive: t('Join live script'),
  close: t('Close'),
  copyLink: t('Copy link'),
  stopSharing: t('Stop sharing'),
  detach: t('Detach'),
  followInstructorCursor: t('Follow presenter cursor'),
  sessionLink: t('Session link'),
  shortCode: t('Short code'),
  shortCodeUnavailable: t('Unavailable for this session'),
  shortCodeCreating: t('Creating classroom code…'),
  regenerateCode: t('Regenerate code'),
  participants: t('Participants'),
  connection: t('Connection'),
  enterLink: t('Paste a live-script link or ticket')
});
const reportDirtyState = scriptEditorViewState.reportDirtyState;
const updateTitle = scriptEditorViewState.updateTitle;
const updateToolbarState = scriptEditorViewState.updateToolbarState;
const updateOutlineState = scriptEditorViewState.updateOutlineState;
const updatePathBar = scriptEditorViewState.updatePathBar;
const scheduleOutlineUpdate = scriptEditorViewState.scheduleOutlineUpdate;
const renderTabs = scriptEditorViewState.renderTabs;

const setActiveTab = (tabId: string) => {
  tabController.activateTab(tabId);
};

const clearScriptDiagnostics = scriptDiagnostics.clear;
const scheduleActiveTabValidation = scriptDiagnostics.schedule;
const scriptEditorReactions =
  createScriptEditorReactionController({
    updateToolbarLabels: scriptEditorViewState.updateToolbarLabels,
    renderTabs,
    updatePathBar,
    updateTitle,
    updateToolbarState,
    scheduleValidation: scheduleActiveTabValidation,
    updateOutlineState
  });
const scriptDocumentLifecycle =
  createScriptDocumentLifecycleController({
    getMonaco: () => monacoRuntime.current,
    tabs: tabController,
    clearDiagnostics: clearScriptDiagnostics,
    reportDirtyState,
    updateTitle,
    updateToolbarState,
    renderTabs,
    scheduleValidation: scheduleActiveTabValidation,
    scheduleOutlineUpdate,
    updateOutlineState
  });
const createTab = scriptDocumentLifecycle.create;

const revokeHostedCode = async function(documentId: string): Promise<void> {
  const publication = hostedPublications.get(documentId);
  hostedPublications.delete(documentId);

  if (publication && liveRendezvous) {
    await liveRendezvous.revoke(publication).catch(() => {});
  }
};

const publishHostedCode = async function(documentId: string): Promise<void> {
  const ticket = hostedTickets.get(documentId);

  if (!ticket || !liveRendezvous) {
    return;
  }

  await revokeHostedCode(documentId);
  const publication = await liveRendezvous.publish(ticket);
  hostedPublications.set(documentId, publication);

  if (livePanelDocumentId === documentId) {
    livePanelController?.updateShortCode(publication.code);
  }
};

const liveScriptController = createLiveScriptRendererController({
  transport: scriptEditorBridge.live,
  getMonaco: () => monacoRuntime.current,
  getEditor: () => surfaceState.editor,
  createTab,
  refreshTabs: () => {
    tabController.refresh();
    scriptEditorReactions.tabStateChanged();
    updateLiveToolbarState();
  },
  hostStateChanged: (sessionId, state) => {
    if (state.status === 'ended') {
      for (const [documentId, ticket] of hostedTickets) {
        if (ticket.sessionId === sessionId) {
          hostedLinks.delete(documentId);
          hostedTickets.delete(documentId);
          hostedPublications.delete(documentId);
          break;
        }
      }
    }

    livePanelController?.updateHost(state);
    updateLiveToolbarState();
  },
  participantStateChanged: (_sessionId, state) => {
    livePanelController?.updateParticipant(state);
  },
  participantCursorChanged: () => {},
  transportStateChanged: (event) => {
    livePanelController?.updateTransport(event);
  }
});

const shutdownLiveSessions = async function(): Promise<void> {
  const hostedDocumentIds = Array.from(hostedTickets.keys());

  await Promise.all(hostedDocumentIds.map((documentId) => {
    return revokeHostedCode(documentId);
  }));
  await liveScriptController.shutdown('instructor-closed');
  hostedLinks.clear();
  hostedTickets.clear();
  hostedPublications.clear();
  livePanelDocumentId = '';
  livePanelController?.close();
  updateLiveToolbarState();
};

const scriptFileController: ScriptEditorFileController =
  createScriptEditorFileController({
    transport: scriptEditorHostTransport,
    persistence: scriptFilePersistence,
    tabs: tabController,
    createTab,
    scheduleValidation: scheduleActiveTabValidation,
    updateOutline: updateOutlineState,
    documentStateChanged: scriptEditorReactions.tabStateChanged
  });
tabController.setCloseHandler((tabId) => {
  void (async () => {
    if (liveScriptController.getHostedSessionId(tabId)) {
      await revokeHostedCode(tabId);
      await liveScriptController.stopHosting(tabId, 'instructor-closed');
      hostedLinks.delete(tabId);
      hostedTickets.delete(tabId);
    }

    if (liveScriptController.getParticipantSessionId(tabId)) {
      await liveScriptController.detachParticipant(tabId);
    }

    await scriptFileController.closeTab(tabId);
  })();
});
const saveTab = scriptFileController.saveTab;
const saveCurrent = () => scriptFileController.saveCurrent(false);
const saveCurrentAs = () => scriptFileController.saveCurrent(true);
const openFileIntoTab = (
  filePath: string,
  content: string,
  preferCurrent = true
) => {
  return scriptFileController.openFile(
    filePath,
    content,
    preferCurrent
  );
};
const restoreSessionTabs = () => {
  return scriptFileController.restoreSession();
};

const runCodeAtCursor = scriptExecution.runAtCursor;
const showHelpAtCursor = scriptExecution.showHelpAtCursor;

const insertionController = createScriptEditorInsertionController({
  getMonaco: () => monacoRuntime.current,
  getEditor: () => surfaceState.editor,
  getActiveDocument: getActiveTab,
  createDocument: () => {
    return createTab({
      filePath: '',
      content: '',
      activate: true
    });
  },
  activateDocument: setActiveTab,
  openFile: openFileIntoTab
});
const insertCodeAtCursor = insertionController.insertCode;
const typographyController =
  createScriptEditorTypographyController();
const scriptEditorBootstrap = createScriptEditorBootstrapController({
  document,
  defaultAppPath: defaultRendererAppPath,
  initializeLocalization: (locale, appPath, directTranslations) => {
    localization.initialize(locale, appPath, directTranslations);
  },
  setSessionScope: (scope) => {
    tabController.setSessionScope(scope);
  },
  ensureMonaco: () => monacoRuntime.ensure(),
  registerDocumentSymbolProvider: (monaco) => {
    outlineController.registerDocumentSymbolProvider(monaco);
  }
});
const closeCrumbPopup = surfaceState.closeBreadcrumbPopup;

const openFileController = createScriptEditorOpenFileController({
  chooseFile: scriptEditorTransport.chooseScriptFile,
  openFile: openFileIntoTab
});
const openScript = openFileController.openSelectedFile;
const droppedFilePathReader = createScriptDroppedFilePathReader({
  readDroppedFilePath: (file) => window.dialogForge.readDroppedFilePath(file)
});
const scriptEditorActions = createScriptEditorActionController({
  createDocument: () => {
    createTab({
      filePath: '',
      content: '',
      activate: true
    });
  },
  openSelectedFile: openScript,
  runCurrent: runCodeAtCursor,
  toggleOutline: outlineController.toggle,
  showHelp: showHelpAtCursor,
  saveCurrent,
  saveCurrentAs
});

const randomOpaqueId = function(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  let binary = '';

  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const showShareLive = async function(): Promise<void> {
  const active = getActiveTab();

  if (!active || !livePanelController) {
    return;
  }

  livePanelDocumentId = active.id;

  if (active.kind === 'live-participant') {
    livePanelController.showParticipant(
      active.displayName,
      active.liveStatus || 'joining'
    );
    return;
  }

  const existingLink = hostedLinks.get(active.id);

  if (existingLink) {
    const publication = hostedPublications.get(active.id);
    await livePanelController.showHost(
      existingLink,
      sanitizeLiveScriptDisplayName(active.filePath || active.displayName),
      publication?.code || (liveRendezvous
        ? getLivePanelLabels().shortCodeCreating
        : getLivePanelLabels().shortCodeUnavailable),
      Boolean(liveRendezvous)
    );
    const state = liveScriptController.getHostedState(active.id);

    if (state) {
      livePanelController.updateHost(state);
    }
    return;
  }

  const result = await liveScriptController.hostDocument(
    active,
    randomOpaqueId(18),
    randomOpaqueId(32),
    sanitizeLiveScriptDisplayName(active.filePath || active.displayName)
  );
  const link = createLiveScriptJoinLink(result.ticket, liveBrowserJoinUrl);
  hostedLinks.set(active.id, link);
  hostedTickets.set(active.id, result.ticket);
  updateLiveToolbarState();
  await livePanelController.showHost(
    link,
    result.state.displayName,
    liveRendezvous
      ? getLivePanelLabels().shortCodeCreating
      : getLivePanelLabels().shortCodeUnavailable,
    Boolean(liveRendezvous)
  );
  livePanelController.updateHost(result.state);

  if (liveRendezvous) {
    void publishHostedCode(active.id).catch(() => {
      if (livePanelDocumentId === active.id) {
        livePanelController?.updateShortCode(
          getLivePanelLabels().shortCodeUnavailable
        );
      }
    });
  }
};

const showJoinLive = function(): void {
  livePanelController?.showJoin();
};

const initializeLiveScriptUi = async function(): Promise<void> {
  const root = document.getElementById('root');

  if (!root || livePanelController) {
    return;
  }

  livePanelController = createLiveScriptPanelController({
    root,
    getLabels: getLivePanelLabels,
    join: async (value) => {
      const parsed = parseLiveScriptJoinText(value);
      const ticket = parsed.ok
        ? parsed.ticket
        : await liveRendezvous?.resolve(value);

      if (!ticket) {
        throw new Error(parsed.ok ? 'Live session is not available.' : parsed.message);
      }

      const joinedDocument = await liveScriptController.join(ticket);
      livePanelDocumentId = joinedDocument.id;
      livePanelController?.showParticipant(
        joinedDocument.displayName,
        joinedDocument.liveStatus || 'joining'
      );
      updateLiveToolbarState();
    },
    stopSharing: async () => {
      if (!livePanelDocumentId) {
        return;
      }

      await revokeHostedCode(livePanelDocumentId);
      await liveScriptController.stopHosting(livePanelDocumentId);
      hostedLinks.delete(livePanelDocumentId);
      hostedTickets.delete(livePanelDocumentId);
      livePanelController?.close();
      updateLiveToolbarState();
    },
    detach: async () => {
      await liveScriptController.detachParticipant(livePanelDocumentId);
      updateLiveToolbarState();
    },
    regenerateShortCode: async () => {
      if (!livePanelDocumentId || !liveRendezvous) {
        return;
      }

      await publishHostedCode(livePanelDocumentId);
    },
    followInstructorCursor: (follow) => {
      liveScriptController.setFollowInstructorCursor(
        livePanelDocumentId,
        follow
      );
    }
  });

  const capability = await scriptEditorBridge.live.capability();
  liveAvailable = capability.available;
  liveCanHost = capability.available && capability.canHost !== false;
  liveCanJoin = capability.available && capability.canJoin !== false;
  liveBrowserJoinUrl = String(capability.browserJoinUrl || '');

  if (capability.rendezvousUrl) {
    try {
      if (liveCanHost) {
        liveRendezvous = createHttpLiveScriptRendezvous({
          baseUrl: capability.rendezvousUrl
        });
      } else {
        liveRendezvous = createHttpLiveScriptParticipantRendezvous({
          baseUrl: capability.rendezvousUrl
        });
      }
    }
    catch {
      liveRendezvous = null;
    }
  }
  updateLiveToolbarState();

  if (pendingLiveScriptJoinText && liveCanJoin) {
    livePanelController.showJoin(pendingLiveScriptJoinText);
    pendingLiveScriptJoinText = '';
  }
};

const scriptEditorInputController = createScriptEditorInputController({
  runCodeAtCursor,
  saveCurrent: scriptEditorActions.save,
  saveCurrentAs: scriptEditorActions.saveAs,
  openScript: scriptEditorActions.openFile,
  createTab: scriptEditorActions.createFile,
  showHelpAtCursor: scriptEditorActions.showHelp,
  readClipboardText: () => insertionController.readClipboardText(),
  insertCodeAtCursor,
  getActiveTab,
  getEditor: () => surfaceState.editor,
  persistSession: () => {
    tabController.scheduleSessionPersistence();
  },
  closeCrumbPopup,
  closeOutline: () => {
    outlineController.close();
  }
});
const scriptEditorLifecycle = createScriptEditorLifecycleController({
  updateTitle,
  updateToolbarState,
  updatePathBar,
  persistSession: () => {
    tabController.persistSession();
  },
  flushPendingInsertions: () => {
    insertionController.flushPending();
  },
  publishReady: () => {
    scriptEditorTransport.publishReady();
  }
});

const scriptEditorBootstrapFlow = createScriptEditorBootstrapFlowController({
  prepare: (initPayload) => {
    pendingLiveScriptJoinText = String(initPayload.liveScriptJoinText || '');
    return scriptEditorBootstrap.prepare(initPayload);
  },
  transport: scriptEditorHostTransport,
  theme: CONSOLE_THEME_NAME,
  getToolbarLabels,
  createFile: scriptEditorActions.createFile,
  openScript: scriptEditorActions.openFile,
  runScript: scriptEditorActions.run,
  toggleOutline: scriptEditorActions.toggleOutline,
  showHelp: scriptEditorActions.showHelp,
  save: scriptEditorActions.save,
  saveAs: scriptEditorActions.saveAs,
  shareLive: () => {
    void showShareLive().catch((error) => {
      livePanelController?.showError(
        error instanceof Error ? error.message : String(error)
      );
    });
  },
  joinLive: showJoinLive,
  getFilePath: droppedFilePathReader.read,
  createDroppedFilePlan: createRDroppedScriptFilePlan,
  openFile: openFileIntoTab,
  insertCode: insertCodeAtCursor,
  setShell: surfaceState.applyShell,
  initializeTypography: typographyController.initialize,
  setEditor: surfaceState.setEditor,
  restoreSessionTabs,
  createUntitledTab: () => {
    createTab({ filePath: '', content: '', activate: true });
  },
  bindInput: (monaco, nextEditor) => {
    scriptEditorInputController.bind(monaco, nextEditor);
  },
  completeBootstrap: () => {
    scriptEditorLifecycle.completeBootstrap();
    void initializeLiveScriptUi();
  }
});
const bootstrap = scriptEditorBootstrapFlow.bootstrap;

const closeCoordinator = createScriptEditorCloseController({
  transport: scriptEditorHostTransport,
  persistence: scriptFilePersistence,
  getTabs: () => tabController.getTabs(),
  activate: setActiveTab,
  save: (tab) => saveTab(tab, false),
  refreshDocumentState: scriptEditorReactions.closeStateChanged
});

const scriptEditorIpcController = createScriptEditorIpcController({
  initialize: bootstrap,
  changeLanguage: (args) => {
    localization.changeLanguage(args.languageNS, args.appPath, args.i18n);
  },
  updateTerminalSettings: (settings) => {
    typographyController.update(surfaceState.editor, settings);
  },
  requestSaveForClose: (requestId) => {
    return closeCoordinator.resolveForWindowClose(requestId);
  },
  requestLiveSessionShutdown: async (requestId) => {
    try {
      await shutdownLiveSessions();
      scriptEditorBridge.publishLiveSessionShutdownResult({
        requestId,
        ok: true
      });
    } catch {
      scriptEditorBridge.publishLiveSessionShutdownResult({
        requestId,
        ok: false
      });
    }
  },
  insertCode: insertCodeAtCursor,
  openFile: ({ filePath, content }) => {
    insertionController.openFile({
      filePath,
      content
    });
  },
  runtimeChanged: scheduleActiveTabValidation
});

bindScriptEditorIpc(scriptEditorBridge, scriptEditorIpcController);
