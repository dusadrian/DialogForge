import type {
    VariableColumnWidths
} from "../state/variableColumnWidths";


export interface DatasetEditorRendererTransport {
    persistVariableColumnWidths(widths: VariableColumnWidths): Promise<void>;
    publishDatasetState(datasetName: string): void;
    writeClipboardText(text: string): Promise<boolean>;
    readClipboardText(): Promise<string>;
    runVisibleCommand(
        command: string,
        datasetName: string,
        visible?: boolean
    ): Promise<boolean>;
}


export interface DatasetEditorTransportBridge {
    persistVariableColumnWidths(widths: VariableColumnWidths): Promise<void>;
    publishDatasetState(datasetName: string): void;
    writeClipboardText(text: string): Promise<boolean>;
    readClipboardText(): Promise<string>;
    runVisibleCommand(
        command: string,
        datasetName: string,
        visible?: boolean
    ): Promise<boolean>;
}


const normalizeClipboardText = function(text: string): string {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
};


export const createDatasetEditorRendererTransport = function(
    bridge: DatasetEditorTransportBridge
): DatasetEditorRendererTransport {
    return {
        persistVariableColumnWidths: async (widths) => {
            try {
                await bridge.persistVariableColumnWidths({ ...widths });
            } catch {}
        },
        publishDatasetState: (datasetName) => {
            try {
                bridge.publishDatasetState(String(datasetName || "").trim());
            } catch {}
        },
        writeClipboardText: async (text) => {
            const normalized = normalizeClipboardText(text);

            if (!normalized) {
                return false;
            }

            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(normalized);
                    return true;
                }
            } catch {}

            try {
                return await bridge.writeClipboardText(normalized);
            } catch {}

            return false;
        },
        readClipboardText: async () => {
            try {
                if (navigator?.clipboard?.readText) {
                    return String(
                        await navigator.clipboard.readText() || ""
                    );
                }
            } catch {}

            try {
                return String(await bridge.readClipboardText() || "");
            } catch {}

            return "";
        },
        runVisibleCommand: async (
            command,
            datasetName,
            visible = true
        ) => {
            try {
                return await bridge.runVisibleCommand(
                    String(command || ""),
                    datasetName,
                    visible
                );
            } catch {
                return false;
            }
        }
    };
};
