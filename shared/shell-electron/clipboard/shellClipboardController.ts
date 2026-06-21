import type { Clipboard } from "electron";

import type { CopyPayload } from "../../dataset-editor/clipboard/copyPayload";
import {
    readClipboardText,
    writeCopyPayloadText,
    type ClipboardResult
} from "./clipboardResult";


export interface ShellClipboardControllerOptions {
    clipboard: Clipboard;
    publish(result: ClipboardResult): void;
}


export interface ShellClipboardController {
    copyPayload(payload: CopyPayload): ClipboardResult;
    readText(): ClipboardResult;
}


export const createShellClipboardController = function(
    options: ShellClipboardControllerOptions
): ShellClipboardController {
    return {
        copyPayload: function(payload: CopyPayload): ClipboardResult {
            const result = writeCopyPayloadText(options.clipboard, payload);

            options.publish(result);

            return result;
        },
        readText: function(): ClipboardResult {
            return readClipboardText(options.clipboard);
        }
    };
};
