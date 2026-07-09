import type {
    ImportRequest,
    ImportResult,
    RuntimeImportController,
    RuntimeSessionSnapshot,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";
import type {
    RuntimeFallbackImportController
} from "./runtimeFallbackImportController";


export interface RuntimeImportExecutionResult {
    result: ImportResult;
    workspaceObjects: WorkspaceObjectSnapshot[] | null;
    selection: "none" | "known" | "workspace";
}


export interface RuntimeImportExecutionControllerOptions {
    providerImportController?: RuntimeImportController;
    fallbackImportController: RuntimeFallbackImportController;
    listProviderObjects(): WorkspaceObjectSnapshot[];
    listImportedTables(): WorkspaceObjectSnapshot[];
    getSnapshot(): RuntimeSessionSnapshot;
    recordRuntimeEvent(
        type: string,
        objectName: string,
        detail: string,
        payload: Record<string, unknown>
    ): void;
}


export interface RuntimeImportExecutionController {
    execute(
        request: ImportRequest,
        targetName: string
    ): Promise<RuntimeImportExecutionResult>;
}


export const createRuntimeImportExecutionController = function(
    options: RuntimeImportExecutionControllerOptions
): RuntimeImportExecutionController {
    return {
        execute: async function(request, targetName) {
            const snapshot = options.getSnapshot();

            if (options.providerImportController) {
                const result = await options.providerImportController.importData(
                    Object.assign({}, request, {
                        targetName
                    }),
                    snapshot
                );

                return {
                    result,
                    workspaceObjects: null,
                    selection: result.status === "imported" ? "known" : "none"
                };
            }

            const result = options.fallbackImportController.importData(
                snapshot.providerId,
                request,
                targetName
            );

            if (result.status !== "imported" && result.status !== "planned") {
                return {
                    result,
                    workspaceObjects: null,
                    selection: "none"
                };
            }

            const workspaceObjects = options.listProviderObjects().concat(
                options.listImportedTables()
            );
            options.recordRuntimeEvent(
                "workspace.object.imported",
                targetName,
                "Placeholder imported table registered.",
                {
                    source: request.source,
                    format: request.format,
                    overwrite: request.overwrite
                }
            );

            return {
                result,
                workspaceObjects,
                selection: "workspace"
            };
        }
    };
};
