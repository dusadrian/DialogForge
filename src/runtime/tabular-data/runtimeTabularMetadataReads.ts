import type {
    RuntimeSessionManager,
    VariableMetadataSnapshot,
    ValueLabelSnapshot,
    DeclaredMissingSnapshot
} from "../provider-contract/runtimeProvider";
import { captureWorkspaceRuntimeScope } from "../workspace/workspaceSnapshotDelivery";
import {
    createVariableMetadataSnapshot,
    createValueLabelSnapshot,
    createDeclaredMissingSnapshot
} from "./tabularProtocol";


export const createRuntimeTabularMetadataReads = function(options: {
    runtimeSessionManager: Pick<RuntimeSessionManager,
        "readVariableMetadata" | "readValueLabels" | "readDeclaredMissing"
        | "getSnapshot" | "getWorkspaceSnapshot">;
    isCurrentRuntime?(): boolean;
    publishVariableMetadata?(snapshot: VariableMetadataSnapshot): void;
    publishValueLabels?(snapshot: ValueLabelSnapshot): void;
    publishDeclaredMissing?(snapshot: DeclaredMissingSnapshot): void;
}) {
    const captureReadOwner = function() {
        return captureWorkspaceRuntimeScope(() => {
            return options.isCurrentRuntime?.() === false ? null : options.runtimeSessionManager;
        });
    };
    return {
        async readVariableMetadata(value: unknown) {
            const isCurrent = captureReadOwner();
            const snapshot = await options.runtimeSessionManager.readVariableMetadata(
                String(value || "").trim()
            );

            if (!isCurrent()) {
                return createVariableMetadataSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: snapshot.objectName,
                    message: "Runtime session changed while reading metadata. Retry the read."
                });
            }

            options.publishVariableMetadata?.(snapshot);
            return snapshot;
        },

        async readValueLabels(value: unknown) {
            const isCurrent = captureReadOwner();
            const snapshot = await options.runtimeSessionManager.readValueLabels(
                String(value || "").trim()
            );

            if (!isCurrent()) {
                return createValueLabelSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: snapshot.objectName,
                    message: "Runtime session changed while reading value labels. Retry the read."
                });
            }

            options.publishValueLabels?.(snapshot);
            return snapshot;
        },

        async readDeclaredMissing(value: unknown) {
            const isCurrent = captureReadOwner();
            const snapshot = await options.runtimeSessionManager.readDeclaredMissing(
                String(value || "").trim()
            );

            if (!isCurrent()) {
                return createDeclaredMissingSnapshot({
                    status: "unavailable", providerId: snapshot.providerId,
                    objectName: snapshot.objectName,
                    message: "Runtime session changed while reading missing values. Retry the read."
                });
            }

            options.publishDeclaredMissing?.(snapshot);
            return snapshot;
        }
    };
};
