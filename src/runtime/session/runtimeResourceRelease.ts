export const releaseOwnedRuntimeResource = async function<Resource>(options: {
    resource: Resource;
    release(resource: Resource): Promise<void>;
    isCurrent(resource: Resource): boolean;
    disposeReleased?(resource: Resource): void;
    clearCurrent(resource: Resource): void;
}): Promise<boolean> {
    // Physical cleanup always addresses the captured resource, never a live getter.
    await options.release(options.resource);
    options.disposeReleased?.(options.resource);

    if (!options.isCurrent(options.resource)) {
        return false;
    }

    options.clearCurrent(options.resource);
    return true;
};
