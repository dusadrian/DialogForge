const fs = require('node:fs');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '..');
// Actual native R/WebR and the SAME editor. The notification producer and
// optional unavailable transport response are controlled retirement fixtures.
const { chromium, _electron } = require('playwright');
const { findMainWindowPage } = require('../tests/electron/product-launch');
const [target, destination] = process.argv.slice(2);
if (!target || !destination) {
    throw Error('Usage: node scripts/check-rendered-dataset-refresh.js <product-path|http-url> <private-result.json>');
}
const web = /^https?:/.test(target);
if (!web) {
    require('node:child_process').execFileSync(process.execPath,
        [path.join(projectRoot, 'dist/scripts/package-product.js'), '--product-path', target, '--stage-only'],
        {cwd:projectRoot,stdio:'inherit'});
}
(async () => {
    const app = web ? await chromium.launch({headless: false}) : await _electron.launch({
        executablePath: require('electron'),
        args: [path.join(projectRoot, 'dist/scripts/electron-main.js'), '--product-path', target],
        env: {...process.env, DIALOGFORGE_TEST_USER_DATA_PATH: fs.mkdtempSync('/tmp/dialogforge-cell-probe-')}
    });
    const report = {target, cases: []};
    let page, editor;
    try {
        page = web ? await app.newPage() : await findMainWindowPage(app);
        if (web) await page.goto(target);
        await page.waitForFunction(() => (document.body.dataset.dialogForgeReady === '1' || Boolean(window.dialogForgeWebConsole))
            && Boolean(document.querySelector('#consoleTerminal [data-session-phase="ready"][data-runtime-busy="false"]')), undefined, {timeout: 120000});
        await page.evaluate(async web => {
            if (web) {
                const settings=JSON.parse(localStorage.getItem('dialogforge.settings') || '{}');
                settings.uiActionCommandVisibility='visible';
                localStorage.setItem('dialogforge.settings',JSON.stringify(settings));
            } else await window.dialogForge.writeSettings({uiActionCommandVisibility:'visible'});
        },web);
        await page.locator('#consoleTerminal [data-session-phase] .view-lines').click();
        await page.keyboard.insertText('revision_data <- data.frame(value=c(1,2))\n');
        await page.keyboard.press('Enter');
        await page.locator('[data-workspace-variable="revision_data"]').waitFor({state:'attached'});
        if (!await page.locator('[data-workspace-variable="revision_data"]').isVisible()) {
            await page.locator('#workspacePaneToggle').click();
        }
        await page.locator('[data-workspace-variable="revision_data"]').waitFor();
        await page.locator('[data-workspace-variable="revision_data"]').dblclick();
        if (web) {
            const frame = page.locator('iframe[src*="datasetEditor.html"]');
            await frame.waitFor();
            editor = await (await frame.elementHandle()).contentFrame();
        } else {
            editor = app.windows().find(p => p.url().includes('datasetEditor.html')) || await app.waitForEvent('window');
        }
        await editor.waitForFunction(() => Boolean(window.dialogForge?.datasetViewer));
        await editor.evaluate(() => {
            window.probeReads=[];
            const api=window.dialogForge.datasetViewer;
            for (const method of ['getContent','getSchema','getFilterMask','updateCell']) {
                const original=api[method].bind(api);
                api[method]=(...args) => {
                    const record={method,started:performance.now()};
                    window.probeReads.push(record);
                    const pending=original(...args);
                    pending.then(value => Object.assign(record,{finished:performance.now(),returnedNull:value==null}),
                        error => Object.assign(record,{finished:performance.now(),error:String(error)}));
                    return pending;
                };
            }
        });
        const selector = 'td[data-data-cell="true"][data-data-row="1"][data-data-column="value"]';
        {
            await editor.locator(selector).dblclick();
            const input=editor.locator('input[data-data-editor="true"]');
            await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await input.fill('10');
            report.backgroundMutation=await page.evaluate(web => web
                ? window.dialogForge.executeInvisibleMutation({text:'revision_data$value[2] <- 3',source:'draft-retirement-probe'})
                : window.dialogForge.executeInvisibleQuery({query:'revision_data$value[2] <- 3',source:'draft-retirement-probe'}),web);
            if (web ? !report.backgroundMutation.ok : report.backgroundMutation.status !== 'ready') {
                throw Error('Actual R background mutation failed');
            }
            const change={changes:[{name:'revision_data',kind:'dataset_cells_changed',rows:[2],columns:['value']}]};
            if (web) {
                await page.evaluate(change => document.querySelector('iframe[src*="datasetEditor.html"]').contentWindow.postMessage({
                    source:'dialogforge.web-host',kind:'event',channel:'datasetEditor:applyChanges',args:[change]
                },location.origin),change);
            } else {
                await app.evaluate(({BrowserWindow},change) => {
                    const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('datasetEditor.html'));
                    if (!window) throw Error('Owning dataset editor is absent');
                    window.webContents.send('datasetEditor:applyChanges',change);
                },change);
            }
            await editor.waitForFunction(() => document.querySelector('td[data-data-cell="true"][data-data-row="2"][data-data-column="value"]')?.textContent.trim() === '3',undefined,{timeout:5000});
            report.refreshedRealRValue=true;
            await editor.waitForFunction(() => document.querySelector('input[data-data-editor="true"]')?.value === '10',undefined,{timeout:5000});
            report.draftRetained=true;
            if (process.env.DIALOGFORGE_PROBE_RETIRED_VIEWPORT === '1') {
                await editor.evaluate(() => {
                    const api=window.dialogForge.datasetViewer;
                    const original=api.getContent.bind(api);
                    let holdNext=true;
                    window.releaseProbeRead=null;
                    api.getContent=(...args) => {
                        const pending=original(...args);
                        if (!holdNext) return pending;
                        holdNext=false;
                        return pending.then(() => new Promise(resolve => {
                            window.releaseProbeRead=() => resolve(null);
                        }));
                    };
                });
                if (web) {
                    await page.evaluate(change => document.querySelector('iframe[src*="datasetEditor.html"]').contentWindow.postMessage({
                        source:'dialogforge.web-host',kind:'event',channel:'datasetEditor:applyChanges',args:[change]
                    },location.origin),change);
                } else {
                    await app.evaluate(({BrowserWindow},change) => {
                        const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('datasetEditor.html'));
                        if (!window) throw Error('Owning dataset editor is absent');
                        window.webContents.send('datasetEditor:applyChanges',change);
                    },change);
                }
                await editor.waitForFunction(() => typeof window.releaseProbeRead === 'function');
                report.retiredTransportFixture=true;
                await input.press('Enter');
                await editor.waitForFunction(() => window.probeReads.some(r => r.method==='updateCell' && r.finished));
                await editor.evaluate(() => window.releaseProbeRead());
            } else await input.press('Enter');
            await input.waitFor({state:'detached'});
            await editor.waitForFunction(selector => document.querySelector(selector)?.textContent.trim() === '10',selector);
            report.committedValue=await editor.locator(selector).innerText();
            await editor.waitForFunction(() => document.querySelector('td[data-data-cell="true"][data-data-row="2"][data-data-column="value"]')?.textContent.trim() === '3');
            report.surroundingValueRetained=true;
            return;
        }
    } catch (error) {
        report.error = String(error.stack || error);
        if (editor) report.editor = await editor.evaluate(() => ({text: document.body.innerText,
            cells: Array.from(document.querySelectorAll('[data-data-cell="true"]')).map(c => ({row:c.dataset.dataRow,column:c.dataset.dataColumn,text:c.textContent}))})).catch(e => ({error:String(e)}));
        if (page) report.query = await Promise.race([
            page.evaluate(web => web ? window.dialogForge.executeInvisibleMutation({text:'revision_data$value',source:'cell-probe'}) : window.dialogForge.executeInvisibleQuery({query:'revision_data$value',source:'cell-probe'}),web).catch(e => ({error:String(e)})),
            new Promise(resolve => setTimeout(() => resolve({diagnosticTimeout:true}),5000))
        ]);
        process.exitCode = 1;
    } finally {
        if (editor) report.reads=await editor.evaluate(() => window.probeReads).catch(error => ({error:String(error)}));
        fs.writeFileSync(destination, JSON.stringify(report,null,2));
        await app.close();
        console.log(JSON.stringify({host:web?'webr':'native',retiredTransportFixture:Boolean(report.retiredTransportFixture),
            draftRetained:report.draftRetained,committedValue:report.committedValue,error:report.error}));
    }
})();
