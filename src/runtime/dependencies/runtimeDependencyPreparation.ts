export interface RuntimeDependencyPreparationResult {
    ok: boolean;
    error: string;
    status?: string;
}


export class RuntimeDependencyPreparationError extends Error {
    readonly result: RuntimeDependencyPreparationResult;

    constructor(
        result: RuntimeDependencyPreparationResult,
        message = result.error
    ) {
        super(message);
        this.result = result;
    }
}
