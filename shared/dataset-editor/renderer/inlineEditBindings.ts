export interface InlineEditBindings {
    commit: () => void | Promise<void>;
    cancel: () => void;
}


export const bindInlineEdit = function(
    input: HTMLInputElement,
    bindings: InlineEditBindings
): void {
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
    input.addEventListener("blur", commit);
};
