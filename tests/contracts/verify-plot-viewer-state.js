"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { plotViewerStateApi } = require("../../shared/shell-electron/external/plotViewerState");
assert.deepStrictEqual(plotViewerStateApi.createWaitingPlotViewerState(), {
    status: "waiting",
    url: "",
    count: 0,
    upid: "",
    message: "Waiting for a plot.",
    updatedAt: "1970-01-01T00:00:00.000Z"
});
assert.deepStrictEqual(plotViewerStateApi.createPlotViewerState("http://127.0.0.1:1234/live", new Date("2026-06-05T00:00:00.000Z")), {
    status: "ready",
    url: "http://127.0.0.1:1234/live",
    count: 1,
    upid: "",
    message: "Plot viewer is ready.",
    updatedAt: "2026-06-05T00:00:00.000Z"
});
assert.deepStrictEqual(plotViewerStateApi.createPlotViewerState({
    viewerUrl: "http://127.0.0.1:1234/live?token=test",
    count: 2,
    upid: "plot-2"
}, new Date("2026-06-05T00:00:00.000Z")), {
    status: "ready",
    url: "http://127.0.0.1:1234/live?token=test",
    count: 2,
    upid: "plot-2",
    message: "Plot viewer is ready.",
    updatedAt: "2026-06-05T00:00:00.000Z"
});
assert.deepStrictEqual(plotViewerStateApi.createPlotViewerState("file:///tmp/plot.html", new Date("2026-06-05T00:00:00.000Z")), {
    status: "invalid",
    url: "file:///tmp/plot.html",
    count: 0,
    upid: "",
    message: "Only http and https viewer URLs can be opened.",
    updatedAt: "2026-06-05T00:00:00.000Z"
});
assert.deepStrictEqual(plotViewerStateApi.createPlotSaveRequest({
    url: "http://127.0.0.1:1234/live",
    format: "svg"
}), {
    url: "http://127.0.0.1:1234/live",
    format: "svg"
});
assert.deepStrictEqual(plotViewerStateApi.createPlotSaveRequest({
    url: "http://127.0.0.1:1234/live",
    format: "png"
}), {
    url: "http://127.0.0.1:1234/live",
    format: "png"
});
assert.deepStrictEqual(plotViewerStateApi.createPlotSaveResult({
    status: "saved",
    filePath: "/tmp/plot.png",
    message: "Plot saved."
}), {
    status: "saved",
    filePath: "/tmp/plot.png",
    message: "Plot saved."
});
assert.deepStrictEqual(plotViewerStateApi.createPlotCopyResult({
    status: "copied",
    message: "Plot copied to clipboard."
}), {
    status: "copied",
    message: "Plot copied to clipboard."
});
console.log("Plot viewer state contract verified.");
