import {
    createDialogContentApiPath,
    readDialogContentSizeFromSource,
    type DialogContentSize
} from "./dialogContentSize";

interface DialogDescriptor {
    id?: unknown;
}

interface DialogSource {
    source?: {
        properties?: unknown;
    };
}

export const readDialogContentSize = async function(
    dialog: DialogDescriptor,
    fetchJson: (url: string) => Promise<DialogSource | null>
): Promise<DialogContentSize> {
    let source: DialogSource | null = null;

    try {
        source = await fetchJson(createDialogContentApiPath(dialog.id));
    }
    catch {}

    return readDialogContentSizeFromSource(source);
};
