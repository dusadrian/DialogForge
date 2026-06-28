"use strict";
const productContribution = {
    id: "FixtureProduct",
    dialogForgeProductContract: 1,
    createDialogExternalCallHosts: function() {
        return {
            fixture: {
                supports: function(name) {
                    return name === "fixture.echo";
                },
                call: async function(name) {
                    return {
                        status: name === "fixture.echo" ? "ready" : "unsupported",
                        name,
                        value: name === "fixture.echo" ? "ok" : null,
                        message: ""
                    };
                }
            }
        };
    }
};
module.exports = {
    productContribution,
    default: productContribution
};
