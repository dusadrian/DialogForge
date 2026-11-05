'use strict';
const fs = require('node:fs');
const path = require('node:path');

exports.stageDialogRendererAssets = function(sourceRoot, outputRoot) {
    const source = path.join(sourceRoot, 'node_modules/@dialogcreator/renderer');
    const target = path.join(outputRoot, 'src/base-app/pages/dialog-renderer');
    fs.rmSync(target, { recursive: true, force: true });
    for (const name of ['css', 'assets']) {
        fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true });
    }
    fs.copyFileSync(path.join(source, 'provenance.json'), path.join(target, 'provenance.json'));
};
