const GENERIC_FAILURE = JSON.stringify({
    ok: false,
    message: "Live session is not available."
});
const MAX_TICKET_BYTES = 20 * 1024;
const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;


const jsonResponse = function(value, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*"
        }
    });
};


const unavailableResponse = function() {
    return new Response(GENERIC_FAILURE, {
        status: 404,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*"
        }
    });
};


const base64UrlToBytes = function(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};


const bytesToBase64Url = function(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
};


const encryptionKey = function(secret) {
    const bytes = base64UrlToBytes(String(secret || ""));

    if (bytes.byteLength !== 32) {
        throw new Error("TICKET_ENCRYPTION_KEY must contain 32 base64url bytes.");
    }

    return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
};


const sealTicket = async function(ticket, secret) {
    const plainText = new TextEncoder().encode(JSON.stringify(ticket));

    if (plainText.byteLength > MAX_TICKET_BYTES) {
        throw new Error("Ticket is too large.");
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await encryptionKey(secret);
    const cipherText = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plainText
    );

    return {
        iv: bytesToBase64Url(iv),
        cipherText: bytesToBase64Url(new Uint8Array(cipherText))
    };
};


const openTicket = async function(sealed, secret) {
    const key = await encryptionKey(secret);
    const plainText = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64UrlToBytes(sealed.iv) },
        key,
        base64UrlToBytes(sealed.cipherText)
    );

    return JSON.parse(new TextDecoder().decode(plainText));
};


const tokenHash = async function(value) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(String(value || ""))
    );
    return bytesToBase64Url(new Uint8Array(digest));
};


const readJson = async function(request) {
    try {
        return await request.json();
    }
    catch {
        return null;
    }
};


const validTransportAddress = function(value, instructorEndpointId) {
    if (typeof value !== "string" || value.length < 1 || value.length > 16 * 1024) {
        return false;
    }

    try {
        const address = JSON.parse(value);
        const allowed = new Set(["nodeId", "relayUrl", "addresses"]);

        if (!address || typeof address !== "object" || Array.isArray(address)
            || !Object.keys(address).every((key) => allowed.has(key))
            || address.nodeId !== instructorEndpointId) {
            return false;
        }

        if (address.relayUrl !== undefined
            && (typeof address.relayUrl !== "string"
                || address.relayUrl.length > 2048
                || !/^https:\/\//i.test(address.relayUrl))) {
            return false;
        }

        return address.addresses === undefined
            || (Array.isArray(address.addresses)
                && address.addresses.length <= 16
                && address.addresses.every((entry) => {
                    return typeof entry === "string"
                        && entry.length <= 256
                        && /^[\[\]a-f0-9:.%-]+:\d{1,5}$/i.test(entry);
                }));
    }
    catch {
        return false;
    }
};


const validTicket = function(ticket, expiresAt) {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) {
        return false;
    }

    const allowed = new Set([
        "formatVersion",
        "instructorEndpointId",
        "transportAddress",
        "sessionId",
        "capability",
        "protocolVersions",
        "expiresAt",
        "displayName"
    ]);

    return Object.keys(ticket).every((key) => allowed.has(key))
        && ticket.formatVersion === 1
        && typeof ticket.instructorEndpointId === "string"
        && ticket.instructorEndpointId.length >= 16
        && ticket.instructorEndpointId.length <= 256
        && /^[a-z0-9_-]+$/i.test(ticket.instructorEndpointId)
        && validTransportAddress(
            ticket.transportAddress,
            ticket.instructorEndpointId
        )
        && typeof ticket.sessionId === "string"
        && ticket.sessionId.length >= 16
        && ticket.sessionId.length <= 256
        && /^[a-z0-9_-]+$/i.test(ticket.sessionId)
        && typeof ticket.capability === "string"
        && ticket.capability.length >= 32
        && ticket.capability.length <= 256
        && /^[a-z0-9_-]+$/i.test(ticket.capability)
        && ticket.protocolVersions
        && typeof ticket.protocolVersions === "object"
        && !Array.isArray(ticket.protocolVersions)
        && Object.keys(ticket.protocolVersions).length === 2
        && ticket.protocolVersions.minimum === 1
        && ticket.protocolVersions.maximum === 1
        && (ticket.displayName === undefined
            || (typeof ticket.displayName === "string"
                && ticket.displayName.length <= 128
                && !/[\\/\u0000-\u001f]/.test(ticket.displayName)))
        && ticket.expiresAt === expiresAt;
};


