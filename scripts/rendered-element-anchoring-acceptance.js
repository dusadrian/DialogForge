"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { build } = require("esbuild");
const { chromium } = require("playwright");
const { PNG } = require(path.join(path.dirname(require.resolve("playwright-core")), "lib/utilsBundle.js"));

const root = path.resolve(__dirname, "..");
const fixturePath = path.join(__dirname, "fixtures", "addvariables-anchoring");
const options = {
    bundle: "",
    only: "",
    report: path.join(root, "artifacts/dialog-element-anchoring/current.json")
};
let renderedNames = [];
for (let index = 2; require.main === module && index < process.argv.length; index += 2) {
    const argument = process.argv[index];
    const value = process.argv[index + 1];
    if (!["--bundle", "--case", "--report"].includes(argument) || !value) {
        throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    options[argument === "--case" ? "only" : argument.slice(2)] = value;
}
if (options.only && !["authentic", "controls", "groups", "invalid", "malformed"].includes(options.only)) {
    throw new Error(`Unknown rendered case: ${options.only}`);
}

const near = function(actual, expected, context) {
    assert.ok(Math.abs(actual - expected) <= 0.6, `${context}: expected ${expected}, rendered ${actual}`);
};

const settle = async function(frame) {
    await frame.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
};

const buildPage = async function(extraSource = [], buildOptions = {}) {
    if (options.bundle) {
        return fs.readFileSync(options.bundle, "utf8");
    }
    const result = await build({
        stdin: {
            resolveDir: root,
            contents: [
                'import "./src/dialog-runtime/renderer/modules/dialogBuilderInterface";',
                'import { localizeDialogSource } from "./src/dialog-runtime/dialog-builder/dialogSourceLocalization";',
                'window.elementAnchorHost.localize = localizeDialogSource;',
                'import { normalizeNewDialogForRuntime } from "./src/dialog-runtime/renderer/modules/dialogAdapter";',
                'window.elementAnchorHost.normalize = normalizeNewDialogForRuntime;',
                'import { createDialogRenderer } from "@dialogcreator/renderer";',
                'window.elementAnchorHost.createRenderer = createDialogRenderer;'
            ].concat(extraSource).join("\n")
        },
        bundle: true, format: "esm", platform: "browser", target: "es2022", write: false,
        plugins: buildOptions.plugins || []
    });
    return result.outputFiles[0].text;
};

const openPage = async function(page, bundle) {
    await page.addInitScript(() => {
        const listeners = new Map();
        const host = {
            ready: false, created: false, errors: [], logs: [],
            updateWorkspace: async function(data) {
                for (const listener of listeners.get("dialogIncomingData") || []) await listener(data);
            },
            deliver: async function(source, locale, extras = {}) {
                host.created = false;
                host.errors = [];
                host.logs = [];
                if (locale) {
                    host.localize(source, locale);
                }
                for (const listener of listeners.get("dialogCreated") || []) {
                    await listener({ dialogID: source.id || source.properties.name, data: source, ...extras });
                }
            }
        };
        window.elementAnchorHost = host;
        window.dialogForge = { dialogRuntime: {
            sendTo: function(_target, channel, ...values) {
                if (channel === "dialogRuntime:ready") {
                    host.ready = true;
                } else if (channel === "dialogCreated") {
                    host.created = true;
                } else if (channel === "showErrorBox") {
                    host.errors.push(values);
                } else if (/log/i.test(channel)) {
                    host.logs.push(values);
                }
            },
            invoke: async function(channel) {
                throw new Error(`Rendered attachment fixture unexpectedly requested a host operation: ${channel}`);
            },
            on: function(channel, listener) {
                const registered = listeners.get(channel) || [];
                registered.push(listener);
                listeners.set(channel, registered);
            },
            once: function(channel, listener) {
                const once = function(...values) {
                    listeners.set(channel, listeners.get(channel).filter((item) => item !== once));
                    listener(...values);
                };
                this.on(channel, once);
            }
        } };
    });
    await page.route("http://dialog-anchors.test/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/fixture") {
            await route.fulfill({ contentType: "text/html", body:
                '<iframe id="dialog" title="Actual dialog renderer" src="/src/base-app/pages/dialogBuilder.html" style="border:0;width:1300px;height:1000px"></iframe>' });
            return;
        }
        if (url.pathname === "/browser-esm/dialogBuilder.js") {
            await route.fulfill({ contentType: "text/javascript", body: bundle });
            return;
        }
        if (url.pathname === "/api/product-dialog-runtime.js") {
            await route.fulfill({ contentType: "text/javascript", body: "export {};" });
            return;
        }
        const rendererPrefix = '/src/base-app/pages/dialog-renderer/';
        const source = url.pathname.startsWith(rendererPrefix)
            ? path.resolve(root, 'node_modules/@dialogcreator/renderer', url.pathname.slice(rendererPrefix.length))
            : path.resolve(root, "." + url.pathname);
        if (source.startsWith(root + path.sep) && fs.existsSync(source)) {
            const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".ttf": "font/ttf" };
            await route.fulfill({ contentType: types[path.extname(source)] || "application/octet-stream", body: fs.readFileSync(source) });
            return;
        }
        await route.fulfill({ status: 404, body: "Missing rendered attachment resource" });
    });
    await page.goto("http://dialog-anchors.test/fixture");
    const frame = page.frame({ url: /dialogBuilder\.html$/ });
    assert.ok(frame);
    await frame.waitForFunction(() => window.elementAnchorHost.ready);
    assert.equal(await frame.evaluate(async () => (await document.fonts.load("12px Inter")).length), 1);
    return frame;
};

