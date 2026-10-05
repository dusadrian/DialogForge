import type { RuntimeSessionSnapshot } from "../../runtime/provider-contract/runtimeProvider";
import { captureRuntimeSessionScope } from "../../runtime/session/runtimeSessionScope";


export const captureDatasetConsumerScope = function(bindings: {
    getRuntimeSnapshot(): RuntimeSessionSnapshot | null;
    getObjectName(): string;
}): () => boolean {
    const sessionIsCurrent = captureRuntimeSessionScope(bindings.getRuntimeSnapshot);
    const objectName = bindings.getObjectName();

    return function(): boolean {
        return sessionIsCurrent() && bindings.getObjectName() === objectName;
    };
};
