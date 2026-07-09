import type {
    ImportRequest,
    ImportResult,
    RuntimeImportController,
    RuntimeSessionSnapshot,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createImportResult
} from "./importProtocol";
import type {
    RuntimeImportExecutionController
} from "./runtimeImportExecutionController";


export interface RuntimeImportOperationControllerOptions {
    providerImportController?: RuntimeImportController;
    importExecutionController: RuntimeImportExecutionController;
    getSnapshot(): RuntimeSessionSnapshot;
    rememberWorkspaceObjects(objects: WorkspaceObjectSnapshot[]): WorkspaceObjectSnapshot[];
    selectKnown(objectName: string, reason: string): void;
    selectFromWorkspace(
        objects: WorkspaceObjectSnapshot[],
        objectName: string,
        reason: string
    ): void;
}


export interface RuntimeImportOperationController {
    importData(request: ImportRequest): Promise<ImportResult>;
}


export const createRuntimeImportOperationController = function(
    options: RuntimeImportOperationControllerOptions
): RuntimeImportOperationController {
    return {
        importData: async function(request): Promise<ImportResult> {
            const snapshot = options.getSnapshot();

            if (snapshot.status !== "ready") {
                return createImportResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    message: "Runtime session is not ready."
                });
            }

            if (!request.source) {
                return createImportResult({
                    status: "invalid",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    message: "Import source is required."
                });
            }

            if (
                options.providerImportController?.supportsFormat &&
                !options.providerImportController.supportsFormat(request.format)
            ) {
                return createImportResult({
                    status: "unsupported-format",
                    providerId: snapshot.providerId,
                    source: request.source,
                    format: request.format,
                    targetName: request.targetName,
                    overwrite: request.overwrite,
                    message: "Import format is not implemented yet."
                });
            }

            const targetName = request.targetName || "imported_data";
            const execution = await options.importExecutionController.execute(
                request,
                targetName
            );

            if (execution.selection === "known") {
                options.selectKnown(targetName, "import-data");
            }

            if (execution.workspaceObjects) {
                const objects = options.rememberWorkspaceObjects(
                    execution.workspaceObjects
                );
                options.selectFromWorkspace(
                    objects,
                    targetName,
                    "import-data"
                );
            }

            return execution.result;
        }
    };
};
