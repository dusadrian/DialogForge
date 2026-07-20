"use strict";

const assert = require("node:assert/strict");
const {
    createHttpLiveScriptRendezvous
} = require(
    "../../dist/src/script-editor/collaboration/liveScriptRendezvous"
);
const {
    createLiveScriptShortCode,
    liveScriptShortCodeVocabulary,
    normalizeLiveScriptShortCode
} = require(
    "../../dist/src/script-editor/collaboration/liveScriptShortCode"
);


const ticket = function() {
    return {
        formatVersion: 1,
        instructorEndpointId: "instructor_1234567890abcdef",
        transportAddress: "{\"nodeId\":\"instructor_1234567890abcdef\"}",
        sessionId: "session_1234567890abcdef",
        capability: "capability_1234567890abcdefghijklmnop",
        protocolVersions: { minimum: 1, maximum: 1 },
        expiresAt: Date.now() + 60_000,
        displayName: "lesson.R"
    };
};


const verifyVocabulary = function() {
    const words = liveScriptShortCodeVocabulary();
    assert.ok(words.length >= 2048);
    assert.equal(new Set(words).size, words.length);
    assert.ok(Math.log2(words.length ** 3) >= 33);

    const code = createLiveScriptShortCode();
    const parts = code.split("-");
    assert.equal(parts.length, 3);
    assert.equal(new Set(parts).size, 3);
    assert.equal(normalizeLiveScriptShortCode(code.toUpperCase()), code);
    assert.equal(normalizeLiveScriptShortCode(parts.join("   ")), code);
    assert.equal(normalizeLiveScriptShortCode(` ${parts.join(" - ")} `), code);
    assert.equal(normalizeLiveScriptShortCode("not-a-validword"), "");
};


const verifyHttpProvider = async function() {
    const activeTicket = ticket();
    const requests = [];
    let publishAttempts = 0;
    const provider = createHttpLiveScriptRendezvous({
        baseUrl: "https://rendezvous.example.test/",
        fetch: async (url, options = {}) => {
            requests.push({ url, options });

            if (options.method === "PUT") {
                publishAttempts += 1;

                if (publishAttempts === 1) {
                    return new Response("collision", { status: 409 });
                }

                return Response.json({ ok: true }, { status: 201 });
            }

            if (options.method === "DELETE") {
                return new Response(null, { status: 204 });
            }

            return Response.json({ ok: true, ticket: activeTicket });
        }
    });

    const publication = await provider.publish(activeTicket);
    assert.equal(publishAttempts, 2, "code collision must retry atomically");
    assert.equal(normalizeLiveScriptShortCode(publication.code), publication.code);
    assert.ok(publication.revocationToken.length >= 32);

    const resolved = await provider.resolve(publication.code.replace(/-/g, " "));
    assert.deepEqual(resolved, activeTicket);
    await provider.revoke(publication);
    assert.equal(
        requests.at(-1).options.headers.authorization,
        `Bearer ${publication.revocationToken}`
    );

    const unavailable = createHttpLiveScriptRendezvous({
        baseUrl: "https://rendezvous.example.test",
        fetch: async () => new Response("missing", { status: 404 })
    });
    await assert.rejects(
        unavailable.resolve(publication.code),
        { message: "Live session is not available." }
    );

    let exhaustedAttempts = 0;
    const exhausted = createHttpLiveScriptRendezvous({
        baseUrl: "https://rendezvous.example.test",
        fetch: async () => {
            exhaustedAttempts += 1;
            return new Response("collision", { status: 409 });
        }
    });
    await assert.rejects(
        exhausted.publish(activeTicket),
        { message: "A live-script classroom code could not be allocated." }
    );
    assert.equal(exhaustedAttempts, 8, "collision retries must be bounded");
};


class TestStorage {
    constructor() {
        this.values = new Map();
        this.alarmAt = null;
    }

    async get(key) {
        return this.values.get(key);
    }

    async put(key, value) {
        this.values.set(key, value);
    }

    async setAlarm(value) {
        this.alarmAt = value;
    }

    async deleteAll() {
        this.values.clear();
        this.alarmAt = null;
    }
}


