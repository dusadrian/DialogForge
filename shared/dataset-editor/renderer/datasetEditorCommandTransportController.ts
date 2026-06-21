import type {
    DatasetEditorRendererTransport
} from "./datasetEditorRendererTransport";

export interface DatasetEditorCommandTransportControllerOptions {
    transport: DatasetEditorRendererTransport;
    getDatasetName: () => string;
}

export interface DatasetEditorCommandTransportController {
    writeClipboardText: (text: string) => Promise<boolean>;
    readClipboardText: () => Promise<string>;
    runVisibleCommand: (
        command: string,
        visible?: boolean
    ) => Promise<boolean>;
}

export const createDatasetEditorCommandTransportController = function(
    options: DatasetEditorCommandTransportControllerOptions
): DatasetEditorCommandTransportController {
    const runVisibleCommand = async function(
        command: string,
        visible = true
    ): Promise<boolean> {
        return options.transport.runVisibleCommand(
            command,
            options.getDatasetName(),
            visible
        );
    };

    return {
        writeClipboardText: options.transport.writeClipboardText,
        readClipboardText: options.transport.readClipboardText,
        runVisibleCommand
    };
};
