import type {
    RuntimeTransportAuthenticationSnapshot,
    RuntimeTransportAuthPolicy,
    RuntimeTransportCredential
} from "../../transport/runtimeTransport";


export interface ServerRConnectionConfigInput {
    endpoint?: string;
    authPolicy?: RuntimeTransportAuthPolicy;
    credential?: RuntimeTransportCredential;
}


export interface ServerRConnectionConfig {
    endpoint: string;
    authentication: RuntimeTransportAuthenticationSnapshot;
    credential?: RuntimeTransportCredential;
}


const defaultAuthPolicy: RuntimeTransportAuthPolicy = {
    required: false,
    kind: "none",
    source: "host"
};


const credentialMatchesPolicy = function(
    policy: RuntimeTransportAuthPolicy,
    credential: RuntimeTransportCredential | undefined
): boolean {
    if (!credential) {
        return false;
    }

    if (policy.kind === "none") {
        return true;
    }

    if (credential.kind !== policy.kind) {
        return false;
    }

    if (policy.kind === "bearer") {
        return Boolean(String(credential.token || "").trim());
    }

    return true;
};


export const resolveServerRConnectionConfig = function(
    input: ServerRConnectionConfigInput
): ServerRConnectionConfig {
    const authPolicy = input.authPolicy || defaultAuthPolicy;
    const credentialProvided = credentialMatchesPolicy(
        authPolicy,
        input.credential
    );

    return {
        endpoint: String(input.endpoint || "").trim(),
        authentication: {
            required: authPolicy.required,
            kind: authPolicy.kind,
            source: authPolicy.source,
            credentialProvided
        },
        credential: credentialProvided ? input.credential : undefined
    };
};
