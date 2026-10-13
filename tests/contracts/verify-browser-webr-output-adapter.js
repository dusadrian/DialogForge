"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(
    path.join(root, relativePath),
    "utf8"
);
const eventCore = read(
    "src/runtime/providers/r/r-sources/runtimeEventCore.R"
);
const transportCore = read(
    "src/runtime/providers/r/r-sources/runtimeTransportCore.R"
);
const sharedControl = read(
    "src/runtime/providers/webr/webRSharedRuntimeControl.ts"
);

assert.ok(
    eventCore.includes("runtime_collected_events")
        && transportCore.includes("output$events_json")
        && sharedControl.includes("runtime_transport_response_payload(")
        && sharedControl.includes("runtime_transport_result_json(")
        && sharedControl.includes("evalRString(")
        && !sharedControl.includes("captureR"),
    "WebR must transport the shared APP event stream without recapturing output"
);

console.log("browser APP output transport verified");
