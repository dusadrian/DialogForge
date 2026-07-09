export interface RuntimeInvisibleMutationState {
    read(): Record<string, unknown>;
    write(mutation: string, value: unknown): void;
}


export const createRuntimeInvisibleMutationState = function(): RuntimeInvisibleMutationState {
    const mutations: Record<string, unknown> = {};

    return {
        read: function() {
            return Object.assign({}, mutations);
        },
        write: function(mutation, value): void {
            mutations[mutation] = value;
        }
    };
};