const render = async function(frame, source, locale) {
    await frame.evaluate(async ({ source, locale }) => window.elementAnchorHost.deliver(source, locale), { source, locale });
    await settle(frame);
    assert.equal(await frame.evaluate(() => window.elementAnchorHost.created), true, "Actual runtime acknowledges creation");
    assert.deepEqual(await frame.evaluate(() => window.elementAnchorHost.errors), [], "Actual actions must not report host/runtime errors");
    renderedNames = source.elements.filter((item) => item.type !== "Group").map((item) => item.nameid);
    assert.equal(await frame.locator("#paper .element-wrapper").count(), renderedNames.length,
        "The real builders must create every authored individual control in source order");
};

const control = function(frame, name) {
    const index = renderedNames.indexOf(name);
    assert.notEqual(index, -1, `The authored fixture must contain ${name}`);
    // Earlier builders do not consistently expose names on their hosts. Source
    // order selects their real top-level nodes without changing the renderer.
    return frame.locator(`#paper .element-wrapper[data-nameid="${name}"]`);
};

const box = async function(frame, name) {
    return control(frame, name).evaluate((node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    });
};

const relation = async function(frame, element, elements, context) {
    const target = elements.find((target) => target.id === element.anchorTarget);
    assert.ok(target, `${context}: target must exist in the authored fixture`);
    const from = await box(frame, element.nameid);
    const to = await box(frame, target.nameid);
    assert.ok(from.width > 0 && from.height > 0, `${context}: ${element.type} has actual rendered dimensions`);
    const side = element.anchorPosition || "left";
    const fraction = { start: 0, middle: 0.5, end: 1 }[element.anchorAlign || "middle"];
    const gap = element.anchorGap ?? 10;
    const offset = element.anchorOffset ?? 0;
    const left = side === "left" ? to.left - gap - from.width
        : side === "right" ? to.right + gap : to.left + (to.width - from.width) * fraction + offset;
    const top = side === "above" ? to.top - gap - from.height
        : side === "below" ? to.bottom + gap : to.top + (to.height - from.height) * fraction + offset;
    near(from.left, left, `${context}: ${element.nameid} left`);
    near(from.top, top, `${context}: ${element.nameid} top`);
};

const idle = async function(frame, context) {
    const count = await frame.evaluate(async () => {
        let changes = 0;
        const observer = new MutationObserver((records) => { changes += records.length; });
        document.querySelectorAll(".element-wrapper").forEach((node) => observer.observe(node, { attributes: true, attributeFilter: ["style"] }));
        for (let frame = 0; frame < 8; frame += 1) {
            await new Promise(requestAnimationFrame);
        }
        observer.disconnect();
        return changes;
    });
    assert.equal(count, 0, `${context}: no idle layout drift or observer loop`);
};

