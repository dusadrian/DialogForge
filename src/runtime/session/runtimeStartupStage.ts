export const runOwnedRuntimeStartupStage = async function<Result>(options: {
    isCurrent(): boolean;
    run(): Promise<Result>;
    discard?(result: Result): Promise<void> | void;
}): Promise<Result> {
    if (!options.isCurrent()) {
        throw new Error("Runtime startup was retired before dispatch.");
    }

    const result = await options.run();
    if (!options.isCurrent()) {
        await options.discard?.(result);
        throw new Error("Runtime startup was retired before completion.");
    }

    return result;
};
