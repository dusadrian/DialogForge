"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { build } = require("esbuild");
const { chromium } = require("playwright");


const root = path.resolve(__dirname, "..");
const fixture = require("../tests/fixtures/dialog-label-parity.json");
const labelSpecs = fixture.elements.filter((element) => element.type === "Label");

// Recorded from DialogCreator Preview with this fixture, Inter loaded before
// rendering, 12px regular text, and its existing two-pixel horizontal insets.
const creatorReference = {
    en_US: { text: "New dataset", naturalWidth: 78, wrappedHeight: 15, threeLineHeight: 15 },
    de_DE: { text: "Neuer Datensatz", naturalWidth: 101, wrappedHeight: 29, threeLineHeight: 44 },
    fr_FR: { text: "Nouveau jeu de données", naturalWidth: 148, wrappedHeight: 29, threeLineHeight: 44 }
};


const assertNear = function(actual, expected, context, tolerance = 0.25) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new assert.AssertionError({
            actual,
            expected,
            message: `${context}: expected ${expected}, rendered ${actual}`,
            operator: `within ${tolerance}px`
        });
    }
};


const readOptions = function() {
    const options = {
        labelSource: path.join(root, "src/dialog-runtime/renderer/modules/dialogLabelBuilder.ts"),
        report: path.join(root, "artifacts/dialog-label-parity/current.json"),
        checkRegressions: false
    };
    const args = process.argv.slice(2);

    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === "--check-regressions") {
            options.checkRegressions = true;
        } else if (args[index] === "--label-source" || args[index] === "--report") {
            const option = args[index];
            const value = args[++index];

            if (!value) {
                throw new Error(`Missing value for ${option}`);
            }

            options[option === "--report" ? "report" : "labelSource"] = path.resolve(value);
        } else {
            throw new Error(`Unknown label parity argument: ${args[index]}`);
        }
    }

    return options;
};


const buildDialogPage = async function(labelSource) {
    const plugins = [{
        name: "saved-label-builder",
        setup: function(builder) {
            builder.onLoad({ filter: /[/\\]dialogLabelBuilder\.ts$/ }, (args) => {
                return { contents: labelSource, loader: "ts", resolveDir: path.dirname(args.path) };
            });
        }
    }];

    const result = await build({
        stdin: {
            resolveDir: root,
            contents: [
                'import "./src/dialog-runtime/renderer/modules/dialogBuilderInterface";'
            ].join("\n")
        },
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        write: false,
        plugins
    });

    return result.outputFiles[0].text;
};


