import type {
    RuntimeSessionSnapshot,
    TabularPreviewSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import { captureDatasetConsumerScope } from "./datasetConsumerScope";


export const createDatasetPreviewReadController = function(bindings: {
    getRuntimeSnapshot(): RuntimeSessionSnapshot | null;
    getObjectName(): string;
    readPreview(objectName: string): Promise<TabularPreviewSnapshot>;
    renderPreview(snapshot: TabularPreviewSnapshot): void;
}) {
    let requestSequence = 0;

    return {
        async read(objectName: string): Promise<void> {
            const sequence = ++requestSequence;
            const scopeIsCurrent = captureDatasetConsumerScope(bindings);
            const isCurrent = function(): boolean {
                return sequence === requestSequence && scopeIsCurrent();
            };

            if (!isCurrent()) {
                return;
            }
            const snapshot = await bindings.readPreview(objectName);

            if (isCurrent()) {
                bindings.renderPreview(snapshot);
            }
        }
    };
};
