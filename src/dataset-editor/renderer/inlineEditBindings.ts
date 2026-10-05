export interface InlineEditBindings {
    commit: () => void | Promise<void>;
    cancel: () => void;
}

const boundInputs = new WeakSet<HTMLInputElement>();

export const bindInlineEdit = function(
    input: HTMLInputElement,
    bindings: InlineEditBindings
): void {
    if (boundInputs.has(input)) {
        return;
    }
    boundInputs.add(input);
    let settled = false;

    const commit = function(): void {
        if (settled) {
            return;
        }

        settled = true;
        void bindings.commit();
    };
    const cancel = function(): void {
        if (settled) {
            return;
        }

        settled = true;
        bindings.cancel();
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
        } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
        }
    });
    input.addEventListener("blur", () => {
        // DOM removal can blur before the node is disconnected. Allow the
        // synchronous render to finish before deciding whether focus left a
        // current editor, rather than committing a retired or restored draft.
        queueMicrotask(() => {
            if (
                input.isConnected
                && input.ownerDocument.activeElement !== input
            ) {
                commit();
            }
        });
    });
};
