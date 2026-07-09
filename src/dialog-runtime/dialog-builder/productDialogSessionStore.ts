export class ProductDialogSessionStore {
    private readonly commands = new Map<string, string>();
    private readonly states = new Map<string, unknown>();

    getState(dialogId: string): unknown {
        return this.states.get(dialogId) || null;
    }

    updateCommand(dialogId: string, command: unknown): void {
        this.commands.set(dialogId, String(command || ""));
    }

    updateState(dialogId: string, state: unknown): void {
        this.states.set(dialogId, state || {});
    }

    closeWindow(dialogId: string): void {
        this.commands.delete(dialogId);
    }
}