const inkBounds = function(png, region) {
    let left = Infinity;
    let right = -Infinity;
    for (let y = Math.max(0, Math.floor(region.top)); y < Math.min(png.height, Math.ceil(region.bottom)); y += 1) {
        for (let x = Math.max(0, Math.floor(region.left)); x < Math.min(png.width, Math.ceil(region.right)); x += 1) {
            const index = (y * png.width + x) * 4;
            if (Math.min(png.data[index], png.data[index + 1], png.data[index + 2]) < 230) {
                left = Math.min(left, x);
                right = Math.max(right, x + 1);
            }
        }
    }
    assert.ok(Number.isFinite(left), "Actual screenshot region contains painted pixels");
    return { left, right };
};

const checkAuthentic = async function(frame, report) {
    const original = JSON.parse(fs.readFileSync(path.join(fixturePath, "dialog.json"), "utf8"));
    original.customJS = fs.readFileSync(path.join(fixturePath, "actions.js"), "utf8");
    const expected = { en_US: [99, ["By key variables"]], el_GR: [95, ["Με μεταβλητές", "κλειδιά"]], fr_FR: [107, ["Par variables clés"]], de_DE: [113, ["Nach", "Schlüsselvariablen"]] };
    for (const locale of ["el_GR", "en_US", "de_DE", "fr_FR", "el_GR"]) {
        const source = structuredClone(original);
        await render(frame, source, locale);
        const label = await box(frame, "label_bykeys");
        const radio = await box(frame, "by_order");
        const text = await control(frame, "label_bykeys").evaluate((node) => {
            const span = node.querySelector(".smart-label-text");
            const range = document.createRange();
            range.selectNodeContents(span);
            const contents = [];
            for (let index = 0; index < span.firstChild.length; index += 1) {
                const character = document.createRange();
                character.setStart(span.firstChild, index);
                character.setEnd(span.firstChild, index + 1);
                const rect = Array.from(character.getClientRects()).find((r) => r.width > 0);
                if (!rect) {
                    continue;
                }
                let line = contents.find((line) => Math.abs(line.top - rect.top) < 0.5);
                if (!line) {
                    line = { value: "", top: rect.top };
                    contents.push(line);
                }
                line.value += span.textContent[index];
            }
            const host = node.getBoundingClientRect();
            return {
                value: span.textContent,
                contents: contents.map((line) => line.value.trim()),
                host: { left: host.left, right: host.right, top: host.top, bottom: host.bottom },
                lines: Array.from(range.getClientRects()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }))
            };
        });
        report.push({ case: "authentic", locale, label, radio, text });
        near(label.width, expected[locale][0], `DC-qualified AddVariables ${locale}: visible-line fitted label width`);
        assert.equal(text.value, expected[locale][1].join(" "));
        assert.deepEqual(text.contents, expected[locale][1], `${locale}: original translated words and wrapping remain intact`);
        assert.equal(text.lines.length, expected[locale][1].length, `${locale}: full translated line count is preserved`);
        for (const line of text.lines) {
            assert.ok(line.left >= text.host.left + 1.9 && line.right <= text.host.right - 1.9,
                `${locale}: all translated glyph advances fit inside the visible label host`);
        }
        near(radio.left - label.right, 10, `${locale}: Radio attachment box gap`);
        near(radio.top + radio.height / 2 - label.top - label.height / 2, -1, `${locale}: Middle and offset`);
        for (const element of source.elements.filter((element) => element.anchorTarget)) {
            await relation(frame, element, source.elements, `Actual AddVariables ${locale}`);
        }
        const paper = await frame.locator("#paper").evaluate((node) => {
            const r = node.getBoundingClientRect();
            return { left: r.left, top: r.top };
        });
        const pngBytes = await frame.locator("#paper").screenshot();
        const png = PNG.sync.read(pngBytes);
        const local = (r) => ({ left: r.left - paper.left, right: r.right - paper.left, top: r.top - paper.top, bottom: r.bottom - paper.top });
        const textInk = inkBounds(png, local(label));
        const radioInk = inkBounds(png, local(radio));
        const paintedGap = radioInk.left - textInk.right;
        assert.ok(paintedGap >= 13 && paintedGap <= 17, `${locale}: actual painted gap should match Creator's normal 15px allowance, rendered ${paintedGap}`);
        if (process.env.DIALOGFORGE_ANCHOR_SCREENSHOTS) {
            fs.writeFileSync(`${process.env.DIALOGFORGE_ANCHOR_SCREENSHOTS}-${locale}.png`, pngBytes);
        }
        report[report.length - 1].paintedGap = paintedGap;
        await control(frame, "by_order").locator(".custom-radio").click();
        assert.equal(await control(frame, "by_order").locator(".native-radio").isChecked(), true,
            `${locale}: the authentic matching-mode radio must respond to a click`);
        await control(frame, "b_reset").locator(".smart-button").click();
        await settle(frame);
        assert.equal(await control(frame, "by_keys").locator(".native-radio").isChecked(), true,
            `${locale}: authentic Reset restores the key matching mode`);
        assert.equal(await control(frame, "by_order").locator(".native-radio").isChecked(), false);
        assert.deepEqual(await box(frame, "label_bykeys"), label, `${locale}: authentic Reset preserves the label attachment geometry`);
        assert.deepEqual(await box(frame, "by_order"), radio, `${locale}: authentic Reset preserves the radio attachment geometry`);
        await idle(frame, `Actual AddVariables ${locale}`);
    }
};

