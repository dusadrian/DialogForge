import type {
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeSessionLifecycleState {
    readonly snapshot: RuntimeSessionSnapshot;
    beginTransition(): number;
    transition(status: string, message: string): void;
    reset(status: string, message: string): void;
    commit(generation: number, snapshot: RuntimeSessionSnapshot): boolean;
    getSnapshot(): RuntimeSessionSnapshot;
}


const replaceSnapshot = function(
    target: RuntimeSessionSnapshot,
    source: RuntimeSessionSnapshot
): void {
    Object.assign(target, source);
};


export const createRuntimeSessionLifecycleState = function(
    initialSnapshot: RuntimeSessionSnapshot
): RuntimeSessionLifecycleState {
    const snapshot = Object.assign({}, initialSnapshot);
    let generation = 0;

    return {
        snapshot,
        beginTransition: function(): number {
            generation += 1;

            return generation;
        },
        transition: function(status, message): void {
            Object.assign(snapshot, {
                status,
                message
            });
        },
        reset: function(status, message): void {
            replaceSnapshot(snapshot, Object.assign({}, initialSnapshot, {
                status,
                message
            }));
        },
        commit: function(nextGeneration, nextSnapshot): boolean {
            if (nextGeneration !== generation) {
                return false;
            }

            replaceSnapshot(snapshot, nextSnapshot);
            return true;
        },
        getSnapshot: function() {
            return Object.assign({}, snapshot);
        }
    };
};