const constantTimeEqual = function(left, right) {
    const leftBytes = new TextEncoder().encode(String(left || ""));
    const rightBytes = new TextEncoder().encode(String(right || ""));
    const length = Math.max(leftBytes.length, rightBytes.length);
    let difference = leftBytes.length ^ rightBytes.length;

    for (let index = 0; index < length; index += 1) {
        difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
    }

    return difference === 0;
};


export class LiveScriptSessionObject {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
    }

    async fetch(request) {
        if (request.method === "PUT") {
            return this.publish(request);
        }

        if (request.method === "GET") {
            return this.resolve();
        }

        if (request.method === "DELETE") {
            return this.revoke(request);
        }

        return unavailableResponse();
    }

    async publish(request) {
        const input = await readJson(request);
        const now = Date.now();
        const expiresAt = Number(input?.expiresAt);

        if (!validTicket(input?.ticket, expiresAt)
            || !Number.isSafeInteger(expiresAt)
            || expiresAt <= now
            || expiresAt > now + MAX_SESSION_DURATION_MS
            || typeof input.revocationToken !== "string"
            || input.revocationToken.length < 32
            || input.revocationToken.length > 256) {
            return unavailableResponse();
        }

        const existing = await this.ctx.storage.get("session");

        if (existing && existing.expiresAt > now) {
            return jsonResponse({ ok: false, message: "Code collision." }, 409);
        }

        if (existing) {
            await this.ctx.storage.deleteAll();
        }

        try {
            const sealedTicket = await sealTicket(
                input.ticket,
                this.env.TICKET_ENCRYPTION_KEY
            );
            const revocationHash = await tokenHash(input.revocationToken);
            await this.ctx.storage.put("session", {
                sealedTicket,
                revocationHash,
                expiresAt
            });
            await this.ctx.storage.setAlarm(expiresAt);
            return jsonResponse({ ok: true, expiresAt }, 201);
        }
        catch {
            return unavailableResponse();
        }
    }

    async resolve() {
        const record = await this.ctx.storage.get("session");

        if (!record || record.expiresAt <= Date.now()) {
            if (record) {
                await this.ctx.storage.deleteAll();
            }
            return unavailableResponse();
        }

        try {
            const ticket = await openTicket(
                record.sealedTicket,
                this.env.TICKET_ENCRYPTION_KEY
            );
            return jsonResponse({ ok: true, ticket });
        }
        catch {
            return unavailableResponse();
        }
    }

    async revoke(request) {
        const authorization = String(request.headers.get("authorization") || "");
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice("Bearer ".length)
            : "";
        const record = await this.ctx.storage.get("session");

        if (record && token && constantTimeEqual(
            await tokenHash(token),
            record.revocationHash
        )) {
            await this.ctx.storage.deleteAll();
        }

        return new Response(null, {
            status: 204,
            headers: { "access-control-allow-origin": "*" }
        });
    }

    async alarm() {
        await this.ctx.storage.deleteAll();
    }
}


const normalizedCode = function(pathname) {
    const match = /^\/v1\/sessions\/([^/]+)$/.exec(pathname);

    if (!match) {
        return "";
    }

    const code = decodeURIComponent(match[1]).trim().toLowerCase();
    return /^[a-z]{3,8}(?:-[a-z]{3,8}){2}$/.test(code) ? code : "";
};


const rateLimitKey = function(request) {
    const clientAddress = request.headers.get("cf-connecting-ip") || "unknown";
    return `live-script-resolve:${clientAddress}`;
};


export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "access-control-allow-origin": "*",
                    "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
                    "access-control-allow-headers": "authorization, content-type",
                    "access-control-max-age": "86400"
                }
            });
        }

        const code = normalizedCode(new URL(request.url).pathname);

        if (!code) {
            return unavailableResponse();
        }

        if (request.method === "GET") {
            const limit = await env.RENDEZVOUS_RATE_LIMITER.limit({
                key: rateLimitKey(request)
            });

            if (!limit.success) {
                return unavailableResponse();
            }
        }

        const id = env.LIVE_SCRIPT_SESSIONS.idFromName(code);
        return env.LIVE_SCRIPT_SESSIONS.get(id).fetch(request);
    }
};


export const workerInternals = {
    normalizedCode,
    openTicket,
    sealTicket,
    tokenHash,
    validTicket
};
