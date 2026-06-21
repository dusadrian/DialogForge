import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createRuntimeActiveDatasetController
} from "../session/runtimeActiveDatasetController";
import type {
    RuntimeActiveDatasetController
} from "../session/runtimeActiveDatasetController";
import type {
    RuntimeFallbackTabularState
} from "../session/runtimeFallbackTabularState";
import type {
    RuntimeWorkspaceState
} from "../session/runtimeWorkspaceState";
import {
    createRuntimeObjectInspectionController
} from "./runtimeObjectInspectionController";
import {
    createRuntimeObjectInspectionOperationController
} from "./runtimeObjectInspectionOperationController";
import type {
    RuntimeObjectInspectionOperationController
} from "./runtimeObjectInspectionOperationController";
import {
    createRuntimeWorkspaceListController
} from "./runtimeWorkspaceListController";
import {
    createRuntimeWorkspaceMutationController
} from "./runtimeWorkspaceMutationController";
import {
    createRuntimeWorkspaceOperationController
} from "./runtimeWorkspaceOperationController";
import type {
    RuntimeWorkspaceOperationController
} from "./runtimeWorkspaceOperationController";


export interface RuntimeWorkspaceControllersOptions {
    workspaceState: RuntimeWorkspaceState;
    providerWorkspaceController?: RuntimeWorkspaceController;
    fallbackWorkspaceController: RuntimeWorkspaceController;
    fallbackTabularState: RuntimeFallbackTabularState;
    listImportedTables(): WorkspaceObjectSnapshot[];
    listProviderWorkspaceObjects(): WorkspaceObjectSnapshot[];
    getSnapshot(): RuntimeSessionSnapshot;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeWorkspaceControllers {
    activeDatasetController: RuntimeActiveDatasetController;
    objectInspectionOperationController: RuntimeObjectInspectionOperationController;
    workspaceOperationController: RuntimeWorkspaceOperationController;
}


export const createRuntimeWorkspaceControllers = function(
    options: RuntimeWorkspaceControllersOptions
): RuntimeWorkspaceControllers {
    const activeDatasetController = createRuntimeActiveDatasetController({
        workspaceState: options.workspaceState,
        getSnapshot: options.getSnapshot,
        recordRuntimeEvent: options.recordRuntimeEvent
    });
    const objectInspectionController = createRuntimeObjectInspectionController({
        providerWorkspaceController: options.providerWorkspaceController,
        fallbackWorkspaceController: options.fallbackWorkspaceController,
        getSnapshot: options.getSnapshot
    });
    let workspaceOperationController: RuntimeWorkspaceOperationController;
    const objectInspectionOperationController =
        createRuntimeObjectInspectionOperationController({
            objectInspectionController,
            getSnapshot: options.getSnapshot,
            listWorkspaceObjects: function() {
                return workspaceOperationController.listWorkspaceObjects();
            }
        });
    const workspaceListController = createRuntimeWorkspaceListController({
        providerWorkspaceController: options.providerWorkspaceController,
        fallbackWorkspaceController: options.fallbackWorkspaceController,
        listImportedTables: options.listImportedTables,
        getSnapshot: options.getSnapshot
    });
    const workspaceMutationController = createRuntimeWorkspaceMutationController({
        providerWorkspaceController: options.providerWorkspaceController,
        fallbackState: options.fallbackTabularState,
        listProviderObjects: options.listProviderWorkspaceObjects,
        listImportedTables: options.listImportedTables,
        getSnapshot: options.getSnapshot
    });
    workspaceOperationController = createRuntimeWorkspaceOperationController({
        providerWorkspaceController: options.providerWorkspaceController,
        workspaceListController,
        workspaceMutationController,
        activeDatasetController,
        getSnapshot: options.getSnapshot,
        recordRuntimeEvent: options.recordRuntimeEvent
    });

    return {
        activeDatasetController,
        objectInspectionOperationController,
        workspaceOperationController
    };
};
