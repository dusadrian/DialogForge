"use strict";

const { createHelpAcceptanceGate } = require("./help-request-acceptance-gate");
const composition = require("../dist/src/shell-electron/external/externalWindowComposition");
const createComposition = composition.createExternalWindowComposition;

globalThis.helpAcceptanceGate = createHelpAcceptanceGate();
composition.createExternalWindowComposition = function(options) {
    const start = options.startHelpServer;
    options.startHelpServer = async function() {
        const gate = globalThis.helpAcceptanceGate;
        const held = gate.armed;
        if (held) {
            gate.armed = false;
        }
        const port = await start();
        return held ? gate.hold(port, { actualHelpServerPort: port }) : port;
    };
    return createComposition(options);
};

require("../dist/scripts/electron-main.js");
