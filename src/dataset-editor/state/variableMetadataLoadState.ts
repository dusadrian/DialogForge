export interface VariableMetadataLoadSnapshot {
    sequence: number;
    loading: boolean;
    loaded: boolean;
    batchInFlight: boolean;
    totalCount: number;
}


export interface VariableMetadataBatchToken {
    sequence: number;
}


export interface VariableMetadataLoadState {
    readonly snapshot: VariableMetadataLoadSnapshot;
    reset(): void;
    schedule(callback: () => void, delay: number): void;
    cancelScheduled(): void;
    beginBatch(): VariableMetadataBatchToken | null;
    isCurrent(token: VariableMetadataBatchToken): boolean;
    finishBatch(token: VariableMetadataBatchToken, itemCount: number, totalCount: number): boolean;
    failBatch(token: VariableMetadataBatchToken): boolean;
}


export const createVariableMetadataLoadState = function(): VariableMetadataLoadState {
    let sequence = 0;
    let loading = false;
    let loaded = false;
    let batchInFlight = false;
    let totalCount = 0;
    let timer: number | null = null;

    const cancelScheduled = function(): void {
        if (timer === null) {
            return;
        }

        window.clearTimeout(timer);
        timer = null;
    };

    const reset = function(): void {
        cancelScheduled();
        sequence += 1;
        loading = false;
        loaded = false;
        batchInFlight = false;
        totalCount = 0;
    };

    const schedule = function(callback: () => void, delay: number): void {
        cancelScheduled();
        timer = window.setTimeout(() => {
            timer = null;
            callback();
        }, Math.max(0, Number(delay) || 0));
    };

    const beginBatch = function(): VariableMetadataBatchToken | null {
        if (loaded || batchInFlight) {
            return null;
        }

        batchInFlight = true;
        loading = true;

        return { sequence };
    };

    const isCurrent = function(token: VariableMetadataBatchToken): boolean {
        return token.sequence === sequence;
    };

    const finishBatch = function(
        token: VariableMetadataBatchToken,
        itemCount: number,
        nextTotalCount: number
    ): boolean {
        if (!isCurrent(token)) {
            return false;
        }

        batchInFlight = false;
        totalCount = Math.max(0, Number(nextTotalCount) || itemCount);
        loaded = itemCount >= totalCount;
        loading = !loaded;

        return true;
    };

    const failBatch = function(token: VariableMetadataBatchToken): boolean {
        if (!isCurrent(token)) {
            return false;
        }

        batchInFlight = false;
        loading = false;
        loaded = true;

        return true;
    };

    return {
        get snapshot(): VariableMetadataLoadSnapshot {
            return {
                sequence,
                loading,
                loaded,
                batchInFlight,
                totalCount
            };
        },
        reset,
        schedule,
        cancelScheduled,
        beginBatch,
        isCurrent,
        finishBatch,
        failBatch
    };
};
