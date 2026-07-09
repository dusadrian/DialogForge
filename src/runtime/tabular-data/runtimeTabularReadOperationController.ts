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

            return options.tabularReadController.readSchema(targetName);
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

            return options.tabularReadController.readPreview(targetName, request);
        }
    };
};
