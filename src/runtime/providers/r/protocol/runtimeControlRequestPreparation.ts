import type {
    RRuntimeControlRequest,
    RRuntimeControlResponse
} from "./runtimeControlClient";
import type { createRuntimeControlDiagnostics } from "./runtimeControlDiagnostics";
import type { createRuntimeControlRequestAdmission } from "./runtimeControlRequestAdmission";
import {
    encodeRuntimeControlRequest,
    type createRuntimeControlRequestSizeLimit
} from "./runtimeControlRequestEncoding";


interface RuntimeControlRequestPreparationBindings {
    admission: ReturnType<typeof createRuntimeControlRequestAdmission>;
    diagnostics: Pick<ReturnType<typeof createRuntimeControlDiagnostics>, "prepare">;
    sizeLimit: ReturnType<typeof createRuntimeControlRequestSizeLimit>;
    connectionToken?: string;
    decorateRequest?(request: RRuntimeControlRequest): RRuntimeControlRequest;
}

type PreparedRuntimeControlRequest = {
    accepted: true;
    request: RRuntimeControlRequest;
    encodedRequest: string;
} | {
    accepted: false;
    response: RRuntimeControlResponse;
};


export const createRuntimeControlRequestPreparation = function(
    bindings: RuntimeControlRequestPreparationBindings
) {
    let workspaceEpoch = 0;

    const rejectRequest = function(
        request: RRuntimeControlRequest,
        error: string
    ): PreparedRuntimeControlRequest {
        return {
            accepted: false,
            response: {
                id: request.id,
                method: request.method,
                ok: false,
                error,
                requestRejected: true
            }
        };
    };

    return {
        getWorkspaceEpoch: () => workspaceEpoch,
        retireWorkspaceEpoch: function(): void {
            workspaceEpoch += 1;
        },
        prepare: function(request: RRuntimeControlRequest): PreparedRuntimeControlRequest {
            const admissionError = bindings.admission.admit(request);
            if (admissionError) {
                return rejectRequest(request, admissionError);
            }

            let prepared: RRuntimeControlRequest;
            let encodedRequest: string;
            try {
                const captured = { ...request, params: { ...request.params } };
                prepared = bindings.diagnostics.prepare(
                    bindings.decorateRequest?.(captured) || captured
                );
                encodedRequest = encodeRuntimeControlRequest(
                    prepared,
                    bindings.connectionToken
                );
                bindings.sizeLimit.check(encodedRequest);
            }
            catch (error) {
                bindings.admission.release(request.id);
                const message = error instanceof Error ? error.message : "";
                return rejectRequest(request,
                    message === "runtime-session-request-too-large"
                        || message === "runtime-session-request-sequence-exhausted"
                        ? message : "runtime-session-request-encoding-failed"
                );
            }

            if (
                prepared.method !== "workspace.update"
                && prepared.method !== "workspace.snapshot"
            ) {
                workspaceEpoch += 1;
            }
            return { accepted: true, request: prepared, encodedRequest };
        }
    };
};
