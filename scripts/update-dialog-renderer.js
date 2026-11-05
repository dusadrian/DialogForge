'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const creator = path.resolve(process.argv[2] || '../DialogCreator');
const forge = path.resolve(__dirname, '..');
const metadata = JSON.parse(fs.readFileSync(path.join(creator, 'src/renderer/package.json'), 'utf8'));
const vendor = path.join(forge, 'vendor');
execFileSync(process.execPath, [path.join(creator, 'scripts/export-renderer-package.js'), vendor], {
    cwd: creator, stdio: 'inherit'
});
const archive = `./vendor/dialogcreator-renderer-${metadata.version}.tgz`;
execFileSync('npm', ['install', '--ignore-scripts', archive], { cwd: forge, stdio: 'inherit' });

for (const name of ['package.json', 'package-lock.json']) {
    const filename = path.join(forge, name);
    fs.writeFileSync(filename, JSON.stringify(JSON.parse(fs.readFileSync(filename, 'utf8')), null, 4) + '\n');
}
