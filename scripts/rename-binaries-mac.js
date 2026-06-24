"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Renames macOS DMG artifacts to stable intel/silicon filenames.
 * Also removes generated update metadata files from build/output.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const maybe = path_1.default.resolve(__dirname, "..");
const rootIndex = process.argv.indexOf("--root");
const cliRoot = rootIndex >= 0 ? String(process.argv[rootIndex + 1] || "").trim() : "";
const root = cliRoot || (fs_1.default.existsSync(path_1.default.join(maybe, "package.json"))
    ? maybe
    : path_1.default.resolve(__dirname, "../.."));
const pkg = JSON.parse(fs_1.default.readFileSync(path_1.default.join(root, "package.json"), "utf8"));
const versionIndex = process.argv.indexOf("--version");
const cliVersion = versionIndex >= 0
    ? String(process.argv[versionIndex + 1] || "").trim()
    : "";
const version = cliVersion || String(pkg.version || "");
const productNameIndex = process.argv.indexOf("--product-name");
const cliProductName = productNameIndex >= 0
    ? String(process.argv[productNameIndex + 1] || "").trim()
    : "";
const name = cliProductName
    || (pkg.build && pkg.build.productName)
    || String(pkg.name || "");
const nameFile = name.replace(/\s+/g, "_");
const out = path_1.default.join(root, "build", "output");
const versionVariants = Array.from(new Set([
    version,
    version
        .split(".")
        .map((part) => /^\d+$/.test(part) ? String(Number(part)) : part)
        .join(".")
].filter(Boolean)));
const arch = process.argv.includes("--arch")
    ? String(process.argv[process.argv.indexOf("--arch") + 1] || "").trim()
    : String(process.env.DIALOGFORGE_MAC_ARCH || "arm64").trim();
const targetArch = arch === "x64" ? "x64" : "arm64";
const listDmgArtifacts = function () {
    if (!fs_1.default.existsSync(out)) {
        return [];
    }
    return fs_1.default.readdirSync(out)
        .filter((file) => /\.dmg$/i.test(file))
        .map((file) => {
        const fullPath = path_1.default.join(out, file);
        const stat = fs_1.default.statSync(fullPath);
        return {
            name: file,
            path: fullPath,
            size: stat.size
        };
    });
};
const selectArtifact = function (artifacts, requestedArch) {
    const exact = artifacts.filter((artifact) => {
        const lower = artifact.name.toLowerCase();
        return lower.includes("-" + requestedArch) && versionVariants.some((candidate) => lower.includes(candidate.toLowerCase()));
    });
    if (exact.length > 0) {
        return exact.sort((a, b) => b.size - a.size)[0];
    }
    const archOnly = artifacts.filter((artifact) => artifact.name.toLowerCase().includes("-" + requestedArch));
    if (archOnly.length > 0) {
        return archOnly.sort((a, b) => b.size - a.size)[0];
    }
    const generic = artifacts.filter((artifact) => versionVariants.some((candidate) => artifact.name.toLowerCase().includes(candidate.toLowerCase())));
    if (generic.length > 0) {
        return generic.sort((a, b) => b.size - a.size)[0];
    }
    return artifacts[0] || null;
};
const renameArtifact = function (artifact, targetName, kind) {
    if (!artifact) {
        const known = listDmgArtifacts().map((entry) => entry.name).join(", ");
        throw new Error(`${kind} artifact not found in build/output. Found: ${known || "(none)"}`);
    }
    const targetPath = path_1.default.join(out, targetName);
    if (artifact.path !== targetPath) {
        fs_1.default.renameSync(artifact.path, targetPath);
    }
    console.log(`Renamed ${artifact.name} -> ${targetName}`);
};
const removeMetadataArtifacts = function () {
    if (!fs_1.default.existsSync(out)) {
        return;
    }
    fs_1.default.readdirSync(out).forEach((file) => {
        if (/\.(yml|yaml|blockmap)$/i.test(file)) {
            fs_1.default.rmSync(path_1.default.join(out, file), { force: true });
            console.log(`Removed ${file}`);
        }
    });
};
const main = function () {
    const artifacts = listDmgArtifacts();
    console.log("Discovered dmg artifacts:", artifacts.map((artifact) => artifact.name).join(", ") || "(none)");
    renameArtifact(selectArtifact(artifacts, targetArch), `${nameFile}_${version}_${targetArch === "arm64" ? "silicon" : "intel"}.dmg`, targetArch === "arm64" ? "Silicon installer" : "Intel installer");
    removeMetadataArtifacts();
};
main();
