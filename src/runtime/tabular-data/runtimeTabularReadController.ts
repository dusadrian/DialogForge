import type {
    RuntimeReadOnlyAdapter,
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    TabularSchemaSnapshot
} from "../provider-contract/runtimeProvider";
import {
    createTabularPreview,
    createTabularSchema
} from "./tabularProtocol";


export interface RuntimeTabularReadControllerOptions {
    workspaceController?: RuntimeWorkspaceController;
    readOnlyAdapter?: RuntimeReadOnlyAdapter;
    fallbackWorkspaceController: RuntimeWorkspaceController;
    hasFallbackRows(objectName: string): boolean;
    getSnapshot(): RuntimeSessionSnapshot;
}


export interface RuntimeTabularReadController {
    readSchema(objectName: string): Promise<TabularSchemaSnapshot>;
    readPreview(
        objectName: string,
        request: TabularPreviewRequest
    ): Promise<TabularPreviewSnapshot>;
}


export const createRuntimeTabularReadController = function(
    options: RuntimeTabularReadControllerOptions
): RuntimeTabularReadController {
    const readPreview = async function(
        objectName: string,
        request: TabularPreviewRequest
    ): Promise<TabularPreviewSnapshot> {
        const snapshot = options.getSnapshot();

        if (!options.hasFallbackRows(objectName)) {
            if (options.workspaceController) {
                const preview = await options.workspaceController.readTabularPreview(
                    objectName,
                    snapshot,
                    Object.assign({}, request, {
                        objectName
                    })
                );

                if (preview) {
                    return preview;
                }
            }

            if (options.readOnlyAdapter) {
                const preview = options.readOnlyAdapter.readTabularPreview(
                    snapshot.providerId,
                    objectName
                );

                if (preview) {
                    return preview;
                }
            }

            return createTabularPreview({
                status: "not-tabular",
                providerId: snapshot.providerId,
                objectName,
                message: "Object does not advertise tabular preview support."
            });
        }

        return (await options.fallbackWorkspaceController.readTabularPreview(
            objectName,
            snapshot,
            request
        ))!;
    };

    return {
        readSchema: async function(objectName): Promise<TabularSchemaSnapshot> {
            const snapshot = options.getSnapshot();

            if (options.workspaceController?.readTabularSchema) {
                const schema = await options.workspaceController.readTabularSchema(
                    objectName,
                    snapshot
                );

                if (schema) {
                    return schema;
                }
            }

            const preview = await readPreview(objectName, {
                objectName,
                rowStart: 1,
                rowCount: 1,
                columns: []
            });

            if (preview.status === "ready") {
                return createTabularSchema({
                    status: "ready",
                    providerId: preview.providerId,
                    objectName,
                    columns: preview.columns,
                    rowCount: Number(preview.totalRowCount || preview.rows.length || 0),
                    columnCount: Number(
                        preview.totalColumnCount || preview.columns.length || 0
                    ),
                    message: "Tabular schema was derived from the tabular preview."
                });
            }

            return createTabularSchema({
                status: "not-tabular",
                providerId: snapshot.providerId,
                objectName,
                message: "Object does not advertise tabular schema support."
            });
        },
        readPreview
    };
};