const installDialogPage = async function(page, bundle) {
    await page.addInitScript(() => {
        const listeners = new Map();
        const host = {
            ready: false,
            created: false,
            errors: [],
            deliver: async function(dialog) {
                host.created = false;

                for (const listener of listeners.get("dialogCreated") || []) {
                    await listener({ dialogID: dialog.id, data: dialog });
                }
            }
        };

        // Only the host transport is supplied here. The actual dialog page,
        // adapter, control builders, lifecycle and CustomJS runtime run below.
        window.labelParityHost = host;
        window.dialogForge = {
            dialogRuntime: {
                sendTo: function(_target, channel, ...values) {
                    if (channel === "dialogRuntime:ready") {
                        host.ready = true;
                    } else if (channel === "dialogCreated") {
                        host.created = true;
                    } else if (channel === "showErrorBox") {
                        host.errors.push(values);
                    }
                },
                invoke: async function(channel) {
                    throw new Error(`Label fixture unexpectedly requested a host operation: ${channel}`);
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
            }
        };
    });

    await page.route("http://dialog-label-parity.test/**", async (route) => {
        const url = new URL(route.request().url());

        if (url.pathname === "/fixture") {
            await route.fulfill({
                contentType: "text/html",
                body: '<iframe id="dialog" title="Label parity" '
                    + 'src="/src/base-app/pages/dialogBuilder.html" '
                    + 'style="border:0;width:1000px;height:800px"></iframe>'
            });
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

        const sourcePath = path.resolve(root, "." + url.pathname);
        const contentTypes = {
            ".css": "text/css",
            ".html": "text/html",
            ".js": "text/javascript",
            ".svg": "image/svg+xml",
            ".ttf": "font/ttf"
        };

        if (sourcePath.startsWith(root + path.sep) && fs.existsSync(sourcePath)) {
            await route.fulfill({
                contentType: contentTypes[path.extname(sourcePath)] || "application/octet-stream",
                body: fs.readFileSync(sourcePath)
            });
            return;
        }

        await route.fulfill({ status: 404, body: "Missing label fixture resource" });
    });

    await page.goto("http://dialog-label-parity.test/fixture");
    const frame = page.frame({ url: /dialogBuilder\.html$/ });
    assert.ok(frame, "The real dialogBuilder.html iframe should load");
    await frame.waitForFunction(() => window.labelParityHost.ready);
    const loadedFonts = await frame.evaluate(async () => {
        return (await document.fonts.load("12px Inter")).length;
    });
    assert.equal(loadedFonts, 1, "The actual Inter font should load before measuring label geometry");
    return frame;
};


const settleLayout = async function(frame) {
    await frame.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
};


const renderFixture = async function(frame, locale) {
    const source = structuredClone(fixture);
    const translations = source.i18n.locales[locale];
    source.properties.language = locale;
    source.elements.forEach((element) => {
        if (element.type === "Label") {
            element.__baseValue = element.value;
            element.value = translations[`elements.${element.id}.value`];
        }
    });
    await frame.evaluate(async (source) => {
        await window.labelParityHost.deliver(source);
    }, source);
    await settleLayout(frame);
    assert.equal(await frame.locator(".dm-label").count(), labelSpecs.length);
    assert.equal(await frame.evaluate(() => window.labelParityHost.created), true);
    assert.deepEqual(await frame.evaluate(() => window.labelParityHost.errors), []);
};


const readLabels = async function(frame) {
    return frame.locator(".dm-label").evaluateAll((labels) => {
        const canvas = document.getElementById("paper").getBoundingClientRect();
        return labels.map((label) => {
            const host = label.querySelector(".dm-label-host");
            const text = host.querySelector(".smart-label-text");
            const box = label.getBoundingClientRect();
            const hostBox = host.getBoundingClientRect();
            const textBox = text.getBoundingClientRect();
            const style = getComputedStyle(host);
            return {
                value: text.textContent,
                left: box.left - canvas.left,
                top: box.top - canvas.top,
                width: box.width,
                height: box.height,
                hostLeft: hostBox.left - box.left,
                hostTop: hostBox.top - box.top,
                hostWidth: hostBox.width,
                hostHeight: hostBox.height,
                textLeft: textBox.left - hostBox.left,
                textWidth: textBox.width,
                paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight,
                alignment: style.textAlign,
                verticalAlignment: getComputedStyle(label).alignItems,
                ellipsis: style.textOverflow
            };
        });
    });
};


const checkReference = function(labels, locale, dynamic = false) {
    const reference = creatorReference[locale];

    labels.forEach((label, index) => {
        const spec = labelSpecs[index];
        const context = `${dynamic ? "setValue" : "initial"} ${locale} ${spec.nameid}`;
        const width = spec.maxWidth > 0
            ? Math.min(reference.naturalWidth, spec.maxWidth)
            : reference.naturalWidth;
        let height = 15;
        let hostHeight = 14.390625;

        if (spec.maxWidth === 100 && spec.lineClamp > 1) {
            height = spec.lineClamp === 3 ? reference.threeLineHeight : reference.wrappedHeight;
            if (locale === "fr_FR") {
                hostHeight = 28.78125;
            }
        }

        const horizontalFraction = { left: 0, center: 0.5, right: 1 }[spec.align];
        const verticalFraction = { top: 0, middle: 0.5, bottom: 1 }[spec.valign];
        const expectedLeft = Math.round(spec.left + (78 - width) * horizontalFraction);
        const expectedTop = dynamic
            ? spec.top
            : Math.round(spec.top + (15 - height) * verticalFraction);

        assert.equal(label.value, reference.text, `${context}: actual text`);
        assertNear(label.width, width, `${context}: natural/clamped width`);
        assertNear(label.height, height, `${context}: allocated line height`);
        assertNear(label.left, expectedLeft, `${context}: horizontal anchor`, 1);
        assertNear(label.top, expectedTop, `${context}: vertical position`, 1);
        assertNear(label.hostWidth, width, `${context}: host border-box width`);
        assertNear(label.hostHeight, hostHeight, `${context}: actual rendered text height`);
        assertNear(label.hostLeft, 0, `${context}: host left`);
        assertNear(label.hostTop, (height - hostHeight) * verticalFraction,
            `${context}: text vertical placement`);
        assert.equal(label.paddingLeft, "2px", `${context}: left inset`);
        assert.equal(label.paddingRight, "2px", `${context}: right inset`);
        assertNear(label.textLeft, 2, `${context}: text starts inside inset`);
        assertNear(label.textWidth, width - 4, `${context}: text content width`);
        assert.equal(label.alignment, spec.align, `${context}: text alignment`);
        assert.equal(label.verticalAlignment,
            { top: "flex-start", middle: "center", bottom: "flex-end" }[spec.valign],
            `${context}: selected vertical alignment`);

        if (spec.lineClamp === 1) {
            assert.equal(label.ellipsis, reference.naturalWidth > width ? "ellipsis" : "clip",
                `${context}: ellipsis only when the natural width is clamped`);
        }
    });
};


const checkUnchanged = function(actual, expected, context) {
    actual.forEach((label, index) => {
        assert.deepEqual(label, expected[index], `${context}: ${labelSpecs[index].nameid} moved or changed`);
    });
};


const clickRelayoutButtons = async function(frame, count) {
    const repeat = frame.locator('[data-control-name="b_repeat"]');
    const show = frame.locator('[data-control-name="b_show"]');
    await repeat.locator(".smart-button").click();
    assert.equal(await repeat.locator(".smart-button-text").textContent(), `Same value ${count}`,
        "Same-value CustomJS handler should execute before checking unchanged geometry");
    await show.locator(".smart-button").click();
    assert.equal(await show.locator(".smart-button-text").textContent(), `Shown ${count}`,
        "Visibility CustomJS handler should execute before checking unchanged geometry");
    await settleLayout(frame);
};


const checkRenderedLabels = async function(labelSource, snapshots) {
    const bundle = await buildDialogPage(labelSource);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1040, height: 850 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") {
            pageErrors.push(message.text());
        }
    });

    try {
        const frame = await installDialogPage(page, bundle);

        for (const locale of Object.keys(creatorReference)) {
            await renderFixture(frame, locale);
            assert.deepEqual(pageErrors, [], `${locale}: dialog should initialize its real CustomJS handlers`);
            const initial = await readLabels(frame);
            snapshots[`initial-${locale}`] = initial;
            checkReference(initial, locale);

            for (let repeat = 0; repeat < 3; repeat += 1) {
                await clickRelayoutButtons(frame, repeat + 1);
                checkUnchanged(await readLabels(frame), initial, `${locale}: repeated same-value setValue/show`);
            }
        }

        await renderFixture(frame, "en_US");
        let clickCount = 0;
        for (const locale of ["de_DE", "fr_FR", "en_US"]) {
            await frame.locator('[data-control-name="b_cycle"] .smart-button').click();
            await settleLayout(frame);
            const changed = await readLabels(frame);
            snapshots[`setValue-${locale}`] = changed;
            checkReference(changed, locale, true);

            for (let repeat = 0; repeat < 3; repeat += 1) {
                await clickRelayoutButtons(frame, ++clickCount);
                checkUnchanged(await readLabels(frame), changed, `${locale}: dynamic setValue/show`);
            }
        }

        assert.deepEqual(pageErrors, [], "The real dialog runtime should render without errors");
    } finally {
        await browser.close();
    }
};


