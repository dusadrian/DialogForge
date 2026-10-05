"use strict";

// One physical-device scenario. Only image access differs between adapters.
exports.checkActualRuntimeGraphics = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw new Error(options.host + ": " + message);
        }
    };
    const states = [];
    const draw = async function(name, code) {
        const result = await options.execute(code, "answer");
        requireResult(result.outcome === "success", name + " evaluation failed: " + JSON.stringify(result));
        const state = await options.readState();
        states.push({ name, ...state });
        return state;
    };
    const first = await draw("first", 'par(mar=c(0,0,0,0)); plot.new(); plot.window(c(0,1),c(0,1),xaxs="i",yaxs="i"); rect(.1,.1,.3,.3,col="red",border=NA)');
    if (first.count !== 1 || !first.upid) {
        const details = options.readFailureDetails ? await options.readFailureDetails() : null;
        requireResult(false, "First physical page was not published: " + JSON.stringify({ first, details }));
    }
    const firstImage = await options.readImage(first);
    requireResult(firstImage.red > 0 && firstImage.width > 0 && firstImage.height > 0,
        "Actual first-page image did not contain the drawing");

    const overlay = await draw("indirect-overlay", 'local({ drawer <- function() segments(.6,.6,.9,.9,col="blue",lwd=4); drawer() })');
    requireResult(overlay.count === 1 && overlay.upid !== first.upid,
        "Indirect overlay changed history or missed its update");
    const overlayImage = await options.readImage(overlay);
    requireResult(overlayImage.red === firstImage.red && overlayImage.blue > 0,
        "Actual overlay lost the preceding pixels");

    const unchanged = await draw("unchanged", "invisible(1+1)");
    requireResult(unchanged.upid === overlay.upid, "An unchanged command republished its plot");
    const pages = await draw("multiple-identical-pages", 'plot(1:3,main="Identical page"); plot(1:3,main="Identical page")');
    requireResult(pages.count === 3 && pages.upid !== overlay.upid,
        "Identical content on separate physical pages was collapsed");
    const latest = await options.readImage(pages);
    requireResult(latest.width > 0 && latest.height > 0, "Latest physical page cannot be read");

    const failedClose = await draw("failed-close-followed-by-drawing", 'local({ dev.off <- function(...) stop("synthetic close refusal"); try(dev.off(),silent=TRUE); points(2,2,col="red",pch=19) })');
    requireResult(failedClose.count === 3 && failedClose.upid !== pages.upid,
        "A failed close retired the still-live drawing device");
    const external = await draw("closed-owned-external-pdf", 'dev.off(); pdf(NULL); plot(1:3,main="External PDF")');
    requireResult(external.upid === failedClose.upid && external.registered === 0,
        "A foreign device inherited an app publication");
    const reopened = await draw("owned-reopened", 'dev.off(); plot(1:3,main="Owned again")');
    requireResult(reopened.count === 1 && reopened.generation > first.generation,
        "Reopened app device reused the retired generation/history");
    requireResult((await options.readImage(reopened)).width > 0, "Reopened resource cannot be read");
    const closed = await draw("owned-closed", "dev.off()");
    requireResult(closed.registered === 0, "Closed app registration was retained");
    if (options.checkLowLevelClose) {
        const directClose = 'base::.External(get("C_devoff",asNamespace("grDevices")),as.integer(grDevices::dev.cur()))';
        const lowLevelOwner = await draw("low-level-owner", 'plot(1:3,main="Low-level owner")');
        const lowLevelClosed = await draw("low-level-close", directClose);
        requireResult(lowLevelClosed.registered === 0 && lowLevelClosed.upid === lowLevelOwner.upid,
            "Low-level close retained an owned registration");
        const lowLevelReopened = await draw("low-level-reopened", 'plot(1:3,main="Low-level reopened")');
        requireResult(lowLevelReopened.generation > lowLevelOwner.generation,
            "Low-level close/reopen reused the old owner generation");
        const foreignSameBackend = await draw("low-level-foreign-same-backend",
            directClose + "; " + options.openForeignDeviceCode + '; plot(1:3,main="Foreign same backend")');
        requireResult(foreignSameBackend.registered === 0
            && foreignSameBackend.upid === lowLevelReopened.upid,
            "Foreign same-backend device inherited a low-level-closed owner");
        const finalOwner = await draw("low-level-final-owner", 'dev.off(); plot(1:3,main="Final owner")');
        requireResult(finalOwner.generation > lowLevelReopened.generation,
            "Owned recovery after low-level foreign replacement failed");
    }
    if (options.foreignDriverPath) {
        await draw("foreign-callback-probe", 'local({ rt <- as.environment("DialogApp"); '
            + 'rt$graphics_test_probe <- getNativeSymbolInfo("replace_graphics_line", '
            + 'dyn.load(' + JSON.stringify(options.foreignDriverPath) + ')); invisible(NULL) })');
        const owner = await draw("foreign-callback-owner", 'plot(1:3,main="Callback owner")');
        const replaced = await draw("foreign-callback-replaced",
            '.Call(as.environment("DialogApp")$graphics_test_probe, TRUE); segments(1,1,3,3,col="red")');
        requireResult(replaced.registered === 0 && replaced.upid === owner.upid,
            "A foreign C drawing callback retained app ownership or published an image");
        const restored = await draw("foreign-callback-restored",
            '.Call(as.environment("DialogApp")$graphics_test_probe, FALSE); points(2,2,col="blue")');
        requireResult(restored.registered === 0 && restored.upid === owner.upid,
            "Restoring the callback silently resurrected a retired graphics owner");
        const recovered = await draw("foreign-callback-fresh-owner", 'dev.off(); plot(1:3,main="Fresh callback owner")');
        requireResult(recovered.generation > owner.generation && recovered.count === 1,
            "Fresh graphics after callback retirement did not acquire a new owner");
        requireResult((await options.readImage(recovered)).width > 0,
            "Fresh graphics after callback retirement has no readable resource");
        await draw("foreign-close-probe", 'local({ rt <- as.environment("DialogApp"); '
            + 'rt$graphics_close_probe <- getNativeSymbolInfo("replace_graphics_close", '
            + 'dyn.load(' + JSON.stringify(options.foreignDriverPath) + ')); invisible(NULL) })');
        const closeReplaced = await draw("foreign-close-replaced",
            '.Call(as.environment("DialogApp")$graphics_close_probe, TRUE); points(2,2,col="red")');
        requireResult(closeReplaced.registered === 0 && closeReplaced.upid === recovered.upid,
            "A foreign close callback retained app publication ownership");
        requireResult((await options.readImage(recovered)).width > 0,
            "Retirement discarded the preceding published resource");
        const closeRestored = await draw("foreign-close-restored",
            '.Call(as.environment("DialogApp")$graphics_close_probe, FALSE); points(2,2,col="blue")');
        requireResult(closeRestored.registered === 0 && closeRestored.upid === recovered.upid,
            "Restoring a close callback resurrected a retired graphics owner");
        const foreignClosed = await draw("foreign-close-forwarded",
            '.Call(as.environment("DialogApp")$graphics_close_probe, TRUE); dev.off(); '
            + 'stopifnot(grDevices::dev.cur() == 1L)');
        requireResult(foreignClosed.registered === 0,
            "The foreign close callback retained a physical owner");
        const closeRecovered = await draw("foreign-close-fresh-owner", 'plot(1:3,main="Fresh close owner")');
        requireResult(closeRecovered.generation > recovered.generation && closeRecovered.count === 1,
            "Recovery after a foreign close reused the retired generation");
        requireResult((await options.readImage(closeRecovered)).width > 0,
            "Recovery after a foreign close has no readable resource");
        await draw("foreign-callback-probe-released", 'local({ rt <- as.environment("DialogApp"); '
            + 'rm("graphics_test_probe", "graphics_close_probe", envir=rt); dyn.unload('
            + JSON.stringify(options.foreignDriverPath) + ') })');
    }
    console.log(options.host + ": actual shared graphics scenario passed");
    return { host: options.host, states, firstImage, overlayImage,
        lowLevelCloseChecked: Boolean(options.checkLowLevelClose),
        foreignCallbackChecked: Boolean(options.foreignDriverPath), renderedViewerChecked: false };
};
