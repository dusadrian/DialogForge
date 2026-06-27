import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import type {
    DialogDefinition
} from "../../core/contracts/applicationComposition";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import {
    parseNewDialogJson
} from "../../dialog-runtime/renderer/modules/dialogAdapter";


const DIALOG_JSON = "dialog.json";
const ACTIONS_JS = "actions.js";
const LEGACY_CUSTOM_JS = "custom.js";
const PACKAGE_SUFFIX = ".dc.zip";
const DIALOG_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;


type DialogPackageFile = {
    name: string;
    data: Buffer;
};


export type DialogPackageImportTarget = {
    rootDir: string;
    location: ResolvedProductLocation;
    defaultRuntimeProvider: string;
};


export type ImportedDialogPackage = {
    id: string;
    label: string;
    targetDirectory: string;
    registryPath: string;
    definition: DialogDefinition;
};


const normalizeZipPath = function(name: string): string {
    return String(name || "").replace(/\\/g, "/").replace(/^\/+/, "");
};


const findEndOfCentralDirectory = function(buffer: Buffer): number {
    const minOffset = Math.max(0, buffer.length - 0xffff - 22);

    for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
        if (buffer.readUInt32LE(index) === 0x06054b50) {
            return index;
        }
    }

    throw new Error("Invalid DialogCreator package: ZIP directory not found.");
};


const readZip = function(buffer: Buffer): Map<string, Buffer> {
    const eocd = findEndOfCentralDirectory(buffer);
    const entries = buffer.readUInt16LE(eocd + 10);
    const centralOffset = buffer.readUInt32LE(eocd + 16);
    const files = new Map<string, Buffer>();
    let cursor = centralOffset;

    for (let index = 0; index < entries; index += 1) {
        if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
            throw new Error("Invalid DialogCreator package: malformed ZIP directory.");
        }

        const flags = buffer.readUInt16LE(cursor + 8);
        const method = buffer.readUInt16LE(cursor + 10);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const fileNameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const localOffset = buffer.readUInt32LE(cursor + 42);
        const encoding: BufferEncoding = (flags & 0x0800) ? "utf8" : "latin1";
        const name = normalizeZipPath(
            buffer.toString(encoding, cursor + 46, cursor + 46 + fileNameLength)
        );

        if (!name.endsWith("/")) {
            if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
                throw new Error(
                    `Invalid DialogCreator package: malformed ZIP entry ${name}.`
                );
            }

            const localNameLength = buffer.readUInt16LE(localOffset + 26);
            const localExtraLength = buffer.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + localNameLength + localExtraLength;
            const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
            let data: Buffer;

            if (method === 0) {
                data = Buffer.from(compressed);
            }
            else if (method === 8) {
                data = zlib.inflateRawSync(compressed);
            }
            else {
                throw new Error(`Unsupported compression method ${method} for ${name}.`);
            }

            files.set(name, data);
        }

        cursor += 46 + fileNameLength + extraLength + commentLength;
    }

    return files;
};


const safePackageFiles = function(files: Map<string, Buffer>): DialogPackageFile[] {
    const out: DialogPackageFile[] = [];

    files.forEach((data, fileName) => {
        const name = normalizeZipPath(fileName);

        if (
            !name
            || name === DIALOG_JSON
            || name === ACTIONS_JS
            || name === LEGACY_CUSTOM_JS
            || path.isAbsolute(name)
            || name.split("/").some((part) => part === "..")
        ) {
            return;
        }

        out.push({
            name,
            data
        });
    });

    return out;
};


const readPackageDialog = function(packagePath: string): {
    dialogJson: string;
    actionsJs: string;
    supportFiles: DialogPackageFile[];
} {
    if (!packagePath.toLowerCase().endsWith(PACKAGE_SUFFIX)) {
        throw new Error("Unsupported dialog package. Choose a .dc.zip file.");
    }

    const files = readZip(fs.readFileSync(packagePath));
    const dialogFile = files.get(DIALOG_JSON);

    if (!dialogFile) {
        throw new Error(`Invalid DialogCreator package: missing ${DIALOG_JSON}.`);
    }

    const dialog = parseNewDialogJson(dialogFile.toString("utf8")) as unknown as Record<string, unknown>;
    const script = dialog.script && typeof dialog.script === "object" && !Array.isArray(dialog.script)
        ? dialog.script as Record<string, unknown>
        : {};
    const entry = normalizeZipPath(String(script.entry || ACTIONS_JS));
    const customFile = files.get(entry)
        || (entry === ACTIONS_JS ? files.get(LEGACY_CUSTOM_JS) : undefined);

    if (!customFile) {
        throw new Error(`Invalid DialogCreator package: missing script entry ${entry}.`);
    }

    delete dialog.customJS;
    dialog.script = {
        entry: ACTIONS_JS,
        language: "javascript"
    };

    return {
        dialogJson: JSON.stringify(dialog, null, 4) + "\n",
        actionsJs: customFile.toString("utf8"),
        supportFiles: safePackageFiles(files)
    };
};


