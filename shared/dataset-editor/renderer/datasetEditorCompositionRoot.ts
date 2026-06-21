import {
  datasetViewerClient
} from '../../base-app/modules/datasetViewerClient';
import {
  buildVariableMetadataCommand
} from '../../dataset-editor/commands/visibleCommandText';
import {
  isDatasetEditorFontShortcutKey
} from '../../dataset-editor/commands/globalShortcut';
import {
  summarizeDatasetValueLabels
} from '../../dataset-editor/view/valueLabelSummary';
import type { DatasetEditorInitMessage } from '../../dataset-editor/renderer/datasetEditorIpcBindings';
import type {
  DatasetEditorIpcBridge
} from '../../dataset-editor/renderer/datasetEditorIpcBindings';
import {
  createVariableGridInteractionBindings
} from '../../dataset-editor/renderer/variableGridInteractionBindings';
import {
  createDataGridInteractionBindings
} from '../../dataset-editor/renderer/dataGridInteractionBindings';
import { createDatasetEditorCover } from '../../dataset-editor/renderer/datasetEditorCover';
import {
  createDatasetEditorChromeView,
  escapeDatasetEditorHtml as escapeHtml,
  type DatasetEditorTab
} from '../../dataset-editor/renderer/datasetEditorChromeView';
import { createDatasetEditorContextMenuView } from '../../dataset-editor/renderer/datasetEditorContextMenuView';
import {
  createDatasetHeaderContextMenuController
} from '../../dataset-editor/renderer/datasetHeaderContextMenuController';
import {
  createDatasetEditFocusController
} from '../../dataset-editor/renderer/datasetEditFocusController';
import {
  createDatasetVariableMetadataLoadController,
  type DatasetVariableMetadataLoadController
} from '../../dataset-editor/renderer/datasetVariableMetadataLoadController';
import {
  createDatasetVariableMetadataLookupController
} from '../../dataset-editor/renderer/datasetVariableMetadataLookupController';
import {
  createDatasetViewportReloadController
} from '../../dataset-editor/renderer/datasetViewportReloadController';
import {
  createDatasetViewportResultController
} from '../../dataset-editor/renderer/datasetViewportResultController';
import {
  createDatasetSchemaFailureController
} from '../../dataset-editor/renderer/datasetSchemaFailureController';
import {
  createDatasetOpeningPresentationController
} from '../../dataset-editor/renderer/datasetOpeningPresentationController';
import {
  createVariableGridDomController
} from '../../dataset-editor/renderer/variableGridDomController';
import {
  createDatasetEditorDomController
} from '../../dataset-editor/renderer/datasetEditorDomController';
import {
  createDatasetEditorCommandTransportController
} from '../../dataset-editor/renderer/datasetEditorCommandTransportController';
import {
  createDatasetCellContextMenuController
} from '../../dataset-editor/renderer/datasetCellContextMenuController';
import {
  createDatasetVisibleCommandController
} from '../../dataset-editor/renderer/datasetVisibleCommandController';
import {
  createDatasetEditorWindowInteractionController
} from '../../dataset-editor/renderer/datasetEditorWindowInteractionController';
import {
  createDatasetEditorContextMenuBindingController
} from '../../dataset-editor/renderer/datasetEditorContextMenuBindingController';
import {
  createDatasetEditorControlBindingController
} from '../../dataset-editor/renderer/datasetEditorControlBindingController';
import {
  createDatasetEditorTabController
} from '../../dataset-editor/renderer/datasetEditorTabController';
import {
  createDatasetEditorRendererTransport
} from '../../dataset-editor/renderer/datasetEditorRendererTransport';
import type {
  DatasetEditorTransportBridge
} from '../../dataset-editor/renderer/datasetEditorRendererTransport';
import { bindDatasetEditorUi } from '../../dataset-editor/renderer/datasetEditorUiBindings';
import {
  createDatasetStructuralActions
} from '../../dataset-editor/renderer/datasetStructuralActions';
import {
  createDatasetColumnClipboardActions
} from '../../dataset-editor/renderer/datasetColumnClipboardActions';
import {
  createVariableMetadataActions
} from '../../dataset-editor/renderer/variableMetadataActions';
import {
  createDatasetCellClipboardActions,
  type DatasetCellClipboardTarget
} from '../../dataset-editor/renderer/datasetCellClipboardActions';
import {
  createActiveCellClipboardController
} from '../../dataset-editor/renderer/activeCellClipboardController';
import {
  createValueLabelsEditorController
} from '../../dataset-editor/renderer/valueLabelsEditorController';
import {
  createDatasetViewportController
} from '../../dataset-editor/renderer/datasetViewportController';
import {
  createDatasetOpeningController
} from '../../dataset-editor/renderer/datasetOpeningController';
import {
  createDatasetChangeController
} from '../../dataset-editor/renderer/datasetChangeController';
import {
  createDatasetVariableRowRefreshController
} from '../../dataset-editor/renderer/datasetVariableRowRefreshController';
import {
  createDatasetInitialPageController
} from '../../dataset-editor/renderer/datasetInitialPageController';
import {
  createDatasetOpenPreparationController
} from '../../dataset-editor/renderer/datasetOpenPreparationController';
import {
  createDatasetOpeningSchemaController
} from '../../dataset-editor/renderer/datasetOpeningSchemaController';
import {
  createDatasetLoadedCellController
} from '../../dataset-editor/renderer/datasetLoadedCellController';
import {
  createDatasetLocalColumnRenameController
} from '../../dataset-editor/renderer/datasetLocalColumnRenameController';
import {
  createDatasetColumnChangeApplier
} from '../../dataset-editor/renderer/datasetColumnChangeApplier';
import {
  createVariableMetadataController
} from '../../dataset-editor/renderer/variableMetadataController';
import {
  createDatasetNavigationController
} from '../../dataset-editor/renderer/datasetNavigationController';
import {
  createDatasetTableRenderer
} from '../../dataset-editor/renderer/datasetTableRenderer';
import {
  createDatasetRefreshController
} from '../../dataset-editor/renderer/datasetRefreshController';
import {
  createDatasetEditorSelectionStateController
} from '../../dataset-editor/renderer/datasetEditorSelectionStateController';
import {
  createDatasetEditorLocalizationController
} from '../../dataset-editor/renderer/datasetEditorLocalizationController';
import {
  createDatasetEditorInitializationController
} from '../../dataset-editor/renderer/datasetEditorInitializationController';
import {
  createDatasetFilterStateController
} from '../../dataset-editor/renderer/datasetFilterStateController';
import {
  createDatasetEditorExternalActionsController
} from '../../dataset-editor/renderer/datasetEditorExternalActionsController';
import {
  createVariableColumnWidthController
} from '../../dataset-editor/renderer/variableColumnWidthController';
import {
  createVariableMetadataPasteController
} from '../../dataset-editor/renderer/variableMetadataPasteController';
import {
  DATASET_EDITOR_HEADER_HEIGHT,
  DATASET_EDITOR_INDEX_COLUMN_WIDTH,
  DATASET_EDITOR_OVERSCAN_COLUMNS,
  DATASET_EDITOR_OVERSCAN_ROWS,
  DATASET_EDITOR_ROW_HEIGHT,
  INITIAL_DATA_COLUMN_WIDTH,
  INITIAL_DATA_MAXIMUM_COLUMNS,
  INITIAL_DATA_MINIMUM_COLUMNS,
  INITIAL_DATA_ROW_COUNT,
  VARIABLE_METADATA_BATCH_ACTIVE_DELAY,
  VARIABLE_METADATA_BATCH_IDLE_DELAY,
  VARIABLE_METADATA_BATCH_SIZE,
  getMinimumVisibleVariableRows
} from '../../dataset-editor/renderer/datasetEditorLayout';
import {
  createVariableSelectionController
} from '../../dataset-editor/selection/variableSelectionController';
import {
  VARIABLE_TABLE_COLUMNS
} from '../../dataset-editor/renderer/variableTableView';
import {
  createDatasetEditorClipboardState,
  type DatasetVariableColumnKey as VariableColumnKey,
} from '../../dataset-editor/clipboard/editorClipboardState';
import {
  isCommandVariableMetadataField,
  isPersistedVariableMetadataField,
  readVariableMetadataField,
  writeVariableMetadataField
} from '../../dataset-editor/state/variableMetadataFields';
import {
  createDataGridInteractionState
} from '../../dataset-editor/state/dataGridInteractionState';
import {
  createLoadedDataWindowState
} from '../../dataset-editor/state/loadedDataWindowState';
import {
  createLoadedDatasetContentState
} from '../../dataset-editor/state/loadedDatasetContentState';
import {
  createDatasetSchemaState
} from '../../dataset-editor/state/datasetSchemaState';
import {
  createDatasetVariableMetadataState
} from '../../dataset-editor/state/datasetVariableMetadataState';
import {
  createDatasetEditorIdentityState
} from '../../dataset-editor/state/datasetEditorIdentityState';
import type {
  DatasetViewerCell,
  DatasetVariableMetadata,
  DatasetViewerContentPage,
  DatasetViewerSchema
} from '../../base-app/modules/datasetViewer.types';