const shapes = {
    Button: { width: 90, height: 26, label: "Button" }, Input: { width: 100, height: 30, value: "Input" },
    Select: { width: 100, value: "One,Two" }, Checkbox: { size: 18, isChecked: false },
    Radio: { size: 18, group: "mixed_radio", isSelected: false },
    Counter: { minval: 1, startval: 2, maxval: 999999, space: 4, updownsize: 8 },
    Slider: { width: 80, height: 3, direction: "horizontal", handlesize: 8, handleshape: "triangle", handlepos: 50 },
    Label: { value: "Caption", maxWidth: 85, lineClamp: 2, align: "left", valign: "top" },
    Separator: { width: 80, height: 2, direction: "horizontal" },
    Container: { width: 110, height: 60, selection: "single", itemType: "any" },
    Choice: { width: 110, height: 60, items: "One,Two", ordering: "no", orientation: "vertical", align: "left" }
};

const element = function(id, type, properties = {}) {
    return { id, nameid: id, type, left: 45, top: 45, isVisible: true, isEnabled: true, ...shapes[type], ...properties };
};

const anchor = function(target, position = "right", gap = 10, align = "middle", offset = 0) {
    return { anchorTarget: target, anchorPosition: position, anchorGap: gap, anchorAlign: align, anchorOffset: offset };
};

const dialog = function(name, elements, customJS = "") {
    return { id: name, properties: { name, title: name, width: 1200, height: 900, fontSize: 12, language: "en_US" }, elements, syntax: {}, customJS };
};

const mixedDialog = function() {
    return dialog("MixedElementAttachments", [
        element("tail", "Select", anchor("bridge_button", "below", -2.5, "end", 0.1)),
        element("bridge_button", "Button", anchor("bridge_label", "right", 9, "end", 1)),
        element("bridge_label", "Label", { value: "Reference", ...anchor("hub", "right", 12) }),
        element("hub", "Input", { left: 450.2, top: 390.1, width: 110, height: 42 }),
        ...Object.keys(shapes).map((type, index) => element(`source_${type.toLowerCase()}`, type,
            anchor("hub", ["left", "right", "above", "below"][index % 4], index === 0 ? -1.25 : 8.2, ["start", "middle", "end"][index % 3], (index - 5) * 40 + 0.1))),
        element("counter_follower", "Label", { value: "Counter follower", ...anchor("source_counter", "right", 3) }),
        element("hidden_root", "Radio", { left: 70.2, top: 700.1, size: 14, group: "hidden_group", isVisible: false, isSelected: true }),
        element("hidden_peer", "Radio", { left: 70, top: 750, group: "hidden_group", isSelected: false }),
        element("hidden_caption", "Label", { value: "Hidden target", ...anchor("hidden_root", "right", 10) }),
        element("rotated", "Label", { value: "Με μεταβλητές κλειδιά", maxWidth: 120, lineClamp: 2, rotate: 90, ...anchor("hub", "below", 35, "middle", 150) }),
        element("overflow", "Label", { value: "A long translated paragraph with many words which must overflow more than two lines and retain its ellipsis at the maximum width", maxWidth: 120, lineClamp: 2, ...anchor("hub", "below", 50, "middle", -200) }),
        element("b_change", "Button", { left: 700, top: 800, width: 140, label: "Change values" }),
        element("b_hide", "Button", { left: 860, top: 800, width: 140, label: "Hide targets" }),
        element("b_show", "Button", { left: 1020, top: 800, width: 140, label: "Show targets" })
    ], [
        "onClick(b_change, () => { setValue(bridge_label, 'Με μεταβλητές κλειδιά'); setValue(source_counter, 123456); setLabel(b_change, 'Changed'); });",
        "onClick(b_hide, () => { hide(hub); hide(hidden_caption); setValue(hidden_caption, 'Changed while hidden'); setLabel(b_hide, isChecked(hidden_root) ? 'Selected' : 'Lost'); });",
        "onClick(b_show, () => { show(hub); show(hidden_root); show(hidden_caption); setLabel(b_show, 'Shown'); });"
    ].join("\n"));
};

