import {
    ipcRenderer
} from "electron";


interface ProductDialogRuntimeHost {
    sendTo(window: string, channel: string, ...args: unknown[]): void;
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    on(channel: string, listener: (...args: unknown[]) => void): void;
    once(channel: string, listener: (...args: unknown[]) => void): void;
}


interface ProductDialogGlobal {
    dialogForge?: {
        dialogRuntime?: ProductDialogRuntimeHost;
    };
}


const dialogRuntime: ProductDialogRuntimeHost = {
    sendTo: function(window, channel, ...args): void {
        const target = String(window || "all");

        if (target === "main") {
            ipcRenderer.send(channel, ...args);
            return;
        }

        ipcRenderer.send("send-to", target, channel, ...args);
    },
    invoke: function(channel, ...args): Promise<unknown> {
        return ipcRenderer.invoke(channel, ...args);
    },
    on: function(channel, listener): void {
        ipcRenderer.on(channel, (_event, ...args) => {
            listener(...args);
        });
    },
    once: function(channel, listener): void {
        ipcRenderer.once(channel, (_event, ...args) => {
            listener(...args);
        });
    }
};


const target = globalThis as ProductDialogGlobal;
target.dialogForge = {
    ...(target.dialogForge || {}),
    dialogRuntime
};
