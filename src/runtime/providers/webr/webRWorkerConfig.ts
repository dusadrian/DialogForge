import type {
    RuntimeTransportAuthenticationSnapshot
} from "../../transport/runtimeTransport";


export interface WebRWorkerConfigInput {
    assetBaseUrl?: string;
}


export interface WebRWorkerConfig {
    assetBaseUrl: string;
    authentication: RuntimeTransportAuthenticationSnapshot;
}


const noAuthentication: RuntimeTransportAuthenticationSnapshot = {
    required: false,
    kind: "none",
    source: "host",
    credentialProvided: false
};


export const resolveWebRWorkerConfig = function(
    input: WebRWorkerConfigInput
): WebRWorkerConfig {
    return {
        assetBaseUrl: String(input.assetBaseUrl || "").trim(),
        authentication: noAuthentication
    };
};
