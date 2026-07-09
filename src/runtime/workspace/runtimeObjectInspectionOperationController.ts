import type {
    ObjectInspectionResult,
    RuntimeSessionSnapshot,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createObjectInspectionResult
} from "./workspaceProtocol";
import type {
    RuntimeObjectInspectionController
} from "./runtimeObjectInspectionController";


export interface RuntimeObjectInspectionOperationControllerOptions {
    objectInspectionController: RuntimeObjectInspectionController;
    getSnapshot(): RuntimeSessionSnapshot;
    listWorkspaceObjects(): Promise<WorkspaceSnapshot>;
}


export interface RuntimeObjectInspectionOperationController {
    inspectObject(objectName: string): Promise<ObjectInspectionResult>;
}


export const createRuntimeObjectInspectionOperationController = function(
    options: RuntimeObjectInspectionOperationControllerOptions
): RuntimeObjectInspectionOperationController {
    return {
        inspectObject: async function(objectName): Promise<ObjectInspectionResult> {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createObjectInspectionResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName,
                    message: "Runtime session is not ready."
                });
            }

            const workspace = await options.listWorkspaceObjects();
            const object = workspace.objects.find((candidate) => {
                return candidate.name === objectName;
            });

            if (!object) {
                return createObjectInspectionResult({
                    status: "not-found",
                    providerId: snapshot.providerId,
                    objectName,
                    message: "Workspace object was not found."
                });
            }

            return options.objectInspectionController.inspect(object);
        }
    };
};
