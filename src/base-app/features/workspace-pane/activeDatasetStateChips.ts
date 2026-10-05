import type {
    ProductConsoleStateChip,
    ProductConsoleStateChipSnapshot
} from "../../../core/contracts/productContribution";
import type {
    ActiveDatasetSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";


export const createActiveDatasetStateChipReader = function(bindings: {
    getActiveDatasetName(): string;
    getSessionScope(): unknown;
    getSelectionRevision?(): ActiveDatasetSnapshot["selectionRevision"];
    read(datasetName: string): Promise<ProductConsoleStateChip[]>;
    publish(snapshot: ProductConsoleStateChipSnapshot): void;
}) {
    let requestSequence = 0;

    return {
        async refresh(dataset: string): Promise<void> {
            const datasetName = String(dataset || "").trim();

            if (datasetName !== String(bindings.getActiveDatasetName() || "").trim()) {
                return;
            }

            const sequence = ++requestSequence;
            const scope = bindings.getSessionScope();
            const revision = bindings.getSelectionRevision?.();
            const receipt = revision ? { ...revision } : undefined;
            const isCurrent = function(): boolean {
                const currentReceipt = bindings.getSelectionRevision?.();
                return sequence === requestSequence
                    && scope === bindings.getSessionScope()
                    && datasetName === String(bindings.getActiveDatasetName() || "").trim()
                    && Boolean(receipt) === Boolean(currentReceipt)
                    && (!receipt || !currentReceipt || (
                        receipt.owner === currentReceipt.owner
                        && receipt.sequence === currentReceipt.sequence
                    ));
            };
            let chips: ProductConsoleStateChip[];

            try {
                chips = datasetName ? await bindings.read(datasetName) : [];
            }
            catch (error) {
                if (!isCurrent()) {
                    return;
                }
                throw error;
            }

            if (!isCurrent()) {
                return;
            }

            bindings.publish({
                dataset: datasetName,
                chips: Array.isArray(chips) ? chips : []
            });
        }
    };
};
