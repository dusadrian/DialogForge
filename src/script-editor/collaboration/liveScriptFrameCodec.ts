import {
    LIVE_SCRIPT_MAX_EDITS_PER_FRAME,
    LIVE_SCRIPT_MAX_EDIT_TEXT_BYTES,
    LIVE_SCRIPT_MAX_FRAME_BYTES,
    LIVE_SCRIPT_MAX_SNAPSHOT_BYTES,
    LIVE_SCRIPT_PROTOCOL,
    LIVE_SCRIPT_PROTOCOL_VERSION,
    type LiveScriptEditRange,
    type LiveScriptFrame,
    type LiveScriptMessageType,
    type LiveScriptTextEdit
} from "./liveScriptProtocol";


export type LiveScriptFrameParseErrorCode =
    | "malformed-json"
    | "invalid-frame"
    | "oversized-frame"
    | "length-mismatch";


export type LiveScriptFrameParseResult =
    | { ok: true; frame: LiveScriptFrame }
    | {
        ok: false;
        error: {
            code: LiveScriptFrameParseErrorCode;
            message: string;
        };
    };


const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const messageTypes: LiveScriptMessageType[] = [
    "join",
    "welcome",
    "snapshot",
    "edit",
    "ack",
    "resync-request",
    "cursor",
    "participant-state",
    "session-ended",
    "error",
    "ping",
    "pong"
];


const fail = function(
    code: LiveScriptFrameParseErrorCode,
    message: string
): LiveScriptFrameParseResult {
    return { ok: false, error: { code, message } };
};


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};


const hasExactKeys = function(
    value: Record<string, unknown>,
    required: string[],
    optional: string[] = []
): boolean {
    const keys = Object.keys(value);

    return required.every((key) => keys.includes(key))
        && keys.every((key) => required.includes(key) || optional.includes(key));
};


const isBoundedString = function(
    value: unknown,
    minimumLength: number,
    maximumLength: number
): value is string {
    return typeof value === "string"
        && value.length >= minimumLength
        && value.length <= maximumLength;
};


const isSafeNonNegativeInteger = function(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) >= 0;
};


const isSafePositiveInteger = function(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) > 0;
};


const parseRange = function(value: unknown): LiveScriptEditRange | null {
    if (!isRecord(value)
        || !hasExactKeys(value, [
            "startLineNumber",
            "startColumn",
            "endLineNumber",
            "endColumn"
        ])) {
        return null;
    }

    if (!isSafePositiveInteger(value.startLineNumber)
        || !isSafePositiveInteger(value.startColumn)
        || !isSafePositiveInteger(value.endLineNumber)
        || !isSafePositiveInteger(value.endColumn)) {
        return null;
    }

    if (value.endLineNumber < value.startLineNumber
        || (value.endLineNumber === value.startLineNumber
            && value.endColumn < value.startColumn)) {
        return null;
    }

    return {
        startLineNumber: value.startLineNumber,
        startColumn: value.startColumn,
        endLineNumber: value.endLineNumber,
        endColumn: value.endColumn
    };
};


const parseTextEdit = function(value: unknown): LiveScriptTextEdit | null {
    if (!isRecord(value)
        || !hasExactKeys(value, ["range", "rangeOffset", "rangeLength", "text"])) {
        return null;
    }

    const range = parseRange(value.range);

    if (!range
        || !isSafeNonNegativeInteger(value.rangeOffset)
        || !isSafeNonNegativeInteger(value.rangeLength)
        || typeof value.text !== "string"
        || encoder.encode(value.text).byteLength > LIVE_SCRIPT_MAX_EDIT_TEXT_BYTES) {
        return null;
    }

    return {
        range,
        rangeOffset: value.rangeOffset,
        rangeLength: value.rangeLength,
        text: value.text
    };
};


const validPosition = function(value: unknown): boolean {
    return isRecord(value)
        && hasExactKeys(value, ["lineNumber", "column"])
        && isSafePositiveInteger(value.lineNumber)
        && isSafePositiveInteger(value.column);
};