const checkMixed = async function(frame, report) {
    const source = mixedDialog();
    await render(frame, source);
    assert.equal(await control(frame, "hidden_root").locator(".native-radio").isChecked(), true,
        "Measuring a hidden target must retain its native selected state");
    assert.equal(await control(frame, "hidden_peer").locator(".native-radio").isChecked(), false);
    const visibleAnchors = source.elements.filter((item) => item.anchorTarget && item.anchorTarget !== "hidden_root");
    for (const item of visibleAnchors) {
        await relation(frame, item, source.elements, "All eleven individual types/reversed chain");
    }
    await control(frame, "hub").evaluate((node) => {
        node.style.left = "480.45px";
        node.style.top = "405.35px";
        node.style.width = "135.5px";
        node.style.height = "60.25px";
    });
    await settle(frame);
    for (const item of visibleAnchors) {
        await relation(frame, item, source.elements, "Observed host move/resize reflows the complete graph");
    }
    near((await box(frame, "rotated")).height, 95, "Rotated Greek label uses its fitted width on the rotated axis");
    near((await box(frame, "overflow")).width, 120, "Clamped overflow keeps the maximum width for ellipsis");
    near((await box(frame, "overflow")).height, 29, "Clamped overflow keeps a two-line box");
    const hiddenCaption = await box(frame, "hidden_caption");
    const before = await box(frame, "tail");
    await control(frame, "b_change").locator(".smart-button").click();
    await settle(frame);
    assert.equal(await control(frame, "b_change").locator(".smart-button-text").textContent(), "Changed");
    assert.equal(await control(frame, "source_counter").locator(".counter-value").textContent(), "123456");
    for (const item of visibleAnchors) {
        await relation(frame, item, source.elements, "Public value changes reflow dependencies");
    }
    assert.notDeepEqual(await box(frame, "tail"), before, "A public label value change must move downstream controls");
    const branch = await box(frame, "bridge_label");
    await control(frame, "b_hide").locator(".smart-button").click();
    await settle(frame);
    assert.equal(await control(frame, "b_hide").locator(".smart-button-text").textContent(), "Selected", "Measuring initially hidden radios must preserve native selection");
    assert.equal(await control(frame, "hub").isVisible(), false);
    assert.equal(await control(frame, "hidden_caption").isVisible(), false, "A value update must not reveal a hidden attached source");
    assert.deepEqual(await box(frame, "bridge_label"), branch, "Hiding a target preserves its measurable attachment geometry");
    await control(frame, "b_show").locator(".smart-button").click();
    await settle(frame);
    assert.equal(await control(frame, "hidden_caption").isVisible(), true);
    assert.equal(await control(frame, "hidden_root").locator(".native-radio").isChecked(), true);
    assert.equal(await control(frame, "hidden_peer").locator(".native-radio").isChecked(), false);
    assert.equal(await control(frame, "hidden_caption").locator(".smart-label-text").textContent(), "Changed while hidden");
    for (const item of source.elements.filter((item) => item.anchorTarget)) {
        await relation(frame, item, source.elements, "Show targets restores the same graph");
    }
    const shownCaption = await box(frame, "hidden_caption");
    near(shownCaption.left, hiddenCaption.left, "Initially hidden target yields the correct first attachment position");
    near(shownCaption.top + shownCaption.height / 2, hiddenCaption.top + hiddenCaption.height / 2, "Hidden label text change preserves attachment center");
    await idle(frame, "Fractional mixed graph after real API actions");
    report.push({ case: "mixed", sourceTypes: Object.keys(shapes), tail: await box(frame, "tail") });
};