const { i18n } = require('../../base-app/i18n');

type DatasetEditorBridge =
  DatasetEditorIpcBridge & DatasetEditorTransportBridge;

const createNoopDatasetEditorBridge = function(): DatasetEditorBridge {
  return {
    onInit: () => {},
    onLanguageChanged: () => {},
    onSetDatasetList: () => {},
    onOpenDataset: () => {},
    onRefreshDataset: () => {},
    onFilterStateChanged: () => {},
    onApplyChanges: () => {},
    onGotoCase: () => {},
    onGotoVariable: () => {},
    persistVariableColumnWidths: async () => {},
    publishDatasetState: () => {},
    writeClipboardText: async () => false,
    readClipboardText: async () => "",
    runVisibleCommand: async () => false
  };
};

const datasetEditorBridge =
  window.dialogForge?.datasetEditor || createNoopDatasetEditorBridge();

const datasetEditorTransport =
  createDatasetEditorRendererTransport(datasetEditorBridge);
const datasetCommandTransport =
  createDatasetEditorCommandTransportController({
    transport: datasetEditorTransport,
    getDatasetName: () => datasetIdentity.currentName
  });

const PLUS_ICON_PATH = '../../assets/icons/plus.svg';
const DELETE_ICON_PATH = '../../assets/icons/xcircle.svg';

type CellContextMenuTarget = DatasetCellClipboardTarget | null;

const ROW_HEIGHT = DATASET_EDITOR_ROW_HEIGHT;
const HEADER_HEIGHT = DATASET_EDITOR_HEADER_HEIGHT;
const INDEX_COL_WIDTH = DATASET_EDITOR_INDEX_COLUMN_WIDTH;
const OVERSCAN_ROWS = DATASET_EDITOR_OVERSCAN_ROWS;
const OVERSCAN_COLS = DATASET_EDITOR_OVERSCAN_COLUMNS;

const datasetIdentity = createDatasetEditorIdentityState();
const datasetSchema = createDatasetSchemaState();
const variableMetadataState =
  createDatasetVariableMetadataState<DatasetVariableMetadata>();
const loadedDatasetContent = createLoadedDatasetContentState();
const loadedDataWindow = createLoadedDataWindowState();
const dataGridState = createDataGridInteractionState();
const variableSelection =
  createVariableSelectionController<VariableColumnKey>();

const {
  clearDataColumn: clearDataColumnClipboard,
  setDataColumn: setDataColumnClipboard,
  readDataColumn: readDataColumnClipboardPayload,
  clearVariableMetadata: clearVariableMetadataClipboard,
  makeVariableMetadataText: makeVariableMetadataClipboardText,
  readVariableMetadata: readVariableMetadataClipboardPayload
} = createDatasetEditorClipboardState();
const variableColumnWidths = createVariableColumnWidthController({
  persist: (widths) => {
    return datasetEditorTransport.persistVariableColumnWidths(widths);
  }
});

const localization = createDatasetEditorLocalizationController({
  i18n,
  defaultAppPath: process.cwd()
});
const t = (key: string) => localization.translate(key);
const datasetEditorCover = createDatasetEditorCover(
  document,
  (key) => t(key)
);
const addCover = datasetEditorCover.showModalCover;
const removeCover = datasetEditorCover.hideModalCover;
const showLoadingCover = datasetEditorCover.showLoadingCover;
const hideLoadingCover = datasetEditorCover.hideLoadingCover;
const datasetEditorChrome = createDatasetEditorChromeView({
  document,
  window,
  translate: (key) => t(key),
  readTitleState: () => ({
    datasetName: datasetIdentity.currentName,
    rowCount: Number(datasetSchema.snapshot.schema?.rowCount || 0),
    columnCount: Number(datasetSchema.snapshot.schema?.columnCount || 0)
  }),
  onVariablesActivated: () => {
    void activateVariablesTab();
  }
});
const datasetEditorContextMenus =
  createDatasetEditorContextMenuView<
    Exclude<CellContextMenuTarget, null>
  >(document, window);
const translateDatasetEditorMenus =
  datasetEditorChrome.translateMenus;
const translateDatasetEditorChrome =
  datasetEditorChrome.translateChrome;
const setTitle = function(_datasetName: string): void {
  datasetEditorChrome.renderTitle();
};
const syncDatasetSelector = function(): void {
  datasetEditorChrome.syncDatasetSelector(
    datasetIdentity.datasetNames,
    datasetIdentity.currentName
  );
};
const showFooterNotice = datasetEditorChrome.showFooterNotice;
const datasetTabs = createDatasetEditorTabController(
  datasetEditorChrome.setActiveTab
);
const setActiveTab = datasetTabs.setActiveTab;
const renderDataStatus = datasetEditorChrome.renderDataStatus;
const renderVariablesStatus =
  datasetEditorChrome.renderVariablesStatus;