const sourceHash = function(source) {
    return createHash("sha256").update(source).digest("hex");
};


const regressionSources = function(source) {
    const replace = function(pattern, replacement, name) {
        const changed = source.replace(pattern, replacement);
        assert.notEqual(changed, source, `${name}: regression mutation no longer matches the builder`);
        return changed;
    };

    return [
        {
            name: "missing-horizontal-insets",
            source: replace(
                /host\.style\.padding(Left|Right) = horizontalInset \+ "px";/g,
                'host.style.padding$1 = "0px";',
                "missing-horizontal-insets"
            ),
            mismatch: /inset|text starts inside|text content width/
        },
        {
            name: "measure-wrapped-host",
            source: replace(
                "const naturalWidth = measureNoWrapLabelWidth(text);",
                "const naturalWidth = Math.ceil(host.getBoundingClientRect().width || 0);",
                "measure-wrapped-host"
            ),
            mismatch: /natural\/clamped width/
        },
        {
            name: "show-resets-authored-position",
            source: replace(
                /(control\.show = function\(\): void \{\s+show\(\);\s+)applyLayout\(false\)/,
                "$1applyLayout(true)",
                "show-resets-authored-position"
            ),
            mismatch: /dynamic setValue\/show.*moved or changed/
        }
    ];
};


const main = async function() {
    const options = readOptions();
    const labelSource = fs.readFileSync(options.labelSource, "utf8");
    const report = {
        checkedAt: new Date().toISOString(),
        status: "running",
        source: { path: options.labelSource, sha256: sourceHash(labelSource) },
        runtimeEntrySha256: sourceHash(fs.readFileSync(path.join(root, "src/dialog-runtime/renderer/modules/dialogBuilderInterface.ts"))),
        customJSRuntimeSha256: sourceHash(fs.readFileSync(path.join(root, "src/dialog-runtime/renderer/library/customJSRuntime.ts"))),
        stylesheetSha256: sourceHash(fs.readFileSync(path.join(root, "src/base-app/pages/dialogBuilder.css"))),
        fontSha256: sourceHash(fs.readFileSync(path.join(root, "src/assets/fonts/Inter/Inter-Regular.ttf"))),
        fixtureSha256: sourceHash(fs.readFileSync(path.join(root, "tests/fixtures/dialog-label-parity.json"))),
        checkerSha256: sourceHash(fs.readFileSync(__filename)),
        reference: { application: "DialogCreator Preview", font: "Inter 12px regular", measurements: creatorReference },
        coverage: "Real dialogBuilder iframe and CustomJS APIs; host transport supplied by fixture; no R or full application shell.",
        cases: []
    };

    const run = async function(name, source, expectedMismatch) {
        const result = { name, sourceSha256: sourceHash(source), status: "running", snapshots: {} };
        report.cases.push(result);

        try {
            await checkRenderedLabels(source, result.snapshots);
            result.status = "passed";
        } catch (error) {
            result.mismatch = { message: error.message, actual: error.actual, expected: error.expected };

            if (expectedMismatch && error.code === "ERR_ASSERTION" && expectedMismatch.test(error.message)) {
                result.status = "regression-detected";
                console.log(`${name}: caught ${error.message.split("\n")[0]}`);
                return;
            }

            result.status = "failed";
            throw error;
        }

        if (expectedMismatch) {
            result.status = "failed";
            throw new Error(`${name}: deliberate label regression was not detected`);
        }
    };

    try {
        await run("current-source", labelSource);

        if (options.checkRegressions) {
            for (const regression of regressionSources(labelSource)) {
                await run(regression.name, regression.source, regression.mismatch);
            }
        }

        report.status = "passed";
        console.log("Rendered label parity passed: real dialog iframe, 17 labels, 3 locales, API text/visibility actions.");
    } catch (error) {
        report.status = "failed";
        throw error;
    } finally {
        fs.mkdirSync(path.dirname(options.report), { recursive: true });
        fs.writeFileSync(options.report, JSON.stringify(report, null, 4) + "\n");
        console.log(`Label parity report: ${options.report}`);
    }
};


main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
