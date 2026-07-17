import type {
    WebR
} from "webr";
import {
    mountWebRFilesystem,
    type WebRFilesystemMount,
    type WebRFilesystemMountResult
} from "./webRFilesystemMount";
import {
    createWebRPackageLibraryBootstrapPlan,
    type WebRPackageLibraryAsset
} from "./webRPackageLibraryPolicy";


export interface WebRBootstrapPlan {
    mounts?: WebRFilesystemMount[];
    sourceFiles?: string[];
    commands?: string[];
    packageLibrary?: unknown;
    helperAssets?: unknown;
    startupCommands?: unknown;
}


export interface WebRBootstrapResult {
    mounts: WebRFilesystemMountResult[];
    packageInstallShim: boolean;
    sourceFiles: string[];
    commands: string[];
}

export interface WebRPackageLibraryMountResult {
    mounted: true;
    mountpoint: string;
    commands: string[];
}


const quoteRString = function(value: string): string {
    return JSON.stringify(value);
};


const readStringArray = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map(String).map((one) => one.trim()).filter(Boolean)
        : [];
};


export const installWebRPackageInstallShim = async function(runtime: WebR): Promise<void> {
    await runtime.evalRVoid([
        "webr::shim_install()",
        "webr::pager_install()"
    ].join("\n"));
};


export const normalizeWebRBootstrapPlan = function(
    value: unknown
): WebRBootstrapPlan {
    if (!value || typeof value !== "object") {
        return {};
    }

    const plan = value as WebRBootstrapPlan;
    const policyPlan = createWebRPackageLibraryBootstrapPlan({
        packageLibrary: plan.packageLibrary as never,
        helperAssets: plan.helperAssets as never,
        startupCommands: plan.startupCommands as never
    });
    const declaredMounts = Array.isArray(plan.mounts) ? plan.mounts : [];

    return {
        mounts: [
            ...(policyPlan.mounts || []),
            ...declaredMounts
        ],
        sourceFiles: [
            ...(policyPlan.sourceFiles || []),
            ...readStringArray(plan.sourceFiles)
        ],
        commands: [
            ...(policyPlan.commands || []),
            ...readStringArray(plan.commands)
        ]
    };
};


export const runWebRBootstrap = async function(
    runtime: WebR,
    plan: WebRBootstrapPlan
): Promise<WebRBootstrapResult> {
    const mounts: WebRFilesystemMountResult[] = [];
    const sourceFiles = readStringArray(plan.sourceFiles);
    const commands = readStringArray(plan.commands);

    for (const mount of plan.mounts || []) {
        mounts.push(await mountWebRFilesystem(runtime, mount));
    }

    await installWebRPackageInstallShim(runtime);

    for (const sourceFile of sourceFiles) {
        await runtime.evalRVoid(`source(${quoteRString(sourceFile)})`);
    }

    for (const command of commands) {
        await runtime.evalRVoid(command);
    }

    return {
        mounts,
        packageInstallShim: true,
        sourceFiles,
        commands
    };
};


export const mountWebRPackageLibrary = async function(
    runtime: WebR,
    asset: WebRPackageLibraryAsset
): Promise<WebRPackageLibraryMountResult> {
    const plan = createWebRPackageLibraryBootstrapPlan({
        packageLibrary: asset
    });
    const mount = plan.mounts?.[0];

    if (!mount) {
        throw new Error("WebR package library mount plan is empty.");
    }

    const result = await mountWebRFilesystem(runtime, mount);
    const commands = readStringArray(plan.commands);

    for (const command of commands) {
        await runtime.evalRVoid(command);
    }

    return {
        mounted: true,
        mountpoint: result.mountpoint,
        commands
    };
};
