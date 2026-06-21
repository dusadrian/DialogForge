import type {
    RuntimeSessionManager,
    WorkspaceObjectSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type { DialogDatasetDescriptor } from "./dialogBindings";


const isTabularObject = function(object: WorkspaceObjectSnapshot): boolean {
    return object.capabilities.includes("tabular.schema") ||
        object.capabilities.includes("tabular.read");
};


export const createRuntimeDialogDatasetResolver = function(
    runtimeSessionManager: RuntimeSessionManager
) {
    return async function(): Promise<DialogDatasetDescriptor[]> {
        const workspace = await runtimeSessionManager.listWorkspaceObjects();

        if (workspace.status !== "ready") {
            return [];
        }

        const descriptors: DialogDatasetDescriptor[] = [];

        for (const object of workspace.objects) {
            if (!isTabularObject(object)) {
                continue;
            }

            const metadata = await runtimeSessionManager.readVariableMetadata(object.name);
            if (metadata.status === "ready" && metadata.variables.length > 0) {
                descriptors.push({
                    name: object.name,
                    columns: metadata.variables.map((variable) => {
                        return variable.name;
                    })
                });
                continue;
            }

            const preview = await runtimeSessionManager.readTabularPreview(object.name);
            descriptors.push({
                name: object.name,
                columns: preview.status === "ready"
                    ? preview.columns.map((column) => {
                        return column.name;
                    })
                    : []
            });
        }

        return descriptors;
    };
};
