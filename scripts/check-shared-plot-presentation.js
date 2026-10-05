"use strict";

const assert = require("node:assert/strict");
const { createPlotViewerPresentationState } = require("../dist/src/base-app/features/plot-viewer/plotViewerPresentationState");

// The same scenarios apply regardless of which host supplies resources/events.
for (const host of ["r", "webr"]) {
    const presentation = createPlotViewerPresentationState();
    assert.equal(presentation.getState().status, "waiting");
    const events = { status: "ready", providerId: host, events: [{
        type: "plot", createdAt: "2026-09-29T00:00:00Z",
        payload: { viewerUrl: "http://127.0.0.1:1234/plot", count: 1, upid: "fixture" }
    }] };
    assert.equal(presentation.presentRuntimeEvents(events).status, "ready");
    assert.equal(presentation.presentRuntimeEvents(events), null, "Do not present the same plot event twice.");
    assert.equal(presentation.getState().count, 1);

    const images = createPlotViewerPresentationState();
    const first = images.appendImages(["blob:fixture-first"]);
    assert.equal(first.count, 1);
    const second = images.appendImages(["blob:fixture-second"]);
    assert.deepEqual(second.urls, ["blob:fixture-first", "blob:fixture-second"]);
    assert.ok(second.renderToken > first.renderToken);
    assert.deepEqual(images.appendImages([]).urls, second.urls,
        "An empty capture does not erase available history.");
    images.retireImages();
    assert.equal(images.getState().status, "waiting");
    assert.deepEqual(images.getPayload().urls, [], "Retired image resources cannot be redisplayed.");
    assert.ok(images.appendImages(["blob:fixture-next"]).renderToken > second.renderToken,
        "Image retirement does not reuse render identity.");

    const pages = createPlotViewerPresentationState();
    pages.appendImages(["blob:page-one"], 1);
    assert.deepEqual(pages.appendImages(["blob:page-one-overlay"], 1).urls,
        ["blob:page-one-overlay"], "Drawing on a page replaces it instead of inventing history");
    assert.deepEqual(pages.appendImages(["blob:page-two", "blob:page-three"], 3).urls,
        ["blob:page-one-overlay", "blob:page-two", "blob:page-three"],
        "Multiple physical pages in one command remain separate history entries");
    assert.throws(() => pages.appendImages(["blob:missing-page"], 5), /contiguous/);
}

const checkCapturedPlotRetirement = async function() {
    const presentation = createPlotViewerPresentationState();
    const released = [];
    const closed = [];
    let finishEncoding;
    const encoding = new Promise(resolve => {
        finishEncoding = resolve;
    });
    const resources = {
        createUrl: async () => encoding,
        releaseUrls: urls => released.push(...urls),
        closeImages: images => closed.push(...images)
    };
    const images = [{ page: 1 }, { page: 2 }];
    const pending = presentation.receiveCapturedImages(images, 2, resources);

    presentation.retireImages();
    finishEncoding("blob:retired");

    assert.equal(await pending, null);
    assert.equal(presentation.getState().status, "waiting");
    assert.deepEqual(released, ["blob:retired"]);
    assert.deepEqual(closed, images, "All physical images close even when only one was encoded.");

    released.length = 0;
    closed.length = 0;
    let encoded = 0;
    resources.createUrl = async () => {
        encoded += 1;

        if (encoded === 2) {
            throw new Error("encoding failed");
        }

        return "blob:partial";
    };

    await assert.rejects(
        presentation.receiveCapturedImages(images, 2, resources),
        /encoding failed/
    );
    assert.deepEqual(released, ["blob:partial"]);
    assert.deepEqual(closed, images);
    assert.deepEqual(presentation.getPayload().urls, []);

    resources.createUrl = async image => `blob:page-${image.page}`;
    await presentation.receiveCapturedImages([{ page: 1 }], 1, resources);
    resources.createUrl = async () => "blob:overlay";
    const overlay = await presentation.receiveCapturedImages([{ page: 1 }], 1, resources);
    assert.deepEqual(presentation.getPayload().urls, ["blob:overlay"]);
    assert.ok(released.includes("blob:page-1"), "Superseded physical resources are released.");
    assert.equal(presentation.isCurrentPayload(overlay), true);
    assert.deepEqual(presentation.retireImages(), ["blob:overlay"]);
    assert.equal(presentation.isCurrentPayload(overlay), false,
        "Retirement between resource admission and host presentation rejects the old payload.");
};


const checkCapturedPlotReplacement = async function() {
    for (const outcome of ["late success", "late failure"]) {
        const presentation = createPlotViewerPresentationState();
        const released = [];
        const closed = [];
        let finishEncoding;
        let failEncoding;
        let secondEncodingStarted;
        const started = new Promise(resolve => {
            secondEncodingStarted = resolve;
        });
        const pendingEncoding = new Promise((resolve, reject) => {
            finishEncoding = resolve;
            failEncoding = reject;
        });
        const oldImages = [{ page: 1 }, { page: 2 }];
        const oldCapture = presentation.receiveCapturedImages(oldImages, 2, {
            createUrl: async function(image) {
                if (image.page === 1) {
                    return "blob:old-partial";
                }

                secondEncodingStarted();
                return pendingEncoding;
            },
            releaseUrls: urls => released.push(...urls),
            closeImages: images => closed.push(...images)
        });

        await started;
        presentation.retireImages();
        const replacementImage = { page: "replacement" };
        const replacement = await presentation.receiveCapturedImages([replacementImage], 1, {
            createUrl: async () => "blob:replacement",
            releaseUrls: urls => released.push(...urls),
            closeImages: images => closed.push(...images)
        });

        if (outcome === "late success") {
            finishEncoding("blob:old-late");
            assert.equal(await oldCapture, null);
            assert.deepEqual(released, ["blob:old-partial", "blob:old-late"]);
        }
        else {
            failEncoding(new Error("old encoding failed"));
            await assert.rejects(oldCapture, /old encoding failed/);
            assert.deepEqual(released, ["blob:old-partial"]);
        }

        assert.deepEqual(closed, [replacementImage, ...oldImages], outcome);
        assert.equal(presentation.isCurrentPayload(replacement), true, outcome);
        assert.deepEqual(presentation.getPayload().urls, ["blob:replacement"],
            outcome + " cannot release or overwrite the replacement plot");
    }
};


checkCapturedPlotRetirement().then(checkCapturedPlotReplacement).then(() => {
    console.log("Shared plot presentation cases passed; rendered dual-host acceptance remains separate.");
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
