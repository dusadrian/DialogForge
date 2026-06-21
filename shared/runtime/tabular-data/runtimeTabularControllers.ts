import type {
    RuntimeCapability,
    RuntimeImportController,
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot,
    RuntimeTabularController,
    RuntimeWorkspaceController,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import {
    createRuntimeFallbackWorkspaceController
} from "../workspace/runtimeFallbackWorkspaceController";
import {
    createRuntimeFallbackCellMutationController
} from "./runtimeFallbackCellMutationController";
import {
    createRuntimeFallbackColumnMutationController
} from "./runtimeFallbackColumnMutationController";
import {
    createRuntimeFallbackImportController
} from "./runtimeFallbackImportController";
import {
    createRuntimeFallbackLabelStateController
} from "./runtimeFallbackLabelStateController";
import {
    createRuntimeFallbackRowMutationController
} from "./runtimeFallbackRowMutationController";
import {
    createRuntimeFallbackVariableMetadataController
} from "./runtimeFallbackVariableMetadataController";
import {
    createRuntimeCellMutationExecutionController
} from "./runtimeCellMutationExecutionController";
import type {
    RuntimeCellMutationExecutionController
} from "./runtimeCellMutationExecutionController";
import {
    createRuntimeColumnMutationExecutionController
} from "./runtimeColumnMutationExecutionController";
import {
    createRuntimeColumnMutationOperationController
} from "./runtimeColumnMutationOperationController";
import type {
    RuntimeColumnMutationOperationController
} from "./runtimeColumnMutationOperationController";
import {
    createRuntimeImportExecutionController
} from "./runtimeImportExecutionController";
import {
    createRuntimeImportOperationController
} from "./runtimeImportOperationController";
import type {
    RuntimeImportOperationController
} from "./runtimeImportOperationController";
import {
    createRuntimeLabelStateExecutionController
} from "./runtimeLabelStateExecutionController";
import {
    createRuntimeLabelStateOperationController
} from "./runtimeLabelStateOperationController";
import type {
    RuntimeLabelStateOperationController
} from "./runtimeLabelStateOperationController";
import {
    createRuntimeRowMutationExecutionController
} from "./runtimeRowMutationExecutionController";
import {
    createRuntimeRowMutationOperationController
} from "./runtimeRowMutationOperationController";
import type {
    RuntimeRowMutationOperationController
} from "./runtimeRowMutationOperationController";
import {
    createRuntimeTabularCompositionController
} from "./runtimeTabularCompositionController";
import {
    createRuntimeTabularReadController
} from "./runtimeTabularReadController";
import {
    createRuntimeTabularReadOperationController
} from "./runtimeTabularReadOperationController";
import type {
    RuntimeTabularReadOperationController
} from "./runtimeTabularReadOperationController";
import {
    createRuntimeVariableMetadataExecutionController
} from "./runtimeVariableMetadataExecutionController";
import {
    createRuntimeVariableMetadataOperationController
} from "./runtimeVariableMetadataOperationController";
import type {
    RuntimeVariableMetadataOperationController
} from "./runtimeVariableMetadataOperationController";


export interface RuntimeTabularControllersOptions {
    providerId(): string;
    providerManifestId: string;
    providerWorkspaceController?: RuntimeWorkspaceController;
    providerTabularController?: RuntimeTabularController;
    providerImportController?: RuntimeImportController;
    readOnlyAdapter?: RuntimeReadOnlyAdapter;
    fallbackState: RuntimeFallbackTabularState;
    getSnapshot(): RuntimeSessionSnapshot;
    getActiveObjectName(): string;
    hasRuntimeCapability(capability: RuntimeCapability): boolean;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
    rememberWorkspaceObjects(objects: WorkspaceObjectSnapshot[]): WorkspaceObjectSnapshot[];
    selectKnown(objectName: string, reason: string): void;
    selectFromWorkspace(
        objects: WorkspaceObjectSnapshot[],
        objectName: string,
        reason: string
    ): void;
}


export interface RuntimeTabularControllers {
    fallbackWorkspaceController: RuntimeWorkspaceController;
    listImportedTables(): WorkspaceObjectSnapshot[];
    listProviderWorkspaceObjects(): WorkspaceObjectSnapshot[];
    hasWorkspaceObject(objectName: string): boolean;
    readOperationController: RuntimeTabularReadOperationController;
    cellMutationExecutionController: RuntimeCellMutationExecutionController;
    columnMutationOperationController: RuntimeColumnMutationOperationController;
    rowMutationOperationController: RuntimeRowMutationOperationController;
    variableMetadataOperationController: RuntimeVariableMetadataOperationController;
    labelStateOperationController: RuntimeLabelStateOperationController;
    importOperationController: RuntimeImportOperationController;
}


export const createRuntimeTabularControllers = function(
    options: RuntimeTabularControllersOptions
): RuntimeTabularControllers {
    const state = options.fallbackState;
    const tabularCompositionController =
        createRuntimeTabularCompositionController({
            providerId: options.providerId,
            readOnlyAdapter: options.readOnlyAdapter,
            fallbackState: state,
            hasCapability: options.hasRuntimeCapability
        });
    const createColumnsForRows = tabularCompositionController.createColumns;
    const readProviderTabularRows = tabularCompositionController.readProviderRows;
    const materializeRows = tabularCompositionController.materializeRows;
    const listImportedTables = tabularCompositionController.listImportedTables;
    const listProviderWorkspaceObjects =
        tabularCompositionController.listProviderObjects;
    const hasWorkspaceObject = tabularCompositionController.hasObject;

    let variableMetadataOperationController:
        RuntimeVariableMetadataOperationController;

    const fallbackVariableMetadataController =
        createRuntimeFallbackVariableMetadataController(state);
    const variableMetadataExecutionController =
        createRuntimeVariableMetadataExecutionController({
            providerTabularController: options.providerTabularController,
            readOnlyAdapter: options.readOnlyAdapter,
            fallbackVariableMetadataController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            materializeRows,
            getRows: function(objectName) {
                return state.rows[objectName];
            },
            createColumns: createColumnsForRows,
            readVariableMetadata: function(objectName) {
                return variableMetadataOperationController.readVariableMetadata(
                    objectName
                );
            },
            recordRuntimeEvent: options.recordRuntimeEvent
        });
    variableMetadataOperationController =
        createRuntimeVariableMetadataOperationController({
            variableMetadataExecutionController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            hasRuntimeCapability: options.hasRuntimeCapability,
            readVariableMetadataValue: fallbackVariableMetadataController.readValue
        });

    const fallbackColumnMutationController =
        createRuntimeFallbackColumnMutationController({
            state,
            recordRuntimeEvent: options.recordRuntimeEvent
        });
    const columnMutationExecutionController =
        createRuntimeColumnMutationExecutionController({
            providerTabularController: options.providerTabularController,
            fallbackColumnMutationController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            materializeRows
        });
    const columnMutationOperationController =
        createRuntimeColumnMutationOperationController({
            columnMutationExecutionController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            hasRuntimeCapability: options.hasRuntimeCapability
        });

    const fallbackRowMutationController =
        createRuntimeFallbackRowMutationController({
            state,
            recordRuntimeEvent: options.recordRuntimeEvent
        });
    const rowMutationExecutionController =
        createRuntimeRowMutationExecutionController({
            providerTabularController: options.providerTabularController,
            fallbackRowMutationController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            materializeRows
        });
    const rowMutationOperationController =
        createRuntimeRowMutationOperationController({
            rowMutationExecutionController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            hasRuntimeCapability: options.hasRuntimeCapability
        });

    const fallbackCellMutationController =
        createRuntimeFallbackCellMutationController({
            state,
            recordRuntimeEvent: options.recordRuntimeEvent
        });
    const cellMutationExecutionController =
        createRuntimeCellMutationExecutionController({
            providerTabularController: options.providerTabularController,
            fallbackCellMutationController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            materializeRows
        });

    const fallbackLabelStateController =
        createRuntimeFallbackLabelStateController({
            state,
            recordRuntimeEvent: options.recordRuntimeEvent
        });
    const labelStateExecutionController =
        createRuntimeLabelStateExecutionController({
            providerId: options.providerManifestId,
            providerTabularController: options.providerTabularController,
            readOnlyAdapter: options.readOnlyAdapter,
            fallbackLabelStateController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            materializeRows,
            recordRuntimeEvent: options.recordRuntimeEvent
        });
    const labelStateOperationController =
        createRuntimeLabelStateOperationController({
            labelStateExecutionController,
            getSnapshot: options.getSnapshot,
            getActiveObjectName: options.getActiveObjectName,
            hasRuntimeCapability: options.hasRuntimeCapability,
            readVariableMetadata: function(objectName) {
                return variableMetadataOperationController.readVariableMetadata(
                    objectName
                );
            }
        });

    const fallbackImportController = createRuntimeFallbackImportController({
        state,
        hasWorkspaceObject
    });
    const importExecutionController = createRuntimeImportExecutionController({
        providerImportController: options.providerImportController,
        fallbackImportController,
        listProviderObjects: listProviderWorkspaceObjects,
        listImportedTables,
        getSnapshot: options.getSnapshot,
        recordRuntimeEvent: options.recordRuntimeEvent
    });
    const importOperationController = createRuntimeImportOperationController({
        providerImportController: options.providerImportController,
        importExecutionController,
        getSnapshot: options.getSnapshot,
        rememberWorkspaceObjects: options.rememberWorkspaceObjects,
        selectKnown: options.selectKnown,
        selectFromWorkspace: options.selectFromWorkspace
    });

    const fallbackWorkspaceController = createRuntimeFallbackWorkspaceController({
        listObjects: function() {
            return listProviderWorkspaceObjects().concat(listImportedTables());
        },
        hasRows: state.has,
        readRows: function(objectName) {
            return state.rows[objectName] || readProviderTabularRows(objectName);
        },
        readRowNames: function(objectName) {
            return state.rowNames[objectName] || [];
        },
        createColumns: createColumnsForRows
    });
    const tabularReadController = createRuntimeTabularReadController({
        workspaceController: options.providerWorkspaceController,
        readOnlyAdapter: options.readOnlyAdapter,
        fallbackWorkspaceController,
        hasFallbackRows: state.has,
        getSnapshot: options.getSnapshot
    });
    const readOperationController = createRuntimeTabularReadOperationController({
        tabularReadController,
        getSnapshot: options.getSnapshot,
        getActiveObjectName: options.getActiveObjectName
    });

    return {
        fallbackWorkspaceController,
        listImportedTables,
        listProviderWorkspaceObjects,
        hasWorkspaceObject,
        readOperationController,
        cellMutationExecutionController,
        columnMutationOperationController,
        rowMutationOperationController,
        variableMetadataOperationController,
        labelStateOperationController,
        importOperationController
    };
};