const applyStoredVariableColumnWidths = variableColumnWidths.applyStored;
const persistVariableColumnWidths = variableColumnWidths.persist;

const VARIABLE_COLUMNS = VARIABLE_TABLE_COLUMNS;

const datasetEditorDom = createDatasetEditorDomController(document);
const variableGridDom = createVariableGridDomController(
  document,
  window
);



const activateVariablesTab = async () => {
  await variableMetadata.activate();
};

let variableMetadataLoad: DatasetVariableMetadataLoadController | null = null;

const variableMetadata =
createVariableMetadataController<DatasetVariableMetadata>({
  batchSize: VARIABLE_METADATA_BATCH_SIZE,
  activeDelay: VARIABLE_METADATA_BATCH_ACTIVE_DELAY,
  idleDelay: VARIABLE_METADATA_BATCH_IDLE_DELAY,
  getDatasetName: () => datasetIdentity.currentName,
  getItems: () => variableMetadataState.items,
  setItems: variableMetadataState.setItems,
  fetchBatch: (datasetName, start, count) => (
    datasetViewerClient.getVariablesBatch(datasetName, start, count)
  ),
  isVariableViewActive: datasetTabs.isVariablesActive,
  shouldPause: () => (
    variableMetadataLoad
      ? variableMetadataLoad.shouldPause()
      : false
  ),
  getVariableHost: variableGridDom.getHost,
  getMinimumVisibleRows: getMinimumVisibleVariableRows,
  renderItems: () => renderVariablesTable(),
  renderEmpty: () => renderVariablesStatus(t('No variable metadata available')),
  renderFailure: () => renderVariablesStatus(t('Could not load variable metadata')),
  scrollRowIntoView: variableGridDom.scrollRowIntoView
});

const isVariableMultiPasteKey = (key: VariableColumnKey): boolean => key !== 'name';

const datasetEditorSelectionState =
  createDatasetEditorSelectionStateController<VariableColumnKey>({
    dataGridState,
    variableSelection,
    isVariableMultiPasteKey,
    getActiveTab: () => datasetTabs.activeTab,
    hasLoadedVariables: () => (
      variableMetadata.snapshot.loaded
      || Array.isArray(variableMetadataState.items)
    ),
    publishDatasetState: () => {
      datasetEditorTransport.publishDatasetState(datasetIdentity.currentName);
    },
    renderDataPage: () => renderDataPage(),
    renderVariablesTable: () => renderVariablesTable()
  });
const clearActiveDataCell = datasetEditorSelectionState.clearActiveDataCell;
const clearJumpSelection = datasetEditorSelectionState.clearJumpSelection;
const getVariableCellSelectionBounds =
  datasetEditorSelectionState.variableCellSelectionBounds;
const getVariableCellSelectionRows =
  datasetEditorSelectionState.variableCellSelectionRows;
const isVariableCellSelected =
  datasetEditorSelectionState.isVariableCellSelected;
const getVariableCellSelectionRowsForTarget =
  datasetEditorSelectionState.variableCellSelectionRowsForTarget;
const isVariableCellRangeTarget =
  datasetEditorSelectionState.isVariableCellRangeTarget;
const publishDatasetEditorState =
  datasetEditorSelectionState.publishDatasetEditorState;

const datasetNavigation = createDatasetNavigationController({
  window,
  rowHeight: ROW_HEIGHT,
  minimumRowHeaderWidth: INDEX_COL_WIDTH,
  getDatasetName: () => datasetIdentity.currentName,
  getSchema: () => datasetSchema.snapshot.schema,
  getVariables: () => variableMetadataState.items,
  getRowNames: () => loadedDatasetContent.snapshot.rowNames,
  getColumnWidths: () => datasetSchema.snapshot.columnWidths,
  getDataHost: datasetEditorDom.getDataHost,
  setActiveTab,
  selectDataColumn: (columnName) => {
    dataGridState.selectColumn(columnName);
  },
  selectVariableRow: (rowIndex) => {
    variableSelection.setSelectedRow(rowIndex);
  },
  clearDataSelection: clearActiveDataCell,
  prioritizeVariableRow: (rowIndex) => {
    variableMetadata.prioritizeRow(rowIndex);
  },
  queueViewportRefresh: () => {
    queueViewportRefresh();
  }
});
const jumpToVariableForColumn = datasetNavigation.jumpToVariable;
const jumpToDataColumnForVariableRow =
  datasetNavigation.jumpToDataColumnForVariable;
const jumpToDataColumnByName = datasetNavigation.jumpToDataColumn;
const jumpToCaseRow = datasetNavigation.jumpToCase;

const summarizeValueLabels = (entry: DatasetVariableMetadata | null | undefined): string => {
  return summarizeDatasetValueLabels(entry, t);
};

const visibleCommandController = createDatasetVisibleCommandController({
  getRoot: datasetEditorDom.getRoot
});
const rememberDatasetEditorCommand = visibleCommandController.remember;

const hideRowContextMenu = datasetEditorContextMenus.hideRow;
const hideVariableRowContextMenu = datasetEditorContextMenus.hideVariableRow;
const hideCellContextMenu = datasetEditorContextMenus.hideCell;
const headerContextMenu =
  createDatasetHeaderContextMenuController({
    document,
    contextMenus: datasetEditorContextMenus,
    getDatasetName: () => datasetIdentity.currentName,
    getSchema: () => datasetSchema.snapshot.schema,
    readClipboardText: () => readTextFromClipboard(),
    readColumnPayload: readDataColumnClipboardPayload
  });
const hideHeaderContextMenu = headerContextMenu.hide;
const showHeaderContextMenu = headerContextMenu.show;

const showRowContextMenu = datasetEditorContextMenus.showRow;
const showVariableRowContextMenu = datasetEditorContextMenus.showVariableRow;
const cellContextMenu = createDatasetCellContextMenuController({
  contextMenus: datasetEditorContextMenus,
  isVariableRange: isVariableCellRangeTarget
});
const showCellContextMenu = cellContextMenu.showTarget;
const editFocusController = createDatasetEditFocusController({
  window,
  getDataHost: datasetEditorDom.getDataHost,
  dataGridState,
  hideHeaderMenu: hideHeaderContextMenu,
  hideRowMenu: hideRowContextMenu,
  renderData: () => renderDataPage()
});
const beginRowNameEdit = editFocusController.beginRowNameEdit;
const beginColumnHeaderEdit =
  editFocusController.beginColumnHeaderEdit;

const datasetStructuralActions = createDatasetStructuralActions({
  client: datasetViewerClient,
  getDatasetName: () => datasetIdentity.currentName,
  getSchema: () => datasetSchema.snapshot.schema,
  getLoadedRowNames: () => loadedDatasetContent.snapshot.rowNames,
  translate: (key) => t(key),
  confirm: (message) => window.confirm(message),
  hideHeaderMenu: hideHeaderContextMenu,
  hideRowMenu: hideRowContextMenu,
  showLoading: (message) => showLoadingCover(message),
  hideLoading: hideLoadingCover,
  showNotice: showFooterNotice,
  rememberCommand: rememberDatasetEditorCommand,
  resetSelectionAfterSort: (columnName) => {
    dataGridState.resetAfterSort(columnName);
  },
  refreshDataset: (datasetName) => refreshCurrentDataset(datasetName)
});
const sortDatasetRowsByColumn =
  datasetStructuralActions.sortRowsByColumn;
