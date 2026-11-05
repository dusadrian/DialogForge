'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildPage, openPage, settle } = require('./rendered-element-anchoring-acceptance');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
        const frame = await openPage(page, await buildPage());
        const source = {
            id: 'canonical-controls',
            properties: { name: 'CanonicalControls', title: 'Canonical controls', language: 'en_US', width: 900, height: 600, fontSize: 12, resizable: true },
            syntax: {},
            elements: [
                { id: 'q', type: 'Input', nameid: 'query', left: 20, top: 20, width: 120, height: 22 },
                { id: 'd', type: 'Container', nameid: 'datasets', left: 20, top: 60, width: 120, height: 100, selection: 'single-radio' },
                { id: 'v', type: 'Container', nameid: 'variables', left: 180, top: 60, width: 120, height: 100, selection: 'multiple' },
                { id: 'c', type: 'Choice', nameid: 'choices', left: 340, top: 60, width: 120, height: 100, items: 'alpha,beta', ordering: 'no', selection: 'multiple', sortable: true },
                { id: 's', type: 'Select', nameid: 'options', left: 20, top: 200, width: 120, value: 'first,second' },
                { id: 'n', type: 'Counter', nameid: 'count', left: 200, top: 200, startval: 1, minval: 1, maxval: 99 },
                { id: 'caption', type: 'Label', nameid: 'caption', left: 300, top: 200, value: 'Count', maxWidth: 100, lineClamp: 1, anchorTarget: 'n', anchorPosition: 'right', anchorGap: 10 },
                { id: 'r1', type: 'Radio', nameid: 'radio_one', left: 20, top: 260, group: 'mode', isSelected: true },
                { id: 'r2', type: 'Radio', nameid: 'radio_two', left: 60, top: 260, group: 'mode', isSelected: false },
                { id: 'change', type: 'Button', nameid: 'change', left: 20, top: 320, width: 100, height: 24, label: 'Change' },
                { id: 'plot', type: 'Plot', nameid: 'plot', left: 500, top: 20, width: 200, height: 200, resizeWithDialog: true },
                { id: 'footer', type: 'Label', nameid: 'footer', left: 500, top: 250, value: 'Footer', moveWithDialog: '0,1' }
            ],
            i18n: { baseLocale: 'en_US', locales: { en_US: {}, fr_FR: { 'elements.c.items.0': 'Alpha traduit', 'elements.c.items.1': 'Bêta traduit' } } },
            customJS: `
                setValue(datasets, ['alpha', 'beta']);
                setValue(variables, ['age', 'income']);
                setValue(choices, [{text:'alpha',state:'off'}, {text:'beta',state:'off'}]);
                onChange(mode, () => setValue(caption, isChecked(radio_two) ? 'Mode two' : 'Mode one'));
                searchIn(query, variables);
                enableSearch(variables);
                onClick(change, () => {
                    check(radio_two);
                    setValue(caption, 'Changed');
                    addError(query, 'Enter a value');
                });`
        };
        await frame.evaluate(async (source) => window.elementAnchorHost.deliver(source, 'fr_FR', {
            lastState: { datasets: { value: ['beta'] }, options: { value: 'second' }, count: { value: 42 } }
        }), source);
        await settle(frame);
        const node = (name) => frame.locator(`.element-wrapper[data-nameid="${name}"]`);
        assert.equal(await node('options').locator('select').inputValue(), 'second');
        assert.equal(await node('count').locator('.counter-value').textContent(), '42');
        assert.equal(await node('datasets').locator('.container-item.active .container-text').textContent(), 'beta');
        await node('datasets').locator('.container-item.active').click();
        assert.equal(await node('datasets').locator('.container-item.active .container-text').textContent(), 'beta', 'Forced single selection survives clicking the selected row');
        await node('query').locator('textarea').fill('age');
        assert.equal(await node('variables').locator('.container-item:visible').count(), 1, 'Canonical search filters newly supplied runtime items');
        assert.equal(await node('choices').locator('.sorter-label').first().textContent(), 'Alpha traduit');
        assert.equal(await node('choices').locator('.sorter-item').first().getAttribute('data-text'), 'alpha', 'Translation preserves command values');
        await node('change').locator('.smart-button').click();
        await settle(frame);
        assert.equal(await node('radio_two').locator('.native-radio').isChecked(), true);
        assert.equal(await node('radio_one').locator('.native-radio').isChecked(), false);
        assert.equal(await node('caption').locator('.smart-label-text').textContent(), 'Changed');
        assert.equal(await node('query').evaluate((node) => node.classList.contains('error-in-field') || Boolean(node.querySelector('.error-in-field'))), true, 'Validation uses canonical error presentation');
        const geometry = await frame.evaluate(() => {
            const root = document.querySelector('#paper');
            const control = (name) => root.querySelector(`.element-wrapper[data-nameid="${name}"]`);
            const count = control('count').getBoundingClientRect();
            const caption = control('caption').getBoundingClientRect();
            return { gap: caption.left - count.right, plot: control('plot').getBoundingClientRect().height, footer: control('footer').getBoundingClientRect().top };
        });
        assert.ok(Math.abs(geometry.gap - 10) < 0.6);
        await frame.evaluate(() => {
            const root = document.querySelector('#paper');
            root.style.height = '1100px';
            root.dispatchEvent(new Event('dialog-toolbar-resize'));
        });
        await settle(frame);
        const changed = await frame.evaluate(() => {
            const root = document.querySelector('#paper');
            return { plot: root.querySelector('[data-nameid="plot"].element-wrapper').getBoundingClientRect().height, footer: root.querySelector('[data-nameid="footer"].element-wrapper').getBoundingClientRect().top };
        });
        assert.ok(changed.plot > geometry.plot, 'Plot content follows the host resize');
        assert.ok(changed.footer > geometry.footer, 'Intentional Venn footer movement survives');
        await node('radio_one').locator('.custom-radio').click();
        await node('radio_two').locator('.custom-radio').click();
        assert.equal(await node('caption').locator('.smart-label-text').textContent(), 'Mode two', 'Radio group aliases dispatch change events');
        // Previously cached runtime schemas must use the same renderer too.
        await frame.evaluate(async (source) => {
            const host = window.elementAnchorHost;
            host.localize(source, 'fr_FR');
            const runtime = host.normalize(source);
            delete runtime.rendererDocument;
            await host.deliver(runtime, undefined, {
                lastState: { options: { value: 'second' }, count: { value: 42 } }
            });
        }, source);
        await settle(frame);
        await node('radio_two').locator('.custom-radio').click();
        assert.equal(await node('caption').locator('.smart-label-text').textContent(), 'Mode two', 'Cached radioGroup metadata preserves group scripting');
        assert.equal(await node('options').locator('select').inputValue(), 'second');
        assert.equal(await node('count').locator('.counter-value').textContent(), '42');
        assert.equal(await node('choices').locator('.sorter-label').first().textContent(), 'Alpha traduit');
        assert.deepEqual(errors, []);
        assert.deepEqual(await frame.evaluate(() => window.elementAnchorHost.errors), []);
        console.log('Canonical controls passed: restoration, runtime lists, forced selection, search, translated identities, validation, radios, attachments and Plot resize.');
    } finally {
        await browser.close();
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
