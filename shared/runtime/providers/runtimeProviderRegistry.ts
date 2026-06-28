import type {
    RuntimeProvider,
    RuntimeProviderFactory,
    RuntimeProviderOptions,
    RuntimeProviderRegistry
} from "../provider-contract/runtimeProvider";
import { createRuntimeProvider as createRRuntimeProvider } from "./r/runtimeProvider";
import { createRuntimeProvider as createPythonRuntimeProvider } from "./python/runtimeProvider";
import { createRuntimeProvider as createServerRRuntimeProvider } from "./server-r/runtimeProvider";
import { createRuntimeProvider as createWebRRuntimeProvider } from "./webr/runtimeProvider";


export const runtimeProviderFactories: RuntimeProviderRegistry = {
    r: createRRuntimeProvider,
    python: createPythonRuntimeProvider,
    "server-r": createServerRRuntimeProvider,
    webr: createWebRRuntimeProvider
};


export const listRuntimeProviderIds = function(): string[] {
    return Object.keys(runtimeProviderFactories);
};


export const assertRuntimeProviderIsRegistered = function(runtimeId: string): void {
    const runtimeProviderId = String(runtimeId || "").trim();

    if (!runtimeProviderId) {
        throw new Error("Runtime provider is required.");
    }

    if (!Object.hasOwn(runtimeProviderFactories, runtimeProviderId)) {
        throw new Error(
            `Runtime provider "${runtimeProviderId}" is not registered. ` +
            `Available runtime providers: ${listRuntimeProviderIds().join(", ")}`
        );
    }
};


const createMissingRuntimeProvider = function(runtimeId: string): RuntimeProvider {
    const manifest = {
        id: runtimeId,
        label: runtimeId,
        language: "unknown",
        status: "missing",
        capabilities: []
    };

    return {
        manifest,
        createSession: function() {
            return {
                providerId: runtimeId,
                status: "unavailable",
                connection: "missing",
                message: "Runtime provider is not registered."
            };
        }
    };
};


export const getRuntimeProvider = function(runtimeId: string, options: RuntimeProviderOptions = {}): RuntimeProvider {
    const createProvider: RuntimeProviderFactory | undefined = runtimeProviderFactories[runtimeId];

    if (createProvider) {
        return createProvider(options);
    }

    return createMissingRuntimeProvider(runtimeId);
};