const insertDatasetColumn = datasetStructuralActions.insertColumn;
const removeDatasetColumn = datasetStructuralActions.removeColumn;
const insertDatasetRow = datasetStructuralActions.insertRow;
const removeDatasetRow = datasetStructuralActions.removeRow;
const writeTextToClipboard =
  datasetCommandTransport.writeClipboardText;
const readTextFromClipboard =
  datasetCommandTransport.readClipboardText;
const runVisibleDatasetEditorCommand =
  datasetCommandTransport.runVisibleCommand;

const isPersistedVariableField = isPersistedVariableMetadataField;
const isCommandVariableField = isCommandVariableMetadataField;

const localColumnRename = createDatasetLocalColumnRenameController({
  getSchemaColumns: () => Array.isArray(
    datasetSchema.snapshot.schema?.columns
  )
    ? datasetSchema.snapshot.schema!.columns
    : [],
  getLoadedColumns: () => loadedDatasetContent.snapshot.columns,
  getVariables: () => variableMetadataState.items,
  renameSelection: (previousName, updatedName) => {
    dataGridState.renameColumn(previousName, updatedName);
  }
});
const applyLocalColumnRename = localColumnRename.apply;

const variableMetadataActions = createVariableMetadataActions({
  getDatasetName: () => datasetIdentity.currentName,
  getVariable: (rowIndex) => {
    return variableMetadataState.items?.[rowIndex] || null;
  },
  replaceVariable: (rowIndex, variable) => {
    variableMetadataState.replaceItem(rowIndex, variable);
  },
  readField: readVariableMetadataField,
  writeField: writeVariableMetadataField,
  updateVariable: (datasetName, variableName, patch) => {
    return datasetViewerClient.updateVariable(
      datasetName,
      variableName,
      patch
    );
  },
  renameColumn: (datasetName, previousName, nextName) => {
    return datasetViewerClient.updateColumnName(
      datasetName,
      previousName,
      nextName
    );
  },
  applyLocalRename: applyLocalColumnRename,
  buildCommand: buildVariableMetadataCommand,
  rememberCommand: rememberDatasetEditorCommand,
  renderVariables: () => renderVariablesTable(),
  renderDataIfActive: () => {
    if (datasetTabs.isDataActive()) renderDataPage();
  },
  showNotice: showFooterNotice,
  translate: (key) => t(key)
});
const persistVariableFieldChange =
  variableMetadataActions.persistField;
const applyVariableNameFieldChange =
  variableMetadataActions.rename;
const applyMeasureFieldChange =
  variableMetadataActions.updateMeasure;

const loadedCellController = createDatasetLoadedCellController({
  getLoadedRowStart: () => loadedDataWindow.snapshot.rowStart,
  getColumns: () => loadedDatasetContent.snapshot.columns,
  getRows: () => loadedDatasetContent.snapshot.rows
});

const getDataCellForTarget = (target: Extract<CellContextMenuTarget, { kind: 'data' }>): DatasetViewerCell | null => {
  return loadedCellController.read(target.row, target.column);
};

const variableMetadataPaste =
  createVariableMetadataPasteController({
    getFieldElement: variableGridDom.getFieldElement,
    isPersistedField: isPersistedVariableField,
    isCommandField: isCommandVariableField,
    persistField: persistVariableFieldChange,
    renameField: applyVariableNameFieldChange,
    updateMeasure: applyMeasureFieldChange,
    pasteValues: variableMetadataActions.pasteValues
  });

const datasetCellClipboardActions =
  createDatasetCellClipboardActions({
    getTarget: () => datasetEditorContextMenus.cellTarget,
    hideMenu: hideCellContextMenu,
    isVariableRange: isVariableCellRangeTarget,
    getVariableRows: getVariableCellSelectionRowsForTarget,
    getDataCell: getDataCellForTarget,
    getVariable: (rowIndex) => {
      return variableMetadataState.items?.[rowIndex] || null;
    },
    clearDataColumnClipboard,
    clearVariableMetadataClipboard,
    makeVariableMetadataText:
      makeVariableMetadataClipboardText,
    readVariableMetadata:
      readVariableMetadataClipboardPayload,
    writeClipboard: writeTextToClipboard,
    readClipboard: readTextFromClipboard,
    updateDataCell: (row, column, value) => {
      return datasetViewerClient.updateCell(
        datasetIdentity.currentName,
        {
          row,
          column,
          value
        }
      );
    },
    replaceLoadedDataCell: loadedCellController.replace,
    renderData: () => renderDataPage(),
    getVariableField: variableMetadataPaste.getFieldElement,
    applyVariableText: variableMetadataPaste.applyText,
    applyVariableValues: variableMetadataPaste.pasteValues,
    clearVariableRange: () => {
      variableSelection.clearRange();
    },
    renderVariables: () => renderVariablesTable(),
    refreshDataset: () => {
      return refreshCurrentDataset(datasetIdentity.currentName);
    },
    showNotice: showFooterNotice,
    translate: (key) => t(key)
  });
const copyCellContextTarget =
  datasetCellClipboardActions.copyTarget;
const pasteCellContextTarget =
  datasetCellClipboardActions.pasteTarget;

const activeCellClipboard =
  createActiveCellClipboardController({
    getActiveTab: () => datasetTabs.activeTab,
    getActiveVariableCell: () => variableSelection.activeCell(),
    getActiveDataCell: () => dataGridState.snapshot.activeCell,
    isVariableRange: isVariableCellRangeTarget,
    setTarget: (target) => {
      datasetEditorContextMenus.setCellTarget(target);
    },
    copyTarget: copyCellContextTarget,
    pasteTarget: pasteCellContextTarget
  });
const copyActiveDatasetEditorCell = activeCellClipboard.copy;
const pasteActiveDatasetEditorCell = activeCellClipboard.paste;

const valueLabelsEditor = createValueLabelsEditorController({
  document,
  getVariables: () => variableMetadataState.items,
  replaceVariable: (rowIndex, variable) => {
    variableMetadataState.replaceItem(rowIndex, variable);
  },
  getDatasetName: () => datasetIdentity.currentName,
  translate: (key) => t(key),
  escapeHtml,
  plusIconPath: PLUS_ICON_PATH,
  deleteIconPath: DELETE_ICON_PATH,
  showCover: addCover,
  hideCover: removeCover,
  updateVariable: (datasetName, variableName, patch) => {
    return datasetViewerClient.updateVariable(
      datasetName,
      variableName,
      patch
    );
  },
  buildCommand: buildVariableMetadataCommand,
  rememberCommand: rememberDatasetEditorCommand,
  variablesTabActive: datasetTabs.isVariablesActive,
  renderVariables: () => renderVariablesTable(),
  refreshDataset: (datasetName) => refreshCurrentDataset(datasetName),
  showNotice: showFooterNotice
});
const openValueLabelsEditor = valueLabelsEditor.open;
const closeValueLabelsEditor = valueLabelsEditor.close;
const cancelValueLabelsEditor = valueLabelsEditor.cancel;
const saveValueLabelsEditor = valueLabelsEditor.save;
const renderValueLabelsEditor = valueLabelsEditor.render;

