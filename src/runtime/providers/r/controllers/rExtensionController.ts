import { createRuntimeExtensionMethodResult } from "../../../extensions/runtimeExtensionProtocol";
import { createRuntimeInterruptResult } from "../../../extensions/runtimeInterruptResult";
import type {
    RuntimeExtensionController
} from "../../../provider-contract/runtimeProvider";
import {
    createRWorkspaceUpdate,
    hasValidRWorkspaceReconciliationPayload
} from "./rWorkspaceUpdate";
import type {
    RRuntimeControlClient
} from "../protocol/runtimeControlClient";


export interface RExtensionControllerOptions {
    getClient(): RRuntimeControlClient | null;
    createRequestId(prefix: string): string;
    interrupt(): boolean | null;
    interruptUnavailableMessage?: string;
    interruptAcceptedMessage?: string;
    interruptFailedMessage?: string;
}


export const createRExtensionController = function(
    options: RExtensionControllerOptions
): RuntimeExtensionController {
    return {
        executeRuntimeMethod: async function(request, snapshot) {
            if (request.method === "runtime.interrupt") {
                const signalled = options.interrupt();

                return createRuntimeInterruptResult(
                    snapshot,
                    signalled,
                    signalled === null
                        ? options.interruptUnavailableMessage || "R runtime process is not running."
                        : signalled
                        ? options.interruptAcceptedMessage || "R runtime process was sent SIGINT."
                        : options.interruptFailedMessage || "R runtime process did not accept SIGINT."
                );
            }

            const client = options.getClient();

            if (!client) {
                return createRuntimeExtensionMethodResult({
                    status: "unavailable",
                    providerId: snapshot.providerId,
                    method: request.method,
                    message: "R runtime-control session is not attached."
                });
            }

            const result = await client.execute({
                id: options.createRequestId("runtime-extension"),
                method: request.method,
                params: Object.assign({}, request.params, {
                    timeoutMs: Number(request.params.timeoutMs || 10000)
                })
            });
            const value = result.ok ? result.result : null;
            const record = value
                && typeof value === "object"
                && !Array.isArray(value)
                ? value as Record<string, unknown>
                : {};
            const hasWorkspaceUpdate = Object.hasOwn(record, "workspaceUpdate")
                || Object.hasOwn(record, "workspace_update");
            const rawWorkspaceUpdate = Object.hasOwn(record, "workspaceUpdate")
                ? record.workspaceUpdate : record.workspace_update;
            const invalidWorkspaceUpdate = hasWorkspaceUpdate
                && !hasValidRWorkspaceReconciliationPayload(rawWorkspaceUpdate);

            return createRuntimeExtensionMethodResult({
                status: result.ok ? "ready" : "failed",
                providerId: snapshot.providerId,
                method: request.method,
                value,
                workspaceUpdate: hasWorkspaceUpdate && !invalidWorkspaceUpdate
                    ? createRWorkspaceUpdate(rawWorkspaceUpdate)
                    : undefined,
                workspaceReconciliation: invalidWorkspaceUpdate ? "failed" : undefined,
                message: result.ok
                    ? invalidWorkspaceUpdate
                    ? "R runtime extension completed, but its workspace update was rejected. Refresh the workspace before using its displayed values."
                    : "R runtime-control resolved the runtime extension method."
                    : String(
                        result.error
                        || "R runtime extension method failed."
                    )
            });
        }
    };
};
