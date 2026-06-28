export type RuntimeHostKind = "electron" | "web";


export type RuntimeProviderSelectionSource =
    | "explicit"
    | "persisted"
    | "default"
    | "first-visible"
    | "first-supported";


export interface RuntimeProviderChoice {
    id: string;
    visible: boolean;
    reason: string;
}


export interface RuntimeProviderSelectionInput {
    hostKind?: RuntimeHostKind;
    explicitProviderId?: string;
    persistedProviderId?: string;
    productRuntimeProviders?: string[];
    defaultRuntimeProvider?: string;
    registeredProviderIds: string[];
}


export interface RuntimeProviderSelection {
    selectedProviderId: string;
    source: RuntimeProviderSelectionSource;
    supportedProviderIds: string[];
    visibleProviderIds: string[];
    hiddenProviderIds: string[];
    choices: RuntimeProviderChoice[];
}


const webRuntimeProviderIds = new Set([
    "server-r",
    "webr"
]);


const normalizeProviderId = function(value: unknown): string {
    return String(value || "").trim();
};


const normalizeProviderList = function(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value.map(normalizeProviderId).filter(Boolean)
    ));
};


const readSupportedProviderIds = function(
    productRuntimeProviders: unknown,
    defaultRuntimeProvider: unknown
): string[] {
    const providers = normalizeProviderList(productRuntimeProviders);
    const defaultProvider = normalizeProviderId(defaultRuntimeProvider) || "r";

    if (providers.length > 0) {
        return providers;
    }

    return [defaultProvider];
};


const assertRegisteredProvider = function(
    providerId: string,
    registeredProviderIds: Set<string>
): void {
    if (!registeredProviderIds.has(providerId)) {
        throw new Error(
            `Runtime provider "${providerId}" is not registered.`
        );
    }
};


const assertSupportedProvider = function(
    providerId: string,
    supportedProviderIds: string[]
): void {
    if (!supportedProviderIds.includes(providerId)) {
        throw new Error(
            `Runtime provider "${providerId}" is not supported by this product. ` +
            `Supported providers: ${supportedProviderIds.join(", ")}`
        );
    }
};


const providerIsVisibleForHost = function(
    providerId: string,
    hostKind: RuntimeHostKind,
    supportedProviderIds: string[]
): boolean {
    if (hostKind === "electron") {
        return !webRuntimeProviderIds.has(providerId);
    }

    if (
        hostKind === "web"
        && providerId === "r"
        && supportedProviderIds.some((candidate) => {
            return webRuntimeProviderIds.has(candidate);
        })
    ) {
        return false;
    }

    return true;
};


const createProviderChoice = function(
    providerId: string,
    hostKind: RuntimeHostKind,
    supportedProviderIds: string[]
): RuntimeProviderChoice {
    const visible = providerIsVisibleForHost(
        providerId,
        hostKind,
        supportedProviderIds
    );

    if (visible) {
        return {
            id: providerId,
            visible: true,
            reason: "Runtime provider is available for this host."
        };
    }

    if (hostKind === "electron" && webRuntimeProviderIds.has(providerId)) {
        return {
            id: providerId,
            visible: false,
            reason: "Runtime provider is reserved for web deployments."
        };
    }

    return {
        id: providerId,
        visible: false,
        reason: "Runtime provider is hidden by the current host policy."
    };
};


export const selectRuntimeProvider = function(
    input: RuntimeProviderSelectionInput
): RuntimeProviderSelection {
    const hostKind = input.hostKind || "electron";
    const registeredProviderIds = new Set(normalizeProviderList(input.registeredProviderIds));
    const supportedProviderIds = readSupportedProviderIds(
        input.productRuntimeProviders,
        input.defaultRuntimeProvider
    );
    const defaultProviderId = normalizeProviderId(input.defaultRuntimeProvider)
        || supportedProviderIds[0]
        || "r";
    const explicitProviderId = normalizeProviderId(input.explicitProviderId);
    const persistedProviderId = normalizeProviderId(input.persistedProviderId);

    supportedProviderIds.forEach((providerId) => {
        assertRegisteredProvider(providerId, registeredProviderIds);
    });
    assertRegisteredProvider(defaultProviderId, registeredProviderIds);
    assertSupportedProvider(defaultProviderId, supportedProviderIds);

    const choices = supportedProviderIds.map((providerId) => {
        return createProviderChoice(providerId, hostKind, supportedProviderIds);
    });
    const visibleProviderIds = choices.filter((choice) => {
        return choice.visible;
    }).map((choice) => {
        return choice.id;
    });
    const hiddenProviderIds = choices.filter((choice) => {
        return !choice.visible;
    }).map((choice) => {
        return choice.id;
    });

    if (explicitProviderId) {
        assertRegisteredProvider(explicitProviderId, registeredProviderIds);
        assertSupportedProvider(explicitProviderId, supportedProviderIds);

        return {
            selectedProviderId: explicitProviderId,
            source: "explicit",
            supportedProviderIds,
            visibleProviderIds,
            hiddenProviderIds,
            choices
        };
    }

    if (persistedProviderId && visibleProviderIds.includes(persistedProviderId)) {
        return {
            selectedProviderId: persistedProviderId,
            source: "persisted",
            supportedProviderIds,
            visibleProviderIds,
            hiddenProviderIds,
            choices
        };
    }

    if (visibleProviderIds.includes(defaultProviderId)) {
        return {
            selectedProviderId: defaultProviderId,
            source: "default",
            supportedProviderIds,
            visibleProviderIds,
            hiddenProviderIds,
            choices
        };
    }

    if (visibleProviderIds.length > 0) {
        return {
            selectedProviderId: visibleProviderIds[0],
            source: "first-visible",
            supportedProviderIds,
            visibleProviderIds,
            hiddenProviderIds,
            choices
        };
    }

    return {
        selectedProviderId: supportedProviderIds[0],
        source: "first-supported",
        supportedProviderIds,
        visibleProviderIds,
        hiddenProviderIds,
        choices
    };
};
