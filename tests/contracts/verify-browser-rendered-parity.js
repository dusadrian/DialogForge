"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");


const projectRoot = path.resolve(__dirname, "../..");
const surfaceSource = fs.readFileSync(
    path.join(projectRoot, "shared/shell-web/browserDialogSurface.ts"),
    "utf8"
);
const dialogBuilderHtml = fs.readFileSync(
    path.join(projectRoot, "shared/base-app/pages/dialogBuilder.html"),
    "utf8"
);


const assertSourceContract = function() {
    assert.ok(
        surfaceSource.includes("dialogforge-web-dialog-layer"),
        "Browser dialog surface must keep the modal overlay class."
    );
    assert.ok(
        surfaceSource.includes("dialogforge-web-dialog__frame"),
        "Browser dialog surface must keep the frame class."
    );
    assert.ok(
        surfaceSource.includes("dialogBuilder.html"),
        "Browser dialog surface must load the existing dialog builder page."
    );
    assert.ok(
        dialogBuilderHtml.includes('id="paper"'),
        "Dialog builder must keep the dialog paper container."
    );
    assert.ok(
        dialogBuilderHtml.includes('id="dialogQuickActions"'),
        "Dialog builder must keep the quick-action controls."
    );
    assert.ok(
        dialogBuilderHtml.includes("dialogBuilder.css"),
        "Dialog builder must keep its reference stylesheet."
    );
    assert.ok(
        dialogBuilderHtml.includes("appCodicon.css"),
        "Dialog builder must keep codicon styling."
    );
};


const escapeHtmlAttribute = function(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;");
};


const createRenderedProbeHtml = function() {
    const frameHtml = dialogBuilderHtml.replace(
        /<script[\s\S]*?<\/script>/g,
        ""
    );

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{margin:0;width:100%;height:100%;}
.dialogforge-web-dialog-layer{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.22);}
.dialogforge-web-dialog{box-sizing:border-box;background:#fff;border:1px solid #bdbdbd;box-shadow:0 10px 28px rgba(0,0,0,.24);display:flex;flex-direction:column;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);width:640px;height:510px;}
.dialogforge-web-dialog__titlebar{height:30px;display:flex;align-items:center;justify-content:space-between;padding:0 8px 0 10px;border-bottom:1px solid #dedede;background:#f5f5f5;color:#222;font:12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
.dialogforge-web-dialog__title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}
.dialogforge-web-dialog__close{width:24px;height:24px;border:0;background:transparent;color:#333;font:18px/20px system-ui,sans-serif;cursor:pointer;}
.dialogforge-web-dialog__frame{border:0;display:block;flex:1 1 auto;width:100%;min-height:120px;background:#fff;}
</style>
</head>
<body>
<div class="dialogforge-web-dialog-layer" data-dialog-id="frequencies">
<section class="dialogforge-web-dialog" role="dialog" aria-modal="true">
<div class="dialogforge-web-dialog__titlebar">
<div class="dialogforge-web-dialog__title">Frequencies</div>
<button class="dialogforge-web-dialog__close" type="button" aria-label="Close">x</button>
</div>
<iframe
    class="dialogforge-web-dialog__frame"
    title="Frequencies"
    srcdoc="${escapeHtmlAttribute(frameHtml)}"
></iframe>
</section>
</div>
</body>
</html>`;
};


const verifyRenderedSurface = async function() {
    const browser = await chromium.launch();

    try {
        const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

        await page.setContent(createRenderedProbeHtml(), { waitUntil: "domcontentloaded" });

        const dialog = page.locator(".dialogforge-web-dialog");
        const frame = page.frameLocator(".dialogforge-web-dialog__frame");
        const dialogBox = await dialog.boundingBox();
        const layerBox = await page.locator(".dialogforge-web-dialog-layer").boundingBox();
        const styleProbe = await dialog.evaluate((node) => {
            const style = window.getComputedStyle(node);

            return {
                backgroundColor: style.backgroundColor,
                borderTopColor: style.borderTopColor,
                display: style.display
            };
        });

        assert.ok(layerBox, "Browser modal overlay must be rendered.");
        assert.ok(dialogBox, "Browser dialog container must be rendered.");
        assert.ok(dialogBox.width >= 600, "Browser dialog width must preserve the expected modal scale.");
        assert.ok(dialogBox.height >= 480, "Browser dialog height must preserve the expected modal scale.");
        assert.strictEqual(styleProbe.display, "flex");
        assert.strictEqual(styleProbe.backgroundColor, "rgb(255, 255, 255)");
        assert.strictEqual(styleProbe.borderTopColor, "rgb(189, 189, 189)");

        await assert.doesNotReject(async () => {
            await frame.locator("#paper").waitFor({ state: "attached" });
        });
        await assert.doesNotReject(async () => {
            await frame.locator("#dialogQuickActions").waitFor({ state: "attached" });
        });
        await assert.doesNotReject(async () => {
            await frame.locator("#dialogSendToConsole").waitFor({ state: "attached" });
        });
        await assert.doesNotReject(async () => {
            await frame.locator("#dialogSendToScriptEditor").waitFor({ state: "attached" });
        });

        const screenshot = await page.screenshot();
        assert.ok(
            screenshot.length > 2000,
            "Rendered browser surface screenshot should not be blank."
        );
    } finally {
        await browser.close();
    }
};


(async () => {
    assertSourceContract();
    await verifyRenderedSurface();
    console.log("Browser rendered parity surface verified.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
