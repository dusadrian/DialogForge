import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import type {
    RuntimeSessionManager,
    TranscriptEvent
} from "../../runtime/provider-contract/runtimeProvider";
import {
    getRuntimeProvider
} from "../../runtime/providers/runtimeProviderRegistry";
import {
    createRuntimeSessionManager
} from "../../runtime/session/runtimeSessionManager";
import {
    createDialogBindingState,
    getFilterState
} from "../../dialog-runtime/custom-js/dialogBindings";
import {
    createRuntimeDialogDatasetResolver
} from "../../dialog-runtime/custom-js/runtimeDatasetResolver";
import {
    createDialogExternalCallHost
} from "../../dialog-runtime/custom-js/externalCallHost";
import {
    createCompositeDialogExternalCallHost
} from "../../dialog-runtime/custom-js/compositeExternalCallHost";
import {
    getProductContribution
} from "../../base-app/bootstrap/productContributionRegistry";


export interface RuntimeSessionCompositionOptions {
    location: ResolvedProductLocation;
    composition: ApplicationComposition;
    runtimeId: string;
    productId: string;
    forwardTranscriptEvents(events: TranscriptEvent[]): void;
    handleUnexpectedExit(details: {
        code: number | null;
        signal: NodeJS.Signals | null;
        output: string;
    }): void;
}


export const createRuntimeSessionComposition = function(
    options: RuntimeSessionCompositionOptions
) {
    let runtimeSessionManager: ReturnType<typeof createRuntimeSessionManager>;
    const dialogBindingState = createDialogBindingState();
    const resolveDialogDatasets = function() {
        return createRuntimeDialogDatasetResolver(runtimeSessionManager)();
    };
    const productContribution = getProductContribution(options.location);
    const sharedDialogExternalCallHost = createDialogExternalCallHost({
        resolveDatasets: resolveDialogDatasets,
        state: dialogBindingState
    });
    const productContext = {
        executeRuntimeMethod: function(request: Parameters<RuntimeSessionManager["executeRuntimeMethod"]>[0]) {
            return runtimeSessionManager.executeRuntimeMethod(request);
        },
        callSharedDialogExternal: async function(name: string, parameters: Record<string, unknown> = {}) {
            const result = await sharedDialogExternalCallHost.call(name, parameters);

            return result.status === "ready" ? result.value : null;
        }
    };
    const dialogExternalCallHost = createCompositeDialogExternalCallHost({
        shared: sharedDialogExternalCallHost,
        products: productContribution.createDialogExternalCallHosts({
            executeRuntimeMethod: function(request) {
                return runtimeSessionManager.executeRuntimeMethod(request);
            },
            callSharedDialogExternal: productContext.callSharedDialogExternal
        })
    });

    runtimeSessionManager = createRuntimeSessionManager(
        getRuntimeProvider(options.runtimeId, {
            rootDir: options.composition.rootDir,
            productId: options.productId,
            processLifecycle:
                options.composition.productSettings.runtimeStartup
                    ?.processLifecycle === true,
            onTranscriptEvents: options.forwardTranscriptEvents,
            onUnexpectedExit: options.handleUnexpectedExit
        }),
        {
            rootDir: options.composition.rootDir,
            dialogs: options.composition.sharedDialogs.concat(
                options.composition.productDialogs
            ),
            startupTasks: options.composition.startupTasks,
            dialogExternalCallHost
        }
    );

    return {
        runtimeSessionManager,
        dialogExternalCallHost,
        readFilterState: function(dataset: string) {
            return getFilterState(dialogBindingState, dataset);
        },
        readConsoleStateChips: function(dataset: string) {
            return productContribution.readConsoleStateChips
                ? productContribution.readConsoleStateChips(productContext, dataset)
                : Promise.resolve([]);
        },
        shouldPublishConsoleStateChips: function(name: string) {
            return (productContribution.consoleStateChipMutationCalls || []).includes(name);
        }
    };
};
