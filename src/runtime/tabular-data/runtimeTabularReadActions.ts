import type {
    RuntimeSessionManager,
    TabularPreviewRequest,
    TabularPreviewSnapshot
} from "../provider-contract/runtimeProvider";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import { createTabularPreview, createTabularSchema } from "./tabularProtocol";


export const createRuntimeTabularReadActions = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "readTabularSchema" | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    readPreview(request: Partial<TabularPreviewRequest>): Promise<TabularPreviewSnapshot>;
    previewRead?(preview: TabularPreviewSnapshot): void;
}) {
    const captureReadOwner = function() {
        return captureWorkspaceRuntimeScope(() => {
            return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
        });
    };
    return {
        async readTabularSchema(value: unknown) {
            const isCurrent = captureReadOwner();
            const schema = await options.runtimeSessionManager.readTabularSchema(String(value || "").trim());

            if (!isCurrent()) {
                return createTabularSchema({
                    status: "unavailable", providerId: schema.providerId,
                    objectName: schema.objectName,
                    message: "Runtime session changed while reading the schema. Retry the read."
                });
            }

            return schema;
        },

        async readTabularPreview(value: unknown) {
            const isCurrent = captureReadOwner();
            const request = typeof value === "string"
                ? { objectName: value }
                : value && typeof value === "object" && !Array.isArray(value)
                    ? value as Partial<TabularPreviewRequest>
                    : {};
            const preview = await options.readPreview(request);

            if (!isCurrent()) {
                return createTabularPreview({
                    status: "unavailable", providerId: preview.providerId,
                    objectName: preview.objectName,
                    message: "Runtime session changed while reading the preview. Retry the read."
                });
            }

            options.previewRead?.(preview);
            return preview;
        }
    };
};
