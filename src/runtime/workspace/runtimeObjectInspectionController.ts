import type {
    ObjectInspectionResult,
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeObjectInspectionControllerOptions {
    providerWorkspaceController?: RuntimeWorkspaceController;
    fallbackWorkspaceController: RuntimeWorkspaceController;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeObjectInspectionController {
    inspect(object: WorkspaceObjectSnapshot): Promise<ObjectInspectionResult>;
}


export const createRuntimeObjectInspectionController = function(
    options: RuntimeObjectInspectionControllerOptions
): RuntimeObjectInspectionController {
    return {
        inspect: async function(object) {
            const snapshot = options.getSnapshot();

            if (options.providerWorkspaceController?.inspectObject) {
                const inspection =
                    await options.providerWorkspaceController.inspectObject(
                        object.name,
                        snapshot
                    );

                if (inspection) {
                    return inspection;
                }
            }

            return (await options.fallbackWorkspaceController.inspectObject!(
                object.name,
                snapshot
            ))!;
        }
    };
};
