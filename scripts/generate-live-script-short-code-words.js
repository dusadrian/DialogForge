"use strict";

const fs = require("node:fs");
const path = require("node:path");


const rootDir = path.resolve(__dirname, "..");
const words = Object.values(require("diceware-wordlist-en-eff"));
const outputPath = path.join(
    rootDir,
    "src/script-editor/collaboration/liveScriptShortCodeWords.ts"
);
const lines = [
    "// Generated from diceware-wordlist-en-eff 1.0.1. Do not edit by hand.",
    "const words: readonly string[] = ["
];

for (let index = 0; index < words.length; index += 8) {
    const row = words.slice(index, index + 8)
        .map((word) => JSON.stringify(word))
        .join(", ");
    lines.push(`    ${row},`);
}

lines.push("];");
lines.push("");
lines.push("export default words;");
lines.push("");
fs.writeFileSync(outputPath, lines.join("\n"));
