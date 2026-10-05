export const runDatasetEditorEventAction = async function(
    action: string,
    execute: () => void | Promise<unknown>
): Promise<void> {
    try {
        await execute();
    } catch (error) {
        console.error(`Dataset editor action failed (${action}).`, error);
    }
};
