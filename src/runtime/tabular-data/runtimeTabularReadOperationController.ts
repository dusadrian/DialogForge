import type {
    RuntimeSessionSnapshot,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    TabularSchemaSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createTabularPreview,
    createTabularPreviewRequest,
    createTabularSchema
} from "./tabularProtocol";
import type {
    RuntimeTabularReadController
} from "./runtimeTabularReadController";


export interface RuntimeTabularReadOperationControllerOptions {
    tabularReadController: RuntimeTabularReadController;
    getSnapshot(): RuntimeSessionSnapshot;
    getWorkspaceReadEpoch?(): number;
    isWorkspaceReadAvailable?(): boolean;
    getActiveObjectName(): string;
}


export interface RuntimeTabularReadOperationController {
    readSchema(objectName: string): Promise<TabularSchemaSnapshot>;
    readPreview(input: string | Partial<TabularPreviewRequest>): Promise<TabularPreviewSnapshot>;
}


export const createRuntimeTabularReadOperationController = function(
    options: RuntimeTabularReadOperationControllerOptions
): RuntimeTabularReadOperationController {
    return {
        readSchema: async function(objectName): Promise<TabularSchemaSnapshot> {
            const snapshot = options.getSnapshot();
            const targetName = String(
                objectName || options.getActiveObjectName() || ""
            ).trim();

            if (snapshot.status !== "ready") {
                return createTabularSchema({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Runtime session is not ready."
                });
            }

            if (!targetName) {
                return createTabularSchema({
                    status: "no-active-dataset",
                    providerId: snapshot.providerId,
                    objectName: "",
                    message: "No active dataset is selected."
                });
            }

            const epoch = options.getWorkspaceReadEpoch?.();
            if (options.isWorkspaceReadAvailable?.() === false) {
                return createTabularSchema({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace synchronization is pending or stale."
                });
            }
            const schema = await options.tabularReadController.readSchema(targetName);

            if (
                epoch !== options.getWorkspaceReadEpoch?.()
                || options.getSnapshot().status !== "ready"
                || options.isWorkspaceReadAvailable?.() === false
            ) {
                return createTabularSchema({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace changed while reading the schema. Retry the read."
                });
            }

            return schema;
        },
        readPreview: async function(input): Promise<TabularPreviewSnapshot> {
            const snapshot = options.getSnapshot();
            const request = createTabularPreviewRequest(input);
            const targetName = request.objectName || options.getActiveObjectName();

            if (snapshot.status !== "ready") {
                return createTabularPreview({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    objectName: targetName,
                    message: "Runtime session is not ready."
                });
            }

            if (!targetName) {
                return createTabularPreview({
                    status: "no-active-dataset",
                    providerId: snapshot.providerId,
                    objectName: "",
                    message: "No active dataset is selected."
                });
            }

            const epoch = options.getWorkspaceReadEpoch?.();
            if (options.isWorkspaceReadAvailable?.() === false) {
                return createTabularPreview({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace synchronization is pending or stale."
                });
            }
            const preview = await options.tabularReadController.readPreview(targetName, request);

            if (
                epoch !== options.getWorkspaceReadEpoch?.()
                || options.getSnapshot().status !== "ready"
                || options.isWorkspaceReadAvailable?.() === false
            ) {
                return createTabularPreview({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: targetName, message: "Workspace changed while reading the preview. Retry the read."
                });
            }

            return preview;
        }
    };
};