const checkGroups = async function(frame, report) {
    const source = dialog("GroupedAttachments", [
        { id: "group_one", type: "Group", nameid: "group_one", left: 100, top: 100, elementIds: ["001", "group_label", "group_tail"] },
        element("group_tail", "Radio", { left: 350, top: 170, ...anchor("group_label", "below", -0.2, "end", 0.1) }),
        element("group_label", "Label", { left: 250, top: 140, value: "Group target", ...anchor("001", "right", 7) }),
        element("001", "Input", { nameid: "opaque_root", left: 140.2, top: 140.1, width: 90, height: 30 }),
        element("legacy_absolute", "Separator", { left: 30.2, top: 40.1, width: 80 })
    ]);
    await render(frame, source);
    const legacy = await box(frame, "legacy_absolute");
    for (const item of source.elements.filter((item) => item.anchorTarget)) {
        await relation(frame, item, source.elements, "Same-group reversed chain and opaque stable ID");
    }
    await control(frame, "opaque_root").evaluate((node) => {
        node.style.left = "165.55px";
        node.style.top = "160.35px";
        node.style.width = "130.25px";
    });
    await settle(frame);
    for (const item of source.elements.filter((item) => item.anchorTarget)) {
        await relation(frame, item, source.elements, "Same-group target geometry change");
    }
    assert.deepEqual(await box(frame, "legacy_absolute"), legacy, "Legacy absolute elements stay at their authored position");
    await idle(frame, "Grouped fractional graph");
    report.push({ case: "groups", tail: await box(frame, "group_tail") });
};

const checkInvalidGraphs = async function(frame, report) {
    const source = dialog("ExistingInvalidAttachments", [
        element("cycle_a", "Input", { left: 70, top: 70, ...anchor("cycle_b") }),
        element("cycle_b", "Button", { left: 230, top: 70, ...anchor("cycle_c") }),
        element("cycle_c", "Checkbox", { left: 400, top: 70, ...anchor("cycle_a") }),
        element("cycle_dependent", "Select", { left: 70, top: 130, ...anchor("cycle_a") }),
        element("missing", "Label", { left: 70, top: 210, ...anchor("not_present") }),
        element("cross_parent", "Input", { left: 70, top: 280, ...anchor("group_root") }),
        { id: "invalid_group", type: "Group", nameid: "invalid_group", left: 500, top: 100, elementIds: ["group_root", "group_cross"] },
        element("group_root", "Input", { left: 530, top: 140, width: 100 }),
        element("group_cross", "Button", { left: 530, top: 200, ...anchor("valid_root") }),
        element("valid_root", "Input", { left: 650.2, top: 500.1, width: 110, height: 40 }),
        element("valid_branch", "Label", { left: 850, top: 500, value: "Independent valid branch", ...anchor("valid_root", "right", 10) })
    ]);
    await render(frame, source);
    const invalid = ["cycle_a", "cycle_b", "cycle_c", "cycle_dependent", "missing", "cross_parent", "group_cross"];
    const warning = frame.locator(".element-anchor-warning");
    await warning.waitFor({ state: "visible" });
    const text = await warning.textContent();
    assert.match(text, /cycle/i, "Existing cycle is diagnosed visibly");
    assert.match(text, /not_present|not found|missing/i, "Missing target is diagnosed visibly");
    assert.match(text, /parent|group/i, "Cross-parent target is diagnosed visibly");
    for (const name of invalid) {
        assert.ok(await control(frame, name).evaluate((node) => node.classList.contains("element-anchor-invalid")), `${name}: invalid or dependent control is highlighted`);
    }
    const before = await Promise.all(invalid.map((name) => box(frame, name)));
    await relation(frame, source.elements.find((item) => item.id === "valid_branch"), source.elements, "Valid branch beside invalid graph");
    await control(frame, "valid_root").evaluate((node) => {
        node.style.left = "680.4px";
        node.style.width = "140.6px";
    });
    await settle(frame);
    await relation(frame, source.elements.find((item) => item.id === "valid_branch"), source.elements, "Valid branch updates independently beside invalid graph");
    await idle(frame, "Invalid graph and dependencies");
    assert.deepEqual(await Promise.all(invalid.map((name) => box(frame, name))), before,
        "Invalid controls retain authored/last positions without layout drift");
    if (process.env.DIALOGFORGE_ANCHOR_SCREENSHOTS) {
        await frame.locator("body").screenshot({ path: `${process.env.DIALOGFORGE_ANCHOR_SCREENSHOTS}-invalid.png` });
    }
    report.push({ case: "invalid-runtime-graph", warning: text, frozen: before });
};

