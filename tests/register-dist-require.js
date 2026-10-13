"use strict";

const Module = require("module");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

const distModuleRequest = function(request) {
    const prefixes = [
        "../../src/",
        "../../scripts/"
    ];
    const prefix = prefixes.find((candidate) => {
        return request.startsWith(candidate);
    });

    if (!prefix) {
        return "";
    }

    return path.join(
        process.env.DIALOGFORGE_DIST_DIR || path.join(rootDir, "dist"),
        request.slice("../../".length)
    );
};

Module._resolveFilename = function(request, parent, isMain, options) {
    const mappedRequest = distModuleRequest(request);

    if (mappedRequest) {
        return originalResolveFilename.call(
            this,
            mappedRequest,
            parent,
            isMain,
            options
        );
    }

    return originalResolveFilename.call(
        this,
        request,
        parent,
        isMain,
        options
    );
};