const dataGridInteractions = createDataGridInteractionBindings({
  window,
  isColumnEditing: (column) => {
    return dataGridState.snapshot.activeColumnEdit === column;
  },
  isRowEditing: (row) => (
    dataGridState.snapshot.activeRowNameEdit === row
  ),
  selectColumn: (column, render) => {
    dataGridState.selectColumn(column);
    if (render) renderDataPage();
  },
  selectRow: (row, render) => {
    dataGridState.selectRow(row);
    if (render) renderDataPage();
  },
  selectCell: (cell, render) => {
    dataGridState.selectCell(cell);
    if (render) renderDataPage();
  },
  showColumnMenu: showHeaderContextMenu,
  showRowMenu: showRowContextMenu,
  showCellMenu: cellContextMenu.showDataCell,
  openVariable: (column) => {
    void jumpToVariableForColumn(column);
  },
  editRowName: beginRowNameEdit,
  beginCellEdit: (cell) => {
    dataGridState.beginCellEdit(cell);
  },
  render: () => renderDataPage(),
  edits: {
    getDatasetName: () => datasetIdentity.currentName,
    clearColumnEdit: () => {
      dataGridState.clearColumnEdit();
    },
    clearRowNameEdit: () => {
      dataGridState.clearRowNameEdit();
    },
    clearCellEdit: () => {
      dataGridState.clearCellEdit();
    },
    renameColumn: (datasetName, previousName, nextName) => {
      return datasetViewerClient.updateColumnName(
        datasetName,
        previousName,
        nextName
      );
    },
    applyLocalColumnRename,
    getLoadedRowStart: () => loadedDataWindow.snapshot.rowStart,
    getLoadedRowName: (index) => {
      return (
        index >= 0
        && index < loadedDatasetContent.snapshot.rowNames.length
      )
        ? String(loadedDatasetContent.snapshot.rowNames[index] || '')
        : '';
    },
    renameRow: (datasetName, rowNumber, nextName) => {
      return datasetViewerClient.updateRowName(
        datasetName,
        rowNumber,
        nextName
      );
    },
    replaceLoadedRowName: (index, nextName) => {
      loadedDatasetContent.replaceRowName(index, nextName);
    },
    updateCell: (
      datasetName,
      rowNumber,
      columnName,
      value
    ) => {
      return datasetViewerClient.updateCell(
        datasetName,
        {
          row: rowNumber,
          column: columnName,
          value
        }
      );
    },
    replaceLoadedCell: loadedCellController.replace,
    render: () => renderDataPage(),
    showNotice: showFooterNotice,
    translate: (key) => t(key)
  }
});
const variableGridInteractions =
  createVariableGridInteractionBindings({
    getSelectionState: () => ({
      ...variableSelection.snapshot
    }),
    setSelectionState: (state) => {
      variableSelection.setState(state);
    },
    clearActiveDataCell,
    isMultiPasteKey: isVariableMultiPasteKey,
    selectedRows: getVariableCellSelectionRows,
    getVariables: () => variableMetadataState.items,
    showCellMenu: cellContextMenu.showVariableCell,
    showRowMenu: showVariableRowContextMenu,
    isPersistedField: isPersistedVariableField,
    isCommandField: isCommandVariableField,
    writeField: writeVariableMetadataField,
    persistField: (
      rowIndex,
      key,
      value,
      field
    ) => {
      if (isPersistedVariableField(key)) {
        void persistVariableFieldChange(
          rowIndex,
          key,
          value,
          field
        );
      }
    },
    updateMeasure: (rowIndex, value, field) => {
      void applyMeasureFieldChange(rowIndex, value, field);
    },
    renameVariable: (rowIndex, value, field) => {
      void applyVariableNameFieldChange(rowIndex, value, field);
    },
    columnWidths: variableColumnWidths.get(),
    openValueLabels: openValueLabelsEditor,
    openDataColumn: jumpToDataColumnForVariableRow,
    persistColumnWidths: () => {
      void persistVariableColumnWidths();
    }
  });

const datasetTableRenderer = createDatasetTableRenderer({
  rowHeight: ROW_HEIGHT,
  headerHeight: HEADER_HEIGHT,
  minimumRowHeaderWidth: INDEX_COL_WIDTH,
  getDataHost: datasetEditorDom.getDataHost,
  getVariablesHost: variableGridDom.getHost,
  getSchema: () => datasetSchema.snapshot.schema,
  getDataLoadFailed: () => loadedDataWindow.snapshot.loadFailed,
  getDataColumns: () => loadedDatasetContent.snapshot.columns,
  getDataColumnWidths: () => datasetSchema.snapshot.columnWidths,
  getDataRowNames: () => loadedDatasetContent.snapshot.rowNames,
  getDataRows: () => loadedDatasetContent.snapshot.rows,
  getFilteredRows: () => loadedDatasetContent.snapshot.filteredOut,
  getLoadedRowStart: () => loadedDataWindow.snapshot.rowStart,
  getLoadedColumnStart: () => loadedDataWindow.snapshot.columnStart,
  getSelectedDataColumn: () => dataGridState.snapshot.selectedColumn,
  getSelectedDataRow: () => dataGridState.snapshot.selectedRow,
  getActiveDataCell: () => dataGridState.snapshot.activeCell,
  getActiveDataEdit: () => dataGridState.snapshot.activeCellEdit,
  getActiveColumnHeaderEdit: () => (
    dataGridState.snapshot.activeColumnEdit
  ),
  getActiveRowNameEdit: () => (
    dataGridState.snapshot.activeRowNameEdit
  ),
  getVariables: () => variableMetadataState.items,
  getVariableColumnWidths: () => variableColumnWidths.get(),
  getSelectedVariableRow: () => (
    variableSelection.snapshot.selectedRowIndex
  ),
  getActiveVariableRow: () => (
    variableSelection.snapshot.activeRowIndex
  ),
  isVariableMetadataLoaded: () => variableMetadata.snapshot.loaded,
  isVariableCellSelected,
  translate: (key) => t(key),
  escapeHtml,
  renderDataStatus,
  renderVariablesStatus,
  bindDataInteractions: (host) => {
    dataGridInteractions.bind(host);
  },
  bindVariableInteractions: (host, table) => {
    variableGridInteractions.bind(host, table);
  }
});
const renderDataPage = datasetTableRenderer.renderData;
const renderVariablesTable = datasetTableRenderer.renderVariables;

const viewportResults = createDatasetViewportResultController<
  DatasetViewerContentPage['columns'][number],
  DatasetViewerCell
