import type * as Monaco from "monaco-editor";


export interface ScriptMonacoRuntime {
    readonly current: typeof Monaco | null;
    ensure(): Promise<typeof Monaco>;
}


export const createScriptMonacoRuntime = function(
    load: () => Promise<typeof Monaco>
): ScriptMonacoRuntime {
    let current: typeof Monaco | null = null;
    let loading: Promise<typeof Monaco> | null = null;

    const ensure = async function(): Promise<typeof Monaco> {
        if (current) {
            return current;
        }

        if (!loading) {
            loading = load();
        }

        try {
            current = await loading;
            return current;
        } catch (error) {
            loading = null;
            throw error;
        }
    };

    return {
        get current() {
            return current;
        },
        ensure
    };
};
