'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildPage, openPage, settle } = require('./rendered-element-anchoring-acceptance');
const product = path.resolve(process.env.DIALOGQCA_PRODUCT_PATH || path.join(__dirname, '../../DialogQCA'));

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.stack));
    try {
        const bundle = await buildPage([
            `import { createVennDialogRuntime } from ${JSON.stringify(path.join(product, 'external/r/vennDialogRuntime.ts'))};`,
            `window.dialogForgeProfileCustomJSModules = [{ extendCustomJSApi(api) {
                const venn = createVennDialogRuntime({ api,
                    loadTruthTables: async () => [{ name:'TT', options:{conditions:['A','B']}, id:['0','1','2','3'], out:['0','1','1','1'], cases:['a','b','c','d'] }],
                    listTruthTableNames: async () => ['TT']
                });
                api.registerExternalCall('qca.initializeVennDialog', async (payload) => { await venn.refreshTruthTableSelect(payload); return venn.sync(payload); });
                api.registerExternalCall('qca.syncVennDialog', (payload) => venn.sync(payload));
            }}];`
        ]);
        const frame = await openPage(page, bundle);
        const source = JSON.parse(fs.readFileSync(path.join(product, 'dialogs/r/venn/dialog.json')));
        source.customJS = fs.readFileSync(path.join(product, 'dialogs/r/venn/actions.js'), 'utf8');
        await frame.evaluate(async (source) => window.elementAnchorHost.deliver(source, 'fr_FR'), source);
        const toolbar = frame.locator('.plot-dialog-window-toolbar-host');
        await toolbar.locator('.venn-toolbar-controls [data-type="Select"] select').waitFor();
        await frame.waitForFunction(() => document.querySelector('.dm-plot-surface svg'));
        await settle(frame);
        assert.equal(await toolbar.locator('.venn-toolbar-controls > .element-wrapper').count(), 3);
        const checkbox = toolbar.locator('.custom-checkbox');
        await checkbox.click();
        await frame.waitForFunction(() => document.querySelector('.plot-dialog-window-toolbar-host').dataset.customExpanded === 'true');
        assert.equal(await toolbar.locator('.venn-toolbar-expression textarea').isVisible(), true);
        await toolbar.locator('.venn-toolbar-expression textarea').fill('A+B');
        await settle(frame);
        await checkbox.click();
        await frame.waitForFunction(() => document.querySelector('.plot-dialog-window-toolbar-host').dataset.customExpanded === 'false');
        assert.equal(await toolbar.locator('.venn-toolbar-expression textarea').isVisible(), false);
        assert.deepEqual(errors, []);
        assert.deepEqual(await frame.evaluate(() => window.elementAnchorHost.errors), []);
        console.log('Canonical Venn integration passed: actual product dialog/actions/renderer, translated toolbar controls, plot SVG and custom-expression expansion.');
    } finally {
        await browser.close();
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
