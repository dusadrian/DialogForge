import type {
    DialogDefinition,
    EvaluatedProductCapability
} from "../../../core/contracts/applicationComposition";


export interface MainDatasetNavigationSupportOptions {
    getProductCapabilities(): EvaluatedProductCapability[];
    getProductDialogs(): DialogDefinition[];
    prepareContext(mode: "case" | "variable"): {
        datasetName: string;
    };
    executeGoToDialog(
        dialogId: string,
        owner: string,
        mode: "case" | "variable",
        datasetName: string
    ): Promise<void>;
}


export const createMainDatasetNavigationSupport = function(
    options: MainDatasetNavigationSupportOptions
) {
    const findDialogId = function(): string {
        const capability = options.getProductCapabilities().find(
            function(candidate) {
                return candidate.enabled
                    && candidate.datasetNavigation?.goToDialog;
            }
        );

        return capability?.datasetNavigation?.goToDialog || "";
    };

    const findDialogOwner = function(dialogId: string): string {
        const dialog = options.getProductDialogs().find(function(candidate) {
            return candidate.id === dialogId;
        });

        return dialog?.owner || "";
    };

    const executeGoToDialog = async function(
        dialogId: string,
        mode: "case" | "variable"
    ): Promise<void> {
        const owner = findDialogOwner(dialogId);

        if (!owner) {
            return;
        }

        const context = options.prepareContext(mode);

        await options.executeGoToDialog(
            dialogId,
            owner,
            mode,
            context.datasetName
        );
    };

    return {
        findDialogId,
        executeGoToDialog
    };
};
