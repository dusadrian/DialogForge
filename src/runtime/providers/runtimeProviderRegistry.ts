import type {
    RuntimeProvider,
    RuntimeProviderFactory,
    RuntimeProviderOptions,
    RuntimeProviderRegistry
} from "../provider-contract/runtimeProvider";


export const runtimeProviderFactories: RuntimeProviderRegistry = {
    r: function(options: RuntimeProviderOptions = {}): RuntimeProvider {
        const {
            createRuntimeProvider
        } = require("./r/runtimeProvider") as { createRuntimeProvider: RuntimeProviderFactory };

        return createRuntimeProvider(options);
    },
    python: function(options: RuntimeProviderOptions = {}): RuntimeProvider {
        const {
            createRuntimeProvider
        } = require("./python/runtimeProvider") as { createRuntimeProvider: RuntimeProviderFactory };

        return createRuntimeProvider(options);
    },
    "server-r": function(options: RuntimeProviderOptions = {}): RuntimeProvider {
        const {
            createRuntimeProvider
        } = require("./server-r/runtimeProvider") as { createRuntimeProvider: RuntimeProviderFactory };

        return createRuntimeProvider(options);
    },
    webr: function(options: RuntimeProviderOptions = {}): RuntimeProvider {
        const {
            createRuntimeProvider
        } = require("./webr/runtimeProvider") as { createRuntimeProvider: RuntimeProviderFactory };

        return createRuntimeProvider(options);
    }
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
