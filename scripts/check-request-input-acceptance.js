"use strict";

const assert = require("node:assert/strict");
const { createConsoleRequestInputView } = require("../dist/src/console/views/requestInputView");

const element = () => ({
    style: {}, value: "", children: [],
    appendChild(child) { this.children.push(child); },
    addEventListener() {}, focus() {}, remove() {}
});

const main = async function() {
    const previousDocument = global.document;
    global.document = { createElement: element };
    try {
        let resolveReply;
        let rejectReply;
        const submitted = [];
        const input = createConsoleRequestInputView({
            replyToRequest: (value) => {
                submitted.push(value);
                return new Promise((resolve, reject) => {
                    resolveReply = resolve;
                    rejectReply = reject;
                });
            }
        });
        const container = element();
        input.mount(container);
        const field = container.children[0].children[0];
        field.value = "retry";
        const rejected = input.submit();
        await input.submit();
        assert.deepEqual(submitted, ["retry"], "Repeated Enter cannot duplicate the reply");
        resolveReply(false);
        await rejected;
        assert.equal(field.value, "retry");
        const failed = input.submit();
        rejectReply(new Error("failure"));
        await failed;
        assert.equal(field.value, "retry");
        const accepted = input.submit();
        resolveReply(true);
        await accepted;
        assert.equal(field.value, "");
        const empty = input.submit();
        assert.equal(submitted.at(-1), "");
        resolveReply(true);
        await empty;
        field.value = "   ";
        const whitespace = input.submit();
        assert.equal(submitted.at(-1), "   ");
        resolveReply(true);
        await whitespace;
        field.value = "old";
        const replaced = input.submit();
        field.value = "new prompt value";
        resolveReply(false);
        await replaced;
        assert.equal(field.value, "new prompt value");
        input.dispose();
    }
    finally {
        global.document = previousDocument;
    }
    console.log("Request input model: rejection retention, empty replies, duplicate prevention and ownership.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
