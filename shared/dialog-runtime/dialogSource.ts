import * as fs from "fs";
import * as path from "path";

import type {
    DialogDefinition
} from "../core/contracts/applicationComposition";


export interface DialogSourceSummary {
    status: string;
    sourcePath: string;
    title: string;
    name: string;
    dependencies: string[];
    hasCustomJS: boolean;
    customJSUses: string[];
    externalCalls: string[];
    productExternalCalls: string[];
    sharedExternalCalls: string[];
    customJS: string;
    syntaxCommand: string;
    defaultElementCount: number;
    elementCount: number;
}


export interface DialogSourceControlSummary {
    id: string;
    type: string;
    name: string;
    value: string;
    label: string;
    dataValue: string;
    group: string;
    selection: string;
    items: string;
    order: string;
    isSelected: boolean;
    isEnabled: boolean;
    isVisible: boolean;
    minval: number;
    maxval: number;
    startval: number;
    left: number;
    top: number;
    width: number;
    height: number;
}


export interface DialogSourceElementSummary {
    status: string;
    sourcePath: string;
    controls: DialogSourceControlSummary[];
}


const parseDependencies = function(value: unknown): string[] {
    return String(value || "")
        .split(/[;,\n]/g)
        .map((entry) => {
            return entry.trim();
        })
        .filter((entry) => {
            return entry.length > 0;
        });
};


const resolveDialogSourcePath = function(rootDir: string, dialog: DialogDefinition): string {
    if (!dialog.sourceFile || !dialog.owner) {
        return "";
    }

    return path.join(rootDir, dialog.owner, "dialogs", dialog.sourceFile);
};


const asNumber = function(value: unknown): number {
    const out = Number(value);
    return Number.isFinite(out) ? out : 0;
};


const normalizeControl = function(value: unknown): DialogSourceControlSummary {
    const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};

    return {
        id: String(entry.id || ""),
        type: String(entry.type || ""),
        name: String(entry.nameid || entry.name || ""),
        value: String(entry.value || ""),
        label: String(entry.label || ""),
        dataValue: String(entry.dataValue || ""),
        group: String(entry.group || ""),
        selection: String(entry.selection || ""),
        items: String(entry.items || ""),
        order: String(entry.order || ""),
        isSelected: entry.isSelected === true,
        isEnabled: entry.isEnabled !== false,
        isVisible: entry.isVisible !== false,
        minval: asNumber(entry.minval),
        maxval: asNumber(entry.maxval),
        startval: asNumber(entry.startval),
        left: asNumber(entry.left),
        top: asNumber(entry.top),
        width: asNumber(entry.width || entry.maxWidth),
        height: asNumber(entry.height)
    };
};


const listCustomJSUses = function(code: string): string[] {
    const uses = new Set<string>();
    const patterns: Array<[string, RegExp]> = [
        ["run", /\brun\s*\(/],
        ["updateSyntax", /\bupdateSyntax\s*\(/],
        ["addValue", /\baddValue\s*\(/],
        ["clearValue", /\bclearValue\s*\(/],
        ["callExternal", /\bcallExternal\s*\(/],
        ["consumeGoToContext", /\bconsumeGoToContext\s*\(/],
        ["getDatasetEditorState", /\bgetDatasetEditorState\s*\(/],
        ["getImportPreview", /\bgetImportPreview\s*\(/],
        ["getWorkingDirectory", /\bgetWorkingDirectory\s*\(/],
        ["gotoDatasetEditorCase", /\bgotoDatasetEditorCase\s*\(/],
        ["gotoDatasetEditorVariable", /\bgotoDatasetEditorVariable\s*\(/],
        ["listObjects", /\blistObjects\s*\(/],
        ["listColumns", /\blistColumns\s*\(/],
        ["openImportFile", /\bopenImportFile\s*\(/],
        ["getSelected", /\bgetSelected\s*\(/],
        ["setValue", /\bsetValue\s*\(/],
        ["onChange", /\bonChange\s*\(/],
        ["onClick", /\bonClick\s*\(/]
    ];

    patterns.forEach(([name, pattern]) => {
        if (pattern.test(code)) {
            uses.add(name);
        }
    });

    return Array.from(uses).sort();
};


const listExternalCalls = function(code: string): string[] {
    const calls = new Set<string>();
    const pattern = /\bcallExternal\s*\(\s*["']([^"']+)["']/g;
    let match = pattern.exec(code);

    while (match) {
        calls.add(String(match[1] || ""));
        match = pattern.exec(code);
    }

    return Array.from(calls).sort();
};


export const readDialogSourceSummary = function(rootDir: string, dialog: DialogDefinition): DialogSourceSummary {
    const sourcePath = resolveDialogSourcePath(rootDir, dialog);

    if (!sourcePath || !fs.existsSync(sourcePath)) {
        return {
            status: "missing-source",
            sourcePath,
            title: dialog.label || dialog.id,
            name: dialog.id,
            dependencies: dialog.rPackages || [],
            hasCustomJS: false,
            customJSUses: [],
            externalCalls: [],
            productExternalCalls: [],
            sharedExternalCalls: [],
            customJS: "",
            syntaxCommand: "",
            defaultElementCount: 0,
            elementCount: 0
        };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
        const properties = parsed && typeof parsed === "object" ? parsed.properties || {} : {};
        const syntax = parsed && typeof parsed === "object" ? parsed.syntax || {} : {};
        const customJS = typeof parsed.customJS === "string" ? parsed.customJS : "";
        const dependencies = parseDependencies(properties.dependencies).concat(dialog.rPackages || []);
        const externalCalls = listExternalCalls(customJS);
        const productExternalCalls = externalCalls.filter((name) => {
            return name.includes(".");
        });
        const sharedExternalCalls = externalCalls.filter((name) => {
            return !name.includes(".");
        });

        return {
            status: "ready",
            sourcePath,
            title: String(properties.title || dialog.label || dialog.id),
            name: String(properties.name || dialog.id),
            dependencies: Array.from(new Set(dependencies)),
            hasCustomJS: customJS.length > 0,
            customJSUses: listCustomJSUses(customJS),
            externalCalls,
            productExternalCalls,
            sharedExternalCalls,
            customJS,
            syntaxCommand: String(syntax.command || ""),
            defaultElementCount: Array.isArray(syntax.defaultElements) ? syntax.defaultElements.length : 0,
            elementCount: Array.isArray(parsed.elements) ? parsed.elements.length : 0
        };
    } catch {
        return {
            status: "invalid-source",
            sourcePath,
            title: dialog.label || dialog.id,
            name: dialog.id,
            dependencies: dialog.rPackages || [],
            hasCustomJS: false,
            customJSUses: [],
            externalCalls: [],
            productExternalCalls: [],
            sharedExternalCalls: [],
            customJS: "",
            syntaxCommand: "",
            defaultElementCount: 0,
            elementCount: 0
        };
    }
};


export const readDialogSourceElements = function(rootDir: string, dialog: DialogDefinition): DialogSourceElementSummary {
    const sourcePath = resolveDialogSourcePath(rootDir, dialog);

    if (!sourcePath || !fs.existsSync(sourcePath)) {
        return {
            status: "missing-source",
            sourcePath,
            controls: []
        };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
        const elements: unknown[] = Array.isArray(parsed.elements) ? parsed.elements : [];

        return {
            status: "ready",
            sourcePath,
            controls: elements.map(normalizeControl).filter((control) => {
                return Boolean(control.id || control.name || control.type);
            })
        };
    } catch {
        return {
            status: "invalid-source",
            sourcePath,
            controls: []
        };
    }
};