const checkMalformedMetadata = async function(frame, report) {
    const original = await frame.locator("#paper").innerHTML();
    const mutations = [
        { anchorTarget: 12 },
        { anchorGap: null },
        { anchorPosition: "sideways" },
        { anchorAlign: "center" },
        { anchorOffset: "not a distance" }
    ];
    const rejected = [];
    for (const mutation of mutations) {
        const source = dialog("MalformedAttachment", [
            element("malformed_source", "Input", { ...anchor("malformed_target"), ...mutation }),
            element("malformed_target", "Button", { left: 250, top: 150 })
        ]);
        const message = await frame.evaluate(async (source) => {
            try {
                await window.elementAnchorHost.deliver(source);
                return "";
            } catch (error) {
                return error.message;
            }
        }, source);
        assert.match(message, /anchor|attachment/i, "Malformed active attachment values must be rejected explicitly");
        assert.equal(await frame.locator("#paper").innerHTML(), original,
            "Malformed metadata must be rejected before clearing or coercing the existing rendered dialog");
        rejected.push({ mutation, message });
    }
    report.push({ case: "malformed-active-metadata", rejected });
};

const main = async function() {
    fs.mkdirSync(path.dirname(options.report), { recursive: true });
    const bundle = await buildPage();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1340, height: 1040 }, deviceScaleFactor: 1 });
    const errors = [];
    const hash = (data) => createHash("sha256").update(data).digest("hex");
    const report = {
        status: "running",
        coverage: "Real shared dialogBuilder.html, adapter, runtime, controls, CSS and fonts; transport supplied; no R/full shell/native window.",
        sources: {
            renderedBundle: hash(bundle),
            stylesheet: hash(fs.readFileSync(path.join(root, "src/base-app/pages/dialogBuilder.css"))),
            font: hash(fs.readFileSync(path.join(root, "src/assets/fonts/Inter/Inter-Regular.ttf"))),
            fixtureDialog: hash(fs.readFileSync(path.join(fixturePath, "dialog.json"))),
            fixtureActions: hash(fs.readFileSync(path.join(fixturePath, "actions.js")))
        },
        cases: []
    };
    page.on("pageerror", (error) => errors.push(error.message));
    try {
        const frame = await openPage(page, bundle);
        if (!options.only || options.only === "authentic") {
            await checkAuthentic(frame, report.cases);
        }
        if (!options.only || options.only === "controls") {
            await checkMixed(frame, report.cases);
        }
        if (!options.only || options.only === "groups") {
            await checkGroups(frame, report.cases);
        }
        if (!options.only || options.only === "invalid") {
            await checkInvalidGraphs(frame, report.cases);
        }
        if (!options.only || options.only === "malformed") {
            await checkMalformedMetadata(frame, report.cases);
        }
        assert.deepEqual(errors, [], "The actual shared dialog runtime must not throw");
        report.status = "passed";
        console.log("Rendered DialogForge attachments passed: actual dialog page, translated text/paint, eleven controls, API actions, groups and invalid graphs.");
    } catch (error) {
        report.status = "failed";
        report.failure = error.message;
        throw error;
    } finally {
        report.pageErrors = errors;
        try {
            fs.writeFileSync(options.report, JSON.stringify(report, null, 4) + "\n");
        } finally {
            await browser.close();
        }
    }
};

module.exports = { buildPage, openPage, render, control, box, settle };
if (require.main === module) {
    main().catch((error) => { console.error(error); process.exitCode = 1; });
}
