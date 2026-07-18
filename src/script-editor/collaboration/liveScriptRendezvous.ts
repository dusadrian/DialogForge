import {
    createLiveScriptShortCode,
    normalizeLiveScriptShortCode
} from "./liveScriptShortCode";
import {
    parseLiveScriptSessionTicket,
    type LiveScriptSessionTicket
} from "./liveScriptTicket";
export {
    defaultLiveScriptRendezvousUrl
} from "./liveScriptInfrastructure";
import {
    defaultLiveScriptRendezvousUrl
} from "./liveScriptInfrastructure";


const MAX_PUBLICATION_ATTEMPTS = 8;


export interface LiveScriptRendezvousPublication {
    code: string;
    expiresAt: number;
    revocationToken: string;
}


export interface LiveScriptRendezvousProvider {
    publish(ticket: LiveScriptSessionTicket): Promise<LiveScriptRendezvousPublication>;
    resolve(code: string): Promise<LiveScriptSessionTicket>;
    revoke(publication: LiveScriptRendezvousPublication): Promise<void>;
}


export interface HttpLiveScriptRendezvousOptions {
    baseUrl: string;
    fetch?: typeof fetch;
}


const genericFailure = function(): Error {
    return new Error("Live session is not available.");
};


const randomToken = function(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
};


const parseJson = async function(response: Response): Promise<Record<string, unknown>> {
    try {
        const value: unknown = await response.json();
        return value && typeof value === "object" && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
    }
    catch {
        return {};
    }
};


export const createHttpLiveScriptRendezvous = function(
    options: HttpLiveScriptRendezvousOptions
): LiveScriptRendezvousProvider {
    const request = options.fetch || fetch;
    const baseUrl = options.baseUrl.replace(/\/+$/, "");

    if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/localhost(?::\d+)?$/i.test(baseUrl)) {
        throw new Error("Live-script rendezvous URL must use HTTPS.");
    }

    const publish = async function(
        ticket: LiveScriptSessionTicket
    ): Promise<LiveScriptRendezvousPublication> {
        if (ticket.expiresAt === undefined || ticket.expiresAt <= Date.now()) {
            throw new Error("Live-script ticket must have a future expiry.");
        }

        for (let attempt = 0; attempt < MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
            const code = createLiveScriptShortCode();
            const revocationToken = randomToken();
            const response = await request(
                `${baseUrl}/v1/sessions/${encodeURIComponent(code)}`,
                {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        ticket,
                        expiresAt: ticket.expiresAt,
                        revocationToken
                    })
                }
            );

            if (response.status === 409) {
                continue;
            }

            if (!response.ok) {
                throw genericFailure();
            }

            return { code, expiresAt: ticket.expiresAt, revocationToken };
        }

        throw new Error("A live-script classroom code could not be allocated.");
    };

    const resolve = async function(codeInput: string): Promise<LiveScriptSessionTicket> {
        const code = normalizeLiveScriptShortCode(codeInput);

        if (!code) {
            throw genericFailure();
        }

        const response = await request(
            `${baseUrl}/v1/sessions/${encodeURIComponent(code)}`,
            { method: "GET" }
        );

        if (!response.ok) {
            throw genericFailure();
        }

        const body = await parseJson(response);
        const parsed = parseLiveScriptSessionTicket(body.ticket);

        if (!parsed.ok
            || parsed.ticket.expiresAt === undefined
            || parsed.ticket.expiresAt <= Date.now()) {
            throw genericFailure();
        }

        return parsed.ticket;
    };

    const revoke = async function(
        publication: LiveScriptRendezvousPublication
    ): Promise<void> {
        const code = normalizeLiveScriptShortCode(publication.code);

        if (!code) {
            return;
        }

        await request(
            `${baseUrl}/v1/sessions/${encodeURIComponent(code)}`,
            {
                method: "DELETE",
                headers: {
                    authorization: `Bearer ${publication.revocationToken}`
                }
            }
        );
    };

    return { publish, resolve, revoke };
};