const verifyCloudflareObject = async function() {
    const { LiveScriptSessionObject } = await import(
        "../../services/live-script-rendezvous/cloudflare/src/worker.mjs"
    );
    const storage = new TestStorage();
    const key = Buffer.alloc(32, 7).toString("base64url");
    const sessionObject = new LiveScriptSessionObject(
        { storage },
        { TICKET_ENCRYPTION_KEY: key }
    );
    const activeTicket = ticket();
    const revocationToken = "revocation_1234567890abcdefghijklmnopqrstuvwxyz";
    const smuggledTicket = {
        ...activeTicket,
        transportAddress: JSON.stringify({
            nodeId: activeTicket.instructorEndpointId,
            scriptContent: "private_value <- 42"
        })
    };
    const rejected = await sessionObject.fetch(new Request(
        "https://worker/v1/sessions/maple-river-lantern",
        {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket: smuggledTicket,
                expiresAt: smuggledTicket.expiresAt,
                revocationToken
            })
        }
    ));
    assert.equal(rejected.status, 404);
    assert.equal(storage.values.size, 0);
    const publishRequest = new Request("https://worker/v1/sessions/maple-river-lantern", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            ticket: activeTicket,
            expiresAt: activeTicket.expiresAt,
            revocationToken
        })
    });

    const collisionRequest = publishRequest.clone();
    assert.equal((await sessionObject.fetch(publishRequest)).status, 201);
    const stored = storage.values.get("session");
    assert.ok(stored.sealedTicket);
    assert.equal(JSON.stringify(stored).includes(activeTicket.capability), false);
    assert.equal(storage.alarmAt, activeTicket.expiresAt);
    assert.equal((await sessionObject.fetch(collisionRequest)).status, 409);

    const resolved = await sessionObject.fetch(new Request(
        "https://worker/v1/sessions/maple-river-lantern"
    ));
    assert.equal(resolved.status, 200);
    assert.deepEqual((await resolved.json()).ticket, activeTicket);

    const wrongRevoke = new Request(
        "https://worker/v1/sessions/maple-river-lantern",
        { method: "DELETE", headers: { authorization: "Bearer wrong-token" } }
    );
    assert.equal((await sessionObject.fetch(wrongRevoke)).status, 204);
    assert.ok(storage.values.has("session"));

    const revoke = new Request(
        "https://worker/v1/sessions/maple-river-lantern",
        { method: "DELETE", headers: { authorization: `Bearer ${revocationToken}` } }
    );
    assert.equal((await sessionObject.fetch(revoke)).status, 204);
    assert.equal(storage.values.size, 0);
    assert.equal((await sessionObject.fetch(new Request(
        "https://worker/v1/sessions/maple-river-lantern"
    ))).status, 404);

    const expiringTicket = ticket();
    const expiringRequest = new Request(
        "https://worker/v1/sessions/maple-river-lantern",
        {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket: expiringTicket,
                expiresAt: expiringTicket.expiresAt,
                revocationToken
            })
        }
    );
    assert.equal((await sessionObject.fetch(expiringRequest)).status, 201);
    storage.values.get("session").expiresAt = Date.now() - 1;
    assert.equal((await sessionObject.fetch(new Request(
        "https://worker/v1/sessions/maple-river-lantern"
    ))).status, 404);
    assert.equal(storage.values.size, 0, "expired records must be removed on lookup");

    const replacementTicket = ticket();
    const replacementRequest = new Request(
        "https://worker/v1/sessions/maple-river-lantern",
        {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                ticket: replacementTicket,
                expiresAt: replacementTicket.expiresAt,
                revocationToken
            })
        }
    );
    assert.equal((await sessionObject.fetch(replacementRequest)).status, 201);
    await sessionObject.alarm();
    assert.equal(storage.values.size, 0, "expiry alarm must remove the ticket");
    assert.equal(storage.alarmAt, null);
};


const verifyCloudflareRouting = async function() {
    const { default: worker } = await import(
        "../../services/live-script-rendezvous/cloudflare/src/worker.mjs"
    );
    const genericFailure = {
        ok: false,
        message: "Live session is not available."
    };
    const forwardedCodes = [];
    let rateLimitAllowed = true;
    const env = {
        RENDEZVOUS_RATE_LIMITER: {
            limit: async ({ key }) => {
                assert.equal(key, "live-script-resolve:192.0.2.8");
                return { success: rateLimitAllowed };
            }
        },
        LIVE_SCRIPT_SESSIONS: {
            idFromName: (code) => {
                forwardedCodes.push(code);
                return code;
            },
            get: () => ({
                fetch: async () => new Response(
                    JSON.stringify(genericFailure),
                    {
                        status: 404,
                        headers: { "content-type": "application/json" }
                    }
                )
            })
        }
    };
    const request = function(path) {
        return new Request(`https://worker${path}`, {
            headers: { "cf-connecting-ip": "192.0.2.8" }
        });
    };

    const missing = await worker.fetch(
        request("/v1/sessions/maple-river-lantern"),
        env
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), genericFailure);
    assert.deepEqual(forwardedCodes, ["maple-river-lantern"]);

    const malformed = await worker.fetch(request("/v1/sessions/not-a-code"), env);
    assert.equal(malformed.status, 404);
    assert.deepEqual(await malformed.json(), genericFailure);

    rateLimitAllowed = false;
    const throttled = await worker.fetch(
        request("/v1/sessions/maple-river-lantern"),
        env
    );
    assert.equal(throttled.status, 404);
    assert.deepEqual(await throttled.json(), genericFailure);
    assert.deepEqual(
        forwardedCodes,
        ["maple-river-lantern"],
        "throttled lookups must not reach session storage"
    );
};


const run = async function() {
    verifyVocabulary();
    await verifyHttpProvider();
    await verifyCloudflareObject();
    await verifyCloudflareRouting();
    process.stdout.write("live-script rendezvous, spoken codes, revocation, and expiry: ok\n");
};


run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
