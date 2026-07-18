import {
    LIVE_SCRIPT_PROTOCOL_VERSION
} from "./liveScriptProtocol";


export const LIVE_SCRIPT_TICKET_FORMAT_VERSION = 1 as const;
export const LIVE_SCRIPT_MAX_DISPLAY_NAME_LENGTH = 120;


export interface LiveScriptSessionTicket {
    formatVersion: typeof LIVE_SCRIPT_TICKET_FORMAT_VERSION;
    instructorEndpointId: string;
    transportAddress: string;
    sessionId: string;
    capability: string;
    protocolVersions: {
        minimum: number;
        maximum: number;
    };
    expiresAt?: number;
    displayName?: string;
}


export type LiveScriptTicketParseResult =
    | { ok: true; ticket: LiveScriptSessionTicket }
    | { ok: false; message: string };


const LIVE_SCRIPT_LINK_PREFIX = "dialogforge://live-script/join#ticket=";


const isRecord = function(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};


const hasOnlyKeys = function(
    value: Record<string, unknown>,
    allowed: string[]
): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
};


const isOpaqueIdentifier = function(value: unknown, minimumLength: number): value is string {
    return typeof value === "string"
        && value.length >= minimumLength
        && value.length <= 256
        && /^[A-Za-z0-9_-]+$/.test(value);
};


export const sanitizeLiveScriptDisplayName = function(value: unknown): string {
    const pathSegments = String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .split(/[\\/]/);
    const fileName = String(pathSegments[pathSegments.length - 1] || "").trim();
    const bounded = fileName.slice(0, LIVE_SCRIPT_MAX_DISPLAY_NAME_LENGTH);

    return bounded || "Untitled.R";
};


export const parseLiveScriptSessionTicket = function(
    value: unknown
): LiveScriptTicketParseResult {
    if (!isRecord(value)) {
        return { ok: false, message: "Session ticket must be an object." };
    }

    if (!hasOnlyKeys(value, [
        "formatVersion",
        "instructorEndpointId",
        "transportAddress",
        "sessionId",
        "capability",
        "protocolVersions",
        "expiresAt",
        "displayName"
    ])) {
        return { ok: false, message: "Session ticket contains unknown fields." };
    }

    if (value.formatVersion !== LIVE_SCRIPT_TICKET_FORMAT_VERSION) {
        return { ok: false, message: "Session ticket format is not supported." };
    }

    if (!isOpaqueIdentifier(value.instructorEndpointId, 16)) {
        return { ok: false, message: "Instructor endpoint ID is invalid." };
    }

    if (typeof value.transportAddress !== "string"
        || value.transportAddress.length < 1
        || value.transportAddress.length > 16 * 1024) {
        return { ok: false, message: "Session transport address is invalid." };
    }

    if (!isOpaqueIdentifier(value.sessionId, 16)) {
        return { ok: false, message: "Session ID is invalid." };
    }

    if (!isOpaqueIdentifier(value.capability, 32)) {
        return { ok: false, message: "Session capability is invalid." };
    }

    if (!isRecord(value.protocolVersions)
        || !hasOnlyKeys(value.protocolVersions, ["minimum", "maximum"])) {
        return { ok: false, message: "Protocol version range is invalid." };
    }

    const minimum = value.protocolVersions.minimum;
    const maximum = value.protocolVersions.maximum;

    if (!Number.isSafeInteger(minimum)
        || !Number.isSafeInteger(maximum)
        || Number(minimum) < 1
        || Number(maximum) < Number(minimum)
        || LIVE_SCRIPT_PROTOCOL_VERSION < Number(minimum)
        || LIVE_SCRIPT_PROTOCOL_VERSION > Number(maximum)) {
        return { ok: false, message: "Protocol version range is incompatible." };
    }

    if (value.expiresAt !== undefined
        && (!Number.isSafeInteger(value.expiresAt) || Number(value.expiresAt) < 0)) {
        return { ok: false, message: "Session expiry is invalid." };
    }

    if (value.displayName !== undefined
        && (typeof value.displayName !== "string"
            || sanitizeLiveScriptDisplayName(value.displayName) !== value.displayName)) {
        return { ok: false, message: "Session display name is not sanitized." };
    }

    return {
        ok: true,
        ticket: {
            formatVersion: LIVE_SCRIPT_TICKET_FORMAT_VERSION,
            instructorEndpointId: value.instructorEndpointId,
            transportAddress: value.transportAddress,
            sessionId: value.sessionId,
            capability: value.capability,
            protocolVersions: {
                minimum: Number(minimum),
                maximum: Number(maximum)
            },
            ...(value.expiresAt === undefined ? {} : { expiresAt: Number(value.expiresAt) }),
            ...(value.displayName === undefined ? {} : { displayName: value.displayName })
        }
    };
};


const bytesToBase64Url = function(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
};


const base64UrlToBytes = function(value: string): Uint8Array {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);

    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};


export const createLiveScriptJoinLink = function(
    ticket: LiveScriptSessionTicket
): string {
    const encoded = new TextEncoder().encode(JSON.stringify(ticket));
    return LIVE_SCRIPT_LINK_PREFIX + bytesToBase64Url(encoded);
};


export const parseLiveScriptJoinText = function(
    value: unknown
): LiveScriptTicketParseResult {
    const text = String(value || "").trim();

    if (!text) {
        return { ok: false, message: "Enter a live-script link or ticket." };
    }

    try {
        const ticketText = text.startsWith(LIVE_SCRIPT_LINK_PREFIX)
            ? new TextDecoder().decode(base64UrlToBytes(
                text.slice(LIVE_SCRIPT_LINK_PREFIX.length)
            ))
            : text;

        return parseLiveScriptSessionTicket(JSON.parse(ticketText));
    }
    catch {
        return { ok: false, message: "Live-script link or ticket is invalid." };
    }
};
