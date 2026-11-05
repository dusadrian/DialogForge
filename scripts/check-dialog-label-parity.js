'use strict';
// Compare both consumers of the actual pinned renderer, rather than a second
// implementation against a manually recorded geometry table.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildPage, openPage, render, control, settle } = require('./rendered-element-anchoring-acceptance');
const fixture = require('../tests/fixtures/dialog-label-parity.json');

const report = { status: 'running', cases: [] };
let reportPath = path.resolve(__dirname, '../artifacts/dialog-label-parity/current.json');
for (let index = 2; index < process.argv.length; index += 2) {
    if (process.argv[index] !== '--report' || !process.argv[index + 1]) {
        throw new Error('Usage: node scripts/check-dialog-label-parity.js [--report path]');
    }
    reportPath = path.resolve(process.argv[index + 1]);
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        const frame = await openPage(page, await buildPage());
        for (const locale of ['en_US', 'de_DE', 'fr_FR']) {
            const source = structuredClone(fixture);
            await render(frame, source, locale);
            await frame.evaluate(({ fixture, locale }) => {
                const host = document.createElement('div');
                host.id = 'creator-reference';
                host.style.position = 'absolute';
                host.style.left = '-4000px';
                document.body.appendChild(host);
                window.creatorRenderer = window.elementAnchorHost.createRenderer(host, {
                    log: console.log,
                    showMessage: console.log
                }, { languageSwitcher: false });
                window.creatorRenderer.render(fixture, locale);
            }, { fixture, locale });
            const snapshot = async () => frame.evaluate(() => {
                const read = (canvas) => {
                    const origin = canvas.getBoundingClientRect();
                    return Array.from(canvas.querySelectorAll('.element-wrapper[data-type="Label"]')).map((node) => {
                        const box = node.getBoundingClientRect();
                        const text = node.querySelector('.smart-label-text');
                        const style = getComputedStyle(text);
                        return {
                            name: node.dataset.nameid, text: text.textContent,
                            left: box.left - origin.left, top: box.top - origin.top,
                            width: box.width, height: box.height,
                            structure: Array.from(node.querySelectorAll('*')).map((child) => [child.tagName, child.className]),
                            font: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight,
                            padding: style.padding, transform: style.transform
                        };
                    });
                };
                return [read(document.querySelector('#paper .preview-canvas')), read(window.creatorRenderer.canvas)];
            });
            for (const button of [null, 'b_cycle', 'b_repeat', 'b_show', 'b_cycle', 'b_show']) {
                if (button) {
                    await control(frame, button).locator('.smart-button').click();
                    await frame.evaluate((name) => window.creatorRenderer.ui.triggerClick(name), button);
                }
                await settle(frame);
                const [forge, creator] = await snapshot();
                assert.deepEqual(forge, creator, `${locale}/${button || 'initial'}: DOM, text, geometry and typography must come from one renderer`);
                assert.equal(forge.length, 17);
                report.cases.push({ locale, interaction: button || 'initial', labels: forge });
            }
            await frame.evaluate(() => {
                window.creatorRenderer.dispose();
                document.getElementById('creator-reference').remove();
            });
        }
        assert.deepEqual(errors, []);
        report.status = 'passed';
        console.log('Canonical renderer parity passed: 17 labels, three locales, actions, DOM, CSS typography and geometry.');
    } catch (error) {
        report.status = 'failed';
        report.failure = error.message;
        throw error;
    } finally {
        report.pageErrors = errors;
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 4) + '\n');
        await browser.close();
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
