import {
    createCopiedClipboardResult,
    readCopyPayloadText,
    type ClipboardResult
} from "./clipboardResult";
import {
    createUnsupportedOperationResult,
    type UnsupportedOperationResult
} from "../../core/contracts/operationResult";


export interface GeneralChannelHost {
    readClipboardText(): Promise<string>;
    writeClipboardText(text: string): Promise<void>;
}

export interface GeneralChannelAdapter {
    readClipboardText(): Promise<string>;
    copyPayload(input: unknown): Promise<ClipboardResult>;
    unsupported(): UnsupportedOperationResult;
}

export const createGeneralChannelAdapter = function(
    host: GeneralChannelHost
): GeneralChannelAdapter {
    return {
        readClipboardText() {
            return host.readClipboardText();
        },

        async copyPayload(input) {
            const text = readCopyPayloadText(input);

            await host.writeClipboardText(text);

            return createCopiedClipboardResult(text);
        },

        unsupported() {
            return createUnsupportedOperationResult();
        }
    };
};
