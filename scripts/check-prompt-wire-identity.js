"use strict";

const assert = require("node:assert/strict");
const { encodeRuntimeControlRequest } = require("../dist/src/runtime/providers/r/protocol/runtimeControlRequestEncoding");

const request = JSON.parse(encodeRuntimeControlRequest({
    id: "reply-one", method: "reply_prompt",
    params: { parentId: "activity/one", promptId: "prompt/one", reply: "" }
}));
assert.equal(decodeURIComponent(request.parentId), "activity/one");
assert.equal(decodeURIComponent(request.promptId), "prompt/one");
assert.equal(decodeURIComponent(request.reply), "");
console.log("Prompt wire identity: command and prompt ids retained with empty reply.");
