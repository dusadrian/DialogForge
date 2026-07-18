import {
    parseLiveScriptSessionTicket,
    type LiveScriptSessionTicket
} from "./liveScriptTicket";
import type {
    LiveScriptRendezvousProvider,
    LiveScriptRendezvousPublication
} from "./liveScriptRendezvous";


const genericFailure = function(): Error {
    return new Error("Live session is not available.");
};


const normalizeSpokenCode = function(value: unknown): string {
    const words = String(value || "")
        .trim()
        .toLowerCase()
        .split(/[\s-]+/)
        .filter(Boolean);

    if (words.length !== 3 || words.some((word) => !/^[a-z]{3,8}$/.test(word))) {
        return "";
    }

    return words.join("-");
};


export const createHttpLiveScriptParticipantRendezvous = function(options: {
    baseUrl: string;
    fetch?: typeof fetch;
}): LiveScriptRendezvousProvider {
    const request = options.fetch || fetch;
    const baseUrl = options.baseUrl.replace(/\/+$/, "");

    if (!/^https:\/\//i.test(baseUrl)
        && !/^http:\/\/localhost(?::\d+)?$/i.test(baseUrl)) {
        throw new Error("Live-script rendezvous URL must use HTTPS.");
    }

    const resolve = async function(codeInput: string): Promise<LiveScriptSessionTicket> {
        const code = normalizeSpokenCode(codeInput);

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

        const body = await response.json() as { ticket?: unknown };
        const parsed = parseLiveScriptSessionTicket(body.ticket);

        if (!parsed.ok
            || parsed.ticket.expiresAt === undefined
            || parsed.ticket.expiresAt <= Date.now()) {
            throw genericFailure();
        }

        return parsed.ticket;
    };

    return {
        publish: async function(_ticket: LiveScriptSessionTicket) {
            throw new Error("Browser live-script presenting is not available yet.");
        },
        resolve,
        revoke: async function(_publication: LiveScriptRendezvousPublication) {}
    };
};