>({
  setLoadFailed: loadedDataWindow.setLoadFailed,
  clearContent: loadedDatasetContent.clear,
  setContent: loadedDatasetContent.setWindow,
  resetLoadedWindow: loadedDataWindow.resetWindow,
  setLoadedWindow: loadedDataWindow.setWindow,
  renderLoadingStatus: () => {
    renderDataStatus(t('Loading data...'));
  },
  renderData: renderDataPage
});

const dataViewport = createDatasetViewportController<
  DatasetViewerContentPage['columns'][number],
  DatasetViewerCell
>({
  window,
  getHost: datasetEditorDom.getDataHost,
  getDatasetName: () => datasetIdentity.currentName,
  getSchemaColumns: () => Array.isArray(
    datasetSchema.snapshot.schema?.columns
  )
    ? datasetSchema.snapshot.schema!.columns
    : [],
  getRowCount: () => Number(
    datasetSchema.snapshot.schema?.rowCount || 0
  ),
  getColumnWidths: () => datasetSchema.snapshot.columnWidths,
  getLoadedRowNames: () => loadedDatasetContent.snapshot.rowNames,
  getLoadedWindow: () => ({
    rowStart: loadedDataWindow.snapshot.rowStart,
    rowEnd: loadedDataWindow.snapshot.rowEnd,
    columnStart: loadedDataWindow.snapshot.columnStart,
    columnEnd: loadedDataWindow.snapshot.columnEnd,
    hasColumns: loadedDatasetContent.snapshot.columns.length > 0
  }),
  rowHeight: ROW_HEIGHT,
  indexColumnWidth: INDEX_COL_WIDTH,
  overscanRows: OVERSCAN_ROWS,
  overscanColumns: OVERSCAN_COLS,
  isLoadingCoverActive: () => datasetEditorCover.isLoading,
  fetchContent: (datasetName, request) => {
    return datasetViewerClient.getContent(datasetName, request);
  },
  fetchFilterMask: (datasetName, rowStart, rowCount) => {
    return datasetViewerClient.getFilterMask(
      datasetName,
      rowStart,
      rowCount
    );
  },
  showLoadingStatus: viewportResults.showLoadingStatus,
  applyFailure: viewportResults.applyFailure,
  applyWindow: viewportResults.applyWindow
});

const viewportReloadController = createDatasetViewportReloadController({
  viewport: dataViewport,
  hasDataset: () => !!datasetIdentity.currentName,
  hasSchema: () => Boolean(datasetSchema.snapshot.schema),
  resetLoadedWindow: loadedDataWindow.resetWindow
});
const invalidatePendingDataLoads = viewportReloadController.invalidate;
const loadDatasetWindow = viewportReloadController.loadWindow;

variableMetadataLoad = createDatasetVariableMetadataLoadController({
  metadata: variableMetadata,
  getActiveTab: () => datasetTabs.activeTab,
  getViewportSnapshot: () => dataViewport.snapshot,
  clearVariables: variableMetadataState.clear
});
const scheduleBackgroundVariableLoad =
  variableMetadataLoad.scheduleBackground;
const resetVariableMetadataState = variableMetadataLoad.reset;
const loadAllVariablesNow = variableMetadataLoad.loadAll;
const loadVariablesUntil = variableMetadataLoad.loadUntil;
const loadVariablesThroughRow = variableMetadataLoad.loadThroughRow;

const queueViewportRefresh = dataViewport.queueRefresh;

const ensureVariablesLoaded = variableMetadataLoad.ensureLoaded;
const startBackgroundVariableLoad = variableMetadataLoad.startBackground;
const variableMetadataLookup =
  createDatasetVariableMetadataLookupController<DatasetVariableMetadata>({
    getDatasetName: () => datasetIdentity.currentName,
    getVariables: () => variableMetadataState.items,
    isLoaded: () => variableMetadata.snapshot.loaded,
    reset: resetVariableMetadataState,
    loadAll: loadAllVariablesNow,
    renderVariables: () => renderVariablesTable(),
    renderEmpty: () => {
      renderVariablesStatus(t('No variable metadata available'));
    }
  });

const datasetColumnClipboardActions =
  createDatasetColumnClipboardActions({
    clipboardState: {
      clearDataColumn: clearDataColumnClipboard,
      setDataColumn: setDataColumnClipboard,
      readDataColumn: readDataColumnClipboardPayload,
      clearVariableMetadata: clearVariableMetadataClipboard,
      makeVariableMetadataText: makeVariableMetadataClipboardText,
      readVariableMetadata: readVariableMetadataClipboardPayload
    },
    getDatasetName: () => datasetIdentity.currentName,
    getRowCount: () => Number(
      datasetSchema.snapshot.schema?.rowCount || 0
    ),
    getColumnNames: () => {
      return (datasetSchema.snapshot.schema?.columns || []).map((entry) => {
        return String(entry?.name || '');
      });
    },
    getContent: (datasetName, request) => {
      return datasetViewerClient.getContent(datasetName, request);
    },
    getVariableMetadata: variableMetadataLookup.getForColumn,
    writeClipboard: writeTextToClipboard,
    readClipboard: readTextFromClipboard,
    runCommand: runVisibleDatasetEditorCommand,
    refreshDataset: (datasetName) => refreshCurrentDataset(datasetName),
    hideHeaderMenu: hideHeaderContextMenu,
    showLoading: showLoadingCover,
    hideLoading: hideLoadingCover,
    showNotice: showFooterNotice,
    translate: (key) => t(key)
  });
const copyDatasetColumn = datasetColumnClipboardActions.copy;
const pasteDatasetColumn = datasetColumnClipboardActions.paste;

const initialPageController = createDatasetInitialPageController({
  window,
  getDataHost: datasetEditorDom.getDataHost,
  rowHeaderWidth: INDEX_COL_WIDTH,
  overscanColumns: OVERSCAN_COLS,
  minimumColumnWidth: INITIAL_DATA_COLUMN_WIDTH,
  minimumColumns: INITIAL_DATA_MINIMUM_COLUMNS,
  maximumColumns: INITIAL_DATA_MAXIMUM_COLUMNS,
  getCurrentDatasetName: () => datasetIdentity.currentName,
  getLoadedRowStart: () => loadedDataWindow.snapshot.rowStart,
  getCurrentDataRows: () => loadedDatasetContent.snapshot.rows,
  setSchema: datasetSchema.setSchema,
  setColumnWidths: datasetSchema.setColumnWidths,
  setDataColumns: loadedDatasetContent.setColumns,
  setDataRowNames: loadedDatasetContent.setRowNames,
  setDataRows: loadedDatasetContent.setRows,
  setDataFilteredOut: loadedDatasetContent.setFilteredOut,
  setLoadedWindow: loadedDataWindow.setWindow,
  setDataLoadFailed: loadedDataWindow.setLoadFailed,
  renderData: renderDataPage,
  hideLoading: hideLoadingCover,
  renderTitle: () => setTitle(datasetIdentity.currentName),
  startVariableWarmup: startBackgroundVariableLoad,
  fetchFilterMask: (datasetName, rowStart, rowCount) => {
    return datasetViewerClient.getFilterMask(
      datasetName,
      rowStart,
      rowCount
    );
  }
});
const estimateInitialDataColumns =
  initialPageController.estimateColumnCount;
