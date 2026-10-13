"use strict";

const assert = require("node:assert/strict");


const assertDialogTargetEnabled = async function(target, context) {
    await target.waitFor({ state: "visible", timeout: 30000 });
    const blocked = await target.evaluate((node) => {
        return Boolean(node.closest(
            ".dm-disabled, .disabled-div, .container-item-disabled, "
            + '[aria-disabled="true"], [disabled]'
        ));
    });

    assert.strictEqual(blocked, false, `${context} is disabled; enable it through the UI first.`);
};


const assertDialogControlState = async function(frame, name, expected) {
    const control = frame.locator(`[data-control-name="${name}"]`).first();

    await control.waitFor({ state: "attached", timeout: 30000 });
    if (expected.visible !== undefined) {
        assert.strictEqual(await control.isVisible(), expected.visible, `${name} visibility`);
    }
    if (expected.checked !== undefined) {
        assert.strictEqual(
            await control.locator('[role="checkbox"], [role="radio"]').getAttribute("aria-checked"),
            String(expected.checked),
            `${name} checked state`
        );
    }
    if (expected.enabled !== undefined) {
        assert.strictEqual(await control.evaluate((node) => {
            return !node.closest('.dm-disabled, .disabled-div, [aria-disabled="true"], [disabled]');
        }), expected.enabled, `${name} enabled state`);
    }
};


module.exports = { assertDialogTargetEnabled, assertDialogControlState };
