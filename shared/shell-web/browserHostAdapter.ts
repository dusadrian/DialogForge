import type { HostAdapter } from "../core/contracts/hostAdapter";
import { createBrowserResourceClient } from "../core/host/browserResourceClient";
import { createBrowserFileAdapter } from "./browserFileAdapter";


export const createBrowserHostAdapter = function(): HostAdapter {
    const files = createBrowserFileAdapter();

    return {
        resources: createBrowserResourceClient(),
        readDroppedFilePath: function(file: File): string {
            return file.name;
        },
        openExternalUrl: async function(url: string): Promise<void> {
            window.open(url, "_blank", "noopener,noreferrer");
        },
        readClipboardText: async function(): Promise<string> {
            if (!navigator.clipboard?.readText) {
                return "";
            }

            return navigator.clipboard.readText();
        },
        writeClipboardText: async function(text: string): Promise<void> {
            if (!navigator.clipboard?.writeText) {
                return;
            }

            await navigator.clipboard.writeText(text);
        },
        showOpenDialog: function(options: unknown): Promise<unknown> {
            const openOptions = options && typeof options === "object"
                ? options as { accept?: string; multiple?: boolean }
                : {};

            return files.selectFiles({
                accept: openOptions.accept,
                multiple: openOptions.multiple
            });
        },
        showSaveDialog: async function(options: unknown): Promise<unknown> {
            const saveOptions = options && typeof options === "object"
                ? options as { name?: string }
                : {};

            return {
                canceled: false,
                name: saveOptions.name || "download.bin",
                message: "Browser save requests are represented as downloads."
            };
        }
    };
};