const readRegistry = function(registryPath: string): DialogDefinition[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        return Array.isArray(parsed) ? parsed as DialogDefinition[] : [];
    }
    catch {
        return [];
    }
};


const normalizeProviderBucket = function(value: string): string {
    const provider = String(value || "r").trim().toLowerCase();
    const safe = provider.replace(/[^a-z0-9_-]+/g, "");

    return safe || "r";
};


const dialogProperties = function(dialogJson: string): Record<string, unknown> {
    const parsed = parseNewDialogJson(dialogJson);
    const properties = parsed.properties && typeof parsed.properties === "object"
        ? parsed.properties as unknown as Record<string, unknown>
        : {};

    return properties;
};


const writePackageDirectory = function(
    targetDirectory: string,
    dialogJson: string,
    actionsJs: string,
    supportFiles: DialogPackageFile[]
): void {
    fs.mkdirSync(targetDirectory, {
        recursive: true
    });
    fs.writeFileSync(path.join(targetDirectory, DIALOG_JSON), dialogJson, "utf8");
    fs.writeFileSync(path.join(targetDirectory, ACTIONS_JS), actionsJs, "utf8");

    supportFiles.forEach((file) => {
        const targetPath = path.join(targetDirectory, file.name);

        fs.mkdirSync(path.dirname(targetPath), {
            recursive: true
        });
        fs.writeFileSync(targetPath, file.data);
    });
};


const writeRegistryEntry = function(
    registryPath: string,
    definition: DialogDefinition
): void {
    const registry = readRegistry(registryPath);
    const existing = registry.find((entry) => entry.id === definition.id);
    const nextDefinition = Object.assign(
        {},
        existing || {},
        definition,
        existing?.rPackages ? { rPackages: existing.rPackages } : {}
    );
    const nextRegistry = registry.filter((entry) => entry.id !== definition.id)
        .concat(nextDefinition)
        .sort((left, right) => {
            return String(left.label || left.id).localeCompare(String(right.label || right.id));
        });

    fs.mkdirSync(path.dirname(registryPath), {
        recursive: true
    });
    fs.writeFileSync(registryPath, `${JSON.stringify(nextRegistry, null, 4)}\n`, "utf8");
};


export const planDialogPackageImport = function(
    packagePath: string,
    target: DialogPackageImportTarget
): ImportedDialogPackage {
    const files = readPackageDialog(packagePath);
    const properties = dialogProperties(files.dialogJson);
    const id = String(properties.name || "").trim();

    if (!DIALOG_NAME_PATTERN.test(id)) {
        throw new Error(
            "Dialog name must be one word using only letters, numbers, and underscores, and it cannot start with a number."
        );
    }

    const providerBucket = normalizeProviderBucket(
        String(properties.runtimeProvider || target.defaultRuntimeProvider || "r")
    );
    const label = String(properties.title || properties.name || id);
    const baseMode = target.location.source === "base";
    const dialogsRoot = baseMode
        ? path.join(target.rootDir, "shared/base-app/dialogs")
        : path.join(target.location.rootPath, "dialogs");
    const registryPath = path.join(dialogsRoot, "dialogs.json");
    const sourceFile = `${providerBucket}/${id}/${DIALOG_JSON}`;
    const targetDirectory = path.join(dialogsRoot, providerBucket, id);
    const owner = baseMode
        ? "shared/base-app"
        : `products/${target.location.id}`;
    const targetHome = baseMode
        ? `shared/base-app/dialogs/${providerBucket}/${id}/`
        : `products/${target.location.id}/dialogs/${providerBucket}/${id}/`;

    return {
        id,
        label,
        targetDirectory,
        registryPath,
        definition: {
            id,
            label,
            owner,
            targetHome,
            sourceReference: packagePath,
            sourceFile,
            status: "source-imported",
            replacement: "Run through the DialogCreator-compatible DialogForge dialog runtime."
        }
    };
};


export const importDialogPackage = function(
    packagePath: string,
    target: DialogPackageImportTarget
): ImportedDialogPackage {
    const files = readPackageDialog(packagePath);
    const plan = planDialogPackageImport(packagePath, target);

    writePackageDirectory(
        plan.targetDirectory,
        files.dialogJson,
        files.actionsJs,
        files.supportFiles
    );
    writeRegistryEntry(plan.registryPath, plan.definition);

    return plan;
};