const applyInitialDatasetPage = initialPageController.apply;

const datasetOpenPreparation = createDatasetOpenPreparationController({
  setDatasetName: (datasetName) => {
    datasetIdentity.setCurrentName(datasetName);
  },
  publishDatasetState: publishDatasetEditorState,
  syncDatasetSelector,
  hideHeaderMenu: hideHeaderContextMenu,
  closeValueLabels: closeValueLabelsEditor,
  clearSchema: datasetSchema.clear,
  resetVariableMetadata: resetVariableMetadataState,
  clearDataWindow: loadedDatasetContent.clear,
  resetLoadedWindow: loadedDataWindow.resetWindow,
  invalidatePendingLoads: invalidatePendingDataLoads,
  markViewportActivity: dataViewport.markActivity,
  setDataLoadFailed: loadedDataWindow.setLoadFailed,
  clearEditState: dataGridState.clearEditing,
  renderTitle: () => setTitle(datasetIdentity.currentName)
});

const openingSchemaController = createDatasetOpeningSchemaController({
  initialColumnCount: estimateInitialDataColumns,
  setSchema: datasetSchema.setSchema,
  setColumnWidths: datasetSchema.setColumnWidths,
  renderTitle: () => setTitle(datasetIdentity.currentName),
  loadWindow: viewportReloadController.loadRange
});
const schemaFailure = createDatasetSchemaFailureController({
  clearSchema: datasetSchema.clear,
  setDataLoadFailed: loadedDataWindow.setLoadFailed,
  clearContent: loadedDatasetContent.clear,
  renderDataFailure: () => {
    renderDataStatus(t('Could not load dataset schema'));
  },
  renderVariableFailure: () => {
    renderVariablesStatus(t('Could not load variable metadata'));
  }
});
const openingPresentation = createDatasetOpeningPresentationController({
  translate: (key) => t(key),
  renderDataStatus,
  renderVariablesStatus,
  showLoadingCover
});

const datasetOpening = createDatasetOpeningController<
  DatasetViewerSchema,
  DatasetViewerContentPage
>({
  initialRowCount: INITIAL_DATA_ROW_COUNT,
  normalizeDatasetName: (value) => String(value || '').trim(),
  prepareDataset: datasetOpenPreparation.prepare,
  showEmptyDataset: openingPresentation.showEmptyDataset,
  showInitialLoading: openingPresentation.showInitialLoading,
  showContentLoading: openingPresentation.showContentLoading,
  hideLoading: hideLoadingCover,
  fetchInitialPage: (datasetName, rowCount) => {
    return datasetViewerClient.getContent(datasetName, {
      rowStart: 1,
      rowCount,
      columnCount: estimateInitialDataColumns()
    });
  },
  fetchSchema: (datasetName) => {
    return datasetViewerClient.getSchema(datasetName);
  },
  applyInitialPage: applyInitialDatasetPage,
  applySchema: (_datasetName, schema) => {
    openingSchemaController.apply(schema);
  },
  loadFallbackPage: openingSchemaController.loadFallbackPage,
  showSchemaFailure: schemaFailure.show,
  startVariableWarmup: startBackgroundVariableLoad,
  queueViewportRefresh
});

const loadDataset = async (datasetName: string) => {
  await datasetOpening.open(datasetName);
};

const datasetRefresh = createDatasetRefreshController<
  DatasetViewerSchema,
  DatasetVariableMetadata
>({
  batchSize: VARIABLE_METADATA_BATCH_SIZE,
  normalizeDatasetName: (value) => String(value || '').trim(),
  getCurrentDatasetName: () => datasetIdentity.currentName,
  getCurrentSchema: () => datasetSchema.snapshot.schema,
  openDataset: loadDataset,
  syncDatasetSelector,
  hideHeaderMenu: hideHeaderContextMenu,
  closeValueLabels: closeValueLabelsEditor,
  clearEditState: dataGridState.clearEditing,
  invalidatePendingLoads: invalidatePendingDataLoads,
  markViewportActivity: dataViewport.markActivity,
  isVariableViewActive: datasetTabs.isVariablesActive,
  isVariableMetadataLoaded: () => variableMetadata.snapshot.loaded,
  resetVariableMetadata: resetVariableMetadataState,
  fetchSchema: (datasetName) => {
    return datasetViewerClient.getSchema(datasetName);
  },
  applySchema: (schema) => {
    datasetSchema.applySchema(schema);
    setTitle(datasetIdentity.currentName);
  },
  showSchemaFailure: schemaFailure.applyRefreshFailure,
  readViewport: dataViewport.readPlan,
  resetLoadedWindow: viewportReloadController.resetLoadedWindow,
  loadWindow: viewportReloadController.loadWindow,
  getVariableHost: variableGridDom.getHost,
  getMinimumVisibleVariableRows,
  loadVariablesUntil,
  ensureVariablesLoaded,
  getVariables: () => variableMetadataState.items,
  renderVariables: renderVariablesTable,
  renderNoVariables: () => {
    renderVariablesStatus(t('No variable metadata available'));
  },
  scheduleBackgroundVariableLoad,
  queueViewportRefresh
});
const refreshCurrentDataset = datasetRefresh.refresh;

const forceCurrentViewportReload = viewportReloadController.forceCurrent;

const variableRowRefresh =
  createDatasetVariableRowRefreshController<DatasetVariableMetadata>({
    getDatasetName: () => datasetIdentity.currentName,
    getSchemaColumns: () => Array.isArray(
      datasetSchema.snapshot.schema?.columns
    )
      ? datasetSchema.snapshot.schema!.columns
      : [],
    getVariables: () => variableMetadataState.items,
    setVariables: variableMetadataState.setItems,
    fetchBatch: (datasetName, start, count) => {
      return datasetViewerClient.getVariablesBatch(
        datasetName,
        start,
        count
      );
    },
    isVariablesActive: datasetTabs.isVariablesActive,
    renderVariables: renderVariablesTable
  });
const refreshVariableRowsByNames = variableRowRefresh.refresh;

