import type {
    LiveScriptTextEdit
} from "./liveScriptProtocol";


export type LiveScriptEditResult =
    | { ok: true; content: string }
    | { ok: false; message: string };


export const applyLiveScriptTextEdits = function(
    content: string,
    edits: LiveScriptTextEdit[]
): LiveScriptEditResult {
    let previousEnd = 0;

    for (let index = 0; index < edits.length; index += 1) {
        const edit = edits[index];
        const editEnd = edit.rangeOffset + edit.rangeLength;

        if (edit.rangeOffset < 0
            || edit.rangeLength < 0
            || editEnd > content.length) {
            return { ok: false, message: "Edit range is outside the current document." };
        }

        if (index > 0 && edit.rangeOffset < previousEnd) {
            return { ok: false, message: "Edit ranges overlap or are not ordered." };
        }

        previousEnd = editEnd;
    }

    let updated = content;

    for (let index = edits.length - 1; index >= 0; index -= 1) {
        const edit = edits[index];
        updated = updated.slice(0, edit.rangeOffset)
            + edit.text
            + updated.slice(edit.rangeOffset + edit.rangeLength);
    }

    return { ok: true, content: updated };
};