const validPayload = function(
    type: LiveScriptMessageType,
    payload: Record<string, unknown>
): boolean {
    if (type === "join") {
        return hasExactKeys(payload, ["capability", "supportedVersions"])
            && isBoundedString(payload.capability, 32, 256)
            && Array.isArray(payload.supportedVersions)
            && payload.supportedVersions.length > 0
            && payload.supportedVersions.length <= 16
            && payload.supportedVersions.every(isSafePositiveInteger);
    }

    if (type === "welcome") {
        return hasExactKeys(payload, ["revision", "displayName", "permissions"])
            && isSafeNonNegativeInteger(payload.revision)
            && isBoundedString(payload.displayName, 1, 120)
            && isRecord(payload.permissions)
            && hasExactKeys(payload.permissions, ["canEdit", "canExecuteLocally"])
            && payload.permissions.canEdit === false
            && payload.permissions.canExecuteLocally === true;
    }

    if (type === "snapshot") {
        return hasExactKeys(payload, ["revision", "content"])
            && isSafeNonNegativeInteger(payload.revision)
            && typeof payload.content === "string"
            && encoder.encode(payload.content).byteLength <= LIVE_SCRIPT_MAX_SNAPSHOT_BYTES;
    }

    if (type === "edit") {
        if (!hasExactKeys(payload, ["baseRevision", "revision", "edits"])
            || !isSafeNonNegativeInteger(payload.baseRevision)
            || !isSafePositiveInteger(payload.revision)
            || payload.revision !== payload.baseRevision + 1
            || !Array.isArray(payload.edits)
            || payload.edits.length < 1
            || payload.edits.length > LIVE_SCRIPT_MAX_EDITS_PER_FRAME) {
            return false;
        }

        const edits = payload.edits.map(parseTextEdit);

        if (edits.some((edit) => !edit)) {
            return false;
        }

        let previousEnd = 0;

        return (edits as LiveScriptTextEdit[]).every((edit, index) => {
            const ordered = index === 0 || edit.rangeOffset >= previousEnd;
            previousEnd = edit.rangeOffset + edit.rangeLength;
            return ordered;
        });
    }

    if (type === "ack") {
        return hasExactKeys(payload, ["revision"])
            && isSafeNonNegativeInteger(payload.revision);
    }

    if (type === "resync-request") {
        return hasExactKeys(payload, ["currentRevision", "expectedBaseRevision", "reason"])
            && isSafeNonNegativeInteger(payload.currentRevision)
            && isSafeNonNegativeInteger(payload.expectedBaseRevision)
            && ["missing-revision", "invalid-edit", "initial-snapshot"].includes(
                String(payload.reason)
            );
    }

    if (type === "cursor") {
        return hasExactKeys(payload, ["position"], ["selection"])
            && validPosition(payload.position)
            && (payload.selection === undefined || Boolean(parseRange(payload.selection)));
    }

    if (type === "participant-state") {
        return hasExactKeys(payload, ["endpointId", "state"])
            && isBoundedString(payload.endpointId, 1, 256)
            && ["joined", "left", "healthy", "reconnecting"].includes(
                String(payload.state)
            );
    }

    if (type === "session-ended") {
        return hasExactKeys(payload, ["reason"])
            && ["stopped", "expired", "instructor-closed"].includes(
                String(payload.reason)
            );
    }

    if (type === "error") {
        return hasExactKeys(payload, ["code", "message"])
            && [
                "authorization-failed",
                "incompatible-version",
                "invalid-frame",
                "session-ended",
                "participant-limit"
            ].includes(String(payload.code))
            && isBoundedString(payload.message, 1, 512);
    }

    if (type === "ping" || type === "pong") {
        return hasExactKeys(payload, ["nonce"])
            && isBoundedString(payload.nonce, 1, 128);
    }

    return false;
};


export const parseLiveScriptFrameValue = function(
    value: unknown
): LiveScriptFrameParseResult {
    if (!isRecord(value)) {
        return fail("invalid-frame", "Live-script frame must be an object.");
    }

    if (!hasExactKeys(
        value,
        [
            "protocol",
            "version",
            "sessionId",
            "type",
            "senderEndpointId",
            "messageNumber",
            "payload"
        ],
        ["timestamp"]
    )) {
        return fail("invalid-frame", "Live-script frame fields are invalid.");
    }

    if (value.protocol !== LIVE_SCRIPT_PROTOCOL
        || value.version !== LIVE_SCRIPT_PROTOCOL_VERSION
        || !isBoundedString(value.sessionId, 16, 256)
        || !messageTypes.includes(value.type as LiveScriptMessageType)
        || !isBoundedString(value.senderEndpointId, 16, 256)
        || !isSafePositiveInteger(value.messageNumber)
        || !isRecord(value.payload)) {
        return fail("invalid-frame", "Live-script frame header is invalid.");
    }

    const type = value.type as LiveScriptMessageType;
    const needsTimestamp = type === "cursor"
        || type === "participant-state"
        || type === "ping"
        || type === "pong";

    if ((needsTimestamp && !isSafeNonNegativeInteger(value.timestamp))
        || (!needsTimestamp && value.timestamp !== undefined)) {
        return fail("invalid-frame", "Live-script frame timestamp is invalid.");
    }

    if (!validPayload(type, value.payload)) {
        return fail("invalid-frame", `Live-script ${type} payload is invalid.`);
    }

    return { ok: true, frame: value as unknown as LiveScriptFrame };
};


export const parseLiveScriptJsonFrame = function(
    bytes: Uint8Array
): LiveScriptFrameParseResult {
    if (bytes.byteLength > LIVE_SCRIPT_MAX_FRAME_BYTES) {
        return fail("oversized-frame", "Live-script frame exceeds the byte limit.");
    }

    try {
        const json = decoder.decode(bytes);
        return parseLiveScriptFrameValue(JSON.parse(json));
    }
    catch {
        return fail("malformed-json", "Live-script frame is not valid UTF-8 JSON.");
    }
};


export const encodeLiveScriptFrame = function(frame: LiveScriptFrame): Uint8Array {
    const parsed = parseLiveScriptFrameValue(frame);

    if (!parsed.ok) {
        throw new Error(parsed.error.message);
    }

    const json = encoder.encode(JSON.stringify(frame));

    if (json.byteLength > LIVE_SCRIPT_MAX_FRAME_BYTES) {
        throw new Error("Live-script frame exceeds the byte limit.");
    }

    const encoded = new Uint8Array(4 + json.byteLength);
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);

    view.setUint32(0, json.byteLength, false);
    encoded.set(json, 4);
    return encoded;
};


export const parseLengthPrefixedLiveScriptFrame = function(
    bytes: Uint8Array
): LiveScriptFrameParseResult {
    if (bytes.byteLength < 4) {
        return fail("length-mismatch", "Live-script frame prefix is incomplete.");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const declaredLength = view.getUint32(0, false);

    if (declaredLength > LIVE_SCRIPT_MAX_FRAME_BYTES) {
        return fail("oversized-frame", "Live-script frame exceeds the byte limit.");
    }

    if (declaredLength !== bytes.byteLength - 4) {
        return fail("length-mismatch", "Live-script frame length does not match its prefix.");
    }

    return parseLiveScriptJsonFrame(bytes.subarray(4));
};
