"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");

const {
    createRuntimeOperationQueue
} = require("../../src/runtime/session/runtimeOperationQueue");


void (async function() {
    const queue = createRuntimeOperationQueue();
    const order = [];
    let active = 0;
    let maximumActive = 0;
    const operation = function(name, fail = false) {
        return queue.run(async function() {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            order.push(`start:${name}`);

            await new Promise((resolve) => {
                setTimeout(resolve, 10);
            });

            order.push(`end:${name}`);
            active -= 1;

            if (fail) {
                throw new Error(`failed:${name}`);
            }

            return name;
        });
    };

    const results = await Promise.allSettled([
        operation("first"),
        operation("second", true),
        operation("third")
    ]);

    assert.strictEqual(maximumActive, 1);
    assert.deepStrictEqual(order, [
        "start:first",
        "end:first",
        "start:second",
        "end:second",
        "start:third",
        "end:third"
    ]);
    assert.strictEqual(results[0].status, "fulfilled");
    assert.strictEqual(results[1].status, "rejected");
    assert.strictEqual(results[2].status, "fulfilled");

    console.log("Shared runtime operation queue verified through the retained WebR scenarios.");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