const columnChanges = createDatasetColumnChangeApplier({
  getSchema: () => datasetSchema.snapshot.schema,
  getLoadedColumns: () => loadedDatasetContent.snapshot.columns,
  getLoadedRows: () => loadedDatasetContent.snapshot.rows,
  setLoadedRows: loadedDatasetContent.setRows,
  getVariables: () => variableMetadataState.items,
  getColumnWidths: () => datasetSchema.snapshot.columnWidths,
  getLoadedColumnStart: () => loadedDataWindow.snapshot.columnStart,
  getLoadedColumnEnd: () => loadedDataWindow.snapshot.columnEnd,
  setLoadedColumnEnd: loadedDataWindow.setColumnEnd,
  renameSelection: (previousName, nextName) => {
    dataGridState.renameColumn(previousName, nextName);
  },
  clearRemovedSelection: (removedName) => {
    dataGridState.removeColumn(removedName);
  },
  renderTitle: () => setTitle(datasetIdentity.currentName),
  renderData: renderDataPage,
  renderVariables: renderVariablesTable,
  dataViewActive: datasetTabs.isDataActive,
  variableViewAvailable: () => {
    return datasetTabs.isVariablesActive()
      && (
        variableMetadata.snapshot.loaded
        || Array.isArray(variableMetadataState.items)
      );
  },
  queueViewportRefresh
});
const applyColumnRenameChanges = columnChanges.applyRenames;
const applyColumnRemovedChanges = columnChanges.applyRemovals;

const datasetChanges = createDatasetChangeController({
  getDatasetName: () => datasetIdentity.currentName,
  removeDataset: () => loadDataset(''),
  applyColumnRenames: applyColumnRenameChanges,
  applyColumnRemovals: applyColumnRemovedChanges,
  refreshSchema: () => refreshCurrentDataset(datasetIdentity.currentName),
  refreshRowSchema: async () => {
    const schema = await datasetViewerClient.getSchema(datasetIdentity.currentName);
    if (schema) datasetSchema.setSchema(schema);
  },
  refreshViewport: forceCurrentViewportReload,
  refreshVariables: refreshVariableRowsByNames
});
const applyDatasetChanges = datasetChanges.apply;

const windowInteractions =
  createDatasetEditorWindowInteractionController({
    isFontShortcut: (event) => {
      return isDatasetEditorFontShortcutKey(event);
    },
    getActiveTab: () => datasetTabs.activeTab,
    setActiveTab,
    getSelectedColumn: () => (
      dataGridState.snapshot.selectedColumn
    ),
    hasVariableRangeSelection: () => {
      const activeVariableCell = variableSelection.activeCell();

      if (!activeVariableCell) {
        return false;
      }

      return Boolean(
        getVariableCellSelectionBounds(activeVariableCell.key)
      );
    },
    isValueLabelsEditorOpen: valueLabelsEditor.isOpen,
    isHeaderMenuOpen: () => (
      Boolean(datasetEditorContextMenus.headerColumn)
    ),
    isRowMenuOpen: () => (
      datasetEditorContextMenus.rowNumber > 0
    ),
    isVariableRowMenuOpen: () => (
      Boolean(datasetEditorContextMenus.variableRowColumn)
    ),
    isCellMenuOpen: () => (
      Boolean(datasetEditorContextMenus.cellTarget)
    ),
    hideHeaderMenu: hideHeaderContextMenu,
    hideRowMenu: hideRowContextMenu,
    hideVariableRowMenu: hideVariableRowContextMenu,
    hideCellMenu: hideCellContextMenu,
    closeValueLabelsEditor: cancelValueLabelsEditor,
    copySelectedColumn: (columnName) => {
      return copyDatasetColumn(columnName, {
        includeLabels: true
      });
    },
    pasteSelectedColumn: pasteDatasetColumn,
    copyActiveCell: copyActiveDatasetEditorCell,
    pasteActiveCell: pasteActiveDatasetEditorCell,
    clearSelection: clearJumpSelection,
    markDataViewportActivity: dataViewport.markActivity,
    queueViewportRefresh
  });
const contextMenuBindings =
  createDatasetEditorContextMenuBindingController(
    document,
    datasetEditorContextMenus,
    {
      copyColumn: copyDatasetColumn,
      pasteColumn: pasteDatasetColumn,
      sortColumn: sortDatasetRowsByColumn,
      renameColumn: beginColumnHeaderEdit,
      insertColumn: insertDatasetColumn,
      removeColumn: removeDatasetColumn,
      insertRow: insertDatasetRow,
      renameRow: beginRowNameEdit,
      removeRow: removeDatasetRow,
      copyCell: copyCellContextTarget,
      pasteCell: pasteCellContextTarget
    }
  );
const controlBindings =
  createDatasetEditorControlBindingController({
    rowHeight: ROW_HEIGHT,
    getActiveTab: () => datasetTabs.activeTab,
    setActiveTab,
    getCurrentDatasetName: () => datasetIdentity.currentName,
    loadDataset,
    markDataViewportActivity: dataViewport.markActivity,
    queueViewportRefresh,
    isVariableMetadataLoaded: () => (
      variableMetadata.snapshot.loaded
    ),
    getVariableCount: () => (
      Array.isArray(variableMetadataState.items)
        ? variableMetadataState.items.length
        : 0
    ),
    loadVariablesThroughRow: (rowIndex) => {
      return loadVariablesThroughRow(rowIndex, false);
    },
    isValueLabelsEditorOpen: valueLabelsEditor.isOpen,
    cancelValueLabelsEditor,
    saveValueLabelsEditor
  });

bindDatasetEditorUi({
  document,
  ...controlBindings,
  contextMenus: contextMenuBindings,
  globalEvents: windowInteractions.globalEvents,
  dismissal: windowInteractions.dismissal
});
renderDataStatus(' ');
renderVariablesStatus(' ');

const datasetEditorInitialization = createDatasetEditorInitializationController({
  applyStoredVariableColumnWidths,
  initializeLocalization: (locale, appPath) => {
    localization.initialize(locale, appPath);
  },
  setLanguage: (locale, appPath) => {
    localization.setLanguage(locale, appPath);
  },
  translateMenus: translateDatasetEditorMenus,
  translateChrome: translateDatasetEditorChrome,
  setActiveTab,
  setDatasetNames: datasetIdentity.setDatasetNames,
  syncDatasetSelector,
  loadDataset: (datasetName) => {
    void loadDataset(datasetName);
  },
  getCurrentDatasetName: () => datasetIdentity.currentName,
  renderTitle: setTitle,
  isVariablesTabActive: datasetTabs.isVariablesActive,
  renderVariablesTable,
  isValueLabelsEditorOpen: () => valueLabelsEditor.isOpen(),
  renderValueLabelsEditor
});
const datasetFilterState = createDatasetFilterStateController({
  getDatasetName: () => datasetIdentity.currentName,
  resetLoadedRows: loadedDataWindow.resetRows,
  queueViewportRefresh
});

const datasetExternalActions = createDatasetEditorExternalActionsController({
  initialize: datasetEditorInitialization.initialize,
  changeLanguage: datasetEditorInitialization.changeLanguage,
  setDatasetList: datasetEditorInitialization.setDatasetList,
  getCurrentDatasetName: () => datasetIdentity.currentName,
  loadDataset,
  refreshDataset: refreshCurrentDataset,
  applyFilterStateChanged: datasetFilterState.applyFilterStateChanged,
  applyDatasetChanges,
  jumpToCase: jumpToCaseRow,
  jumpToVariable: jumpToDataColumnByName
});

datasetExternalActions.bindIpc(datasetEditorBridge);
