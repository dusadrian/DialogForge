"use strict";

const fs = require("node:fs");

// temp passes literal paths it generated itself, never glob expressions.
const removeTrackedPath = function(file, options, callback) {
    fs.rm(file, {
        recursive: true,
        force: true,
        maxRetries: options.maxBusyTries
    }, callback);
};

removeTrackedPath.sync = function(file, options) {
    fs.rmSync(file, {
        recursive: true,
        force: true,
        maxRetries: options.maxBusyTries
    });
};

module.exports = removeTrackedPath;
