export const deliverDatasetMutationTargets = async function(options: {
    isCurrent(): boolean;
    objectNames: string[];
    deliverTarget(objectName: string): Promise<void> | void;
}): Promise<boolean> {
    for (const objectName of options.objectNames) {
        if (!options.isCurrent()) {
            return false;
        }
        await options.deliverTarget(objectName);
        if (!options.isCurrent()) {
            return false;
        }
    }

    return options.isCurrent();
};


export const deliverDatasetMutationEffects = async function(options: {
    isCurrent(): boolean;
    objectNames: string[];
    updateCache(objectName: string): void;
    publishChanges?(): void;
    publishWorkspace?(): Promise<boolean | void> | boolean | void;
    refreshConsumers(): Promise<void> | void;
}): Promise<boolean> {
    const targetsDelivered = await deliverDatasetMutationTargets({
        isCurrent: options.isCurrent,
        objectNames: options.objectNames,
        deliverTarget: options.updateCache
    });

    if (!targetsDelivered || !options.isCurrent()) {
        return false;
    }
    options.publishChanges?.();
    if (!options.isCurrent()) {
        return false;
    }

    const workspaceDelivered = await options.publishWorkspace?.();
    if (workspaceDelivered === false || !options.isCurrent()) {
        return false;
    }

    await options.refreshConsumers();
    return options.isCurrent();
};
