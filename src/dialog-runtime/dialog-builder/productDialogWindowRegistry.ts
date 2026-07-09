export interface ProductDialogWindow {
    isDestroyed(): boolean;
    focus(): void;
    close(): void;
    webContents: {
        id: number;
    };
}


export class ProductDialogWindowRegistry<
    Window extends ProductDialogWindow
> {
    private readonly windows = new Map<string, Window>();

    get(dialogId: string): Window | null {
        const window = this.windows.get(dialogId);

        return window && !window.isDestroyed()
            ? window
            : null;
    }

    focusExisting(dialogId: string): Window | null {
        const window = this.get(dialogId);

        if (window) {
            window.focus();
        }

        return window;
    }

    register(dialogId: string, window: Window): void {
        this.windows.set(dialogId, window);
    }

    remove(dialogId: string): void {
        this.windows.delete(dialogId);
    }

    count(): number {
        let count = 0;

        for (const window of this.windows.values()) {
            if (!window.isDestroyed()) {
                count += 1;
            }
        }

        return count;
    }

    forEachLive(callback: (dialogId: string, window: Window) => void): void {
        for (const [dialogId, window] of this.windows.entries()) {
            if (!window.isDestroyed()) {
                callback(dialogId, window);
            }
        }
    }

    dialogIdForSender(senderId: number): string {
        for (const [dialogId, window] of this.windows.entries()) {
            if (
                !window.isDestroyed()
                && window.webContents.id === senderId
            ) {
                return dialogId;
            }
        }

        return "";
    }

    close(dialogId: string): boolean {
        const window = this.get(dialogId);

        if (!window) {
            return false;
        }

        window.close();
        return true;
    }
}
