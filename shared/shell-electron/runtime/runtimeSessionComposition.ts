import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import type {
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
    const dialogExternalCallHost = createCompositeDialogExternalCallHost({
        shared: createDialogExternalCallHost({
            resolveDatasets: resolveDialogDatasets,
            state: dialogBindingState
        }),
        products: productContribution.createDialogExternalCallHosts({
            executeRuntimeMethod: function(request) {
                return runtimeSessionManager.executeRuntimeMethod(request);
            }
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
        }
    };
};
