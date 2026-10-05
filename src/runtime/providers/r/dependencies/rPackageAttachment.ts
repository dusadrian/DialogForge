import {
    createRLibraryLoadCommand,
    createRMissingPackageMessage,
    createRPackageLoadFailureMessage,
    createRRuntimePackageStatusCommand,
    parseRRuntimePackageStatus
} from "./runtimePackageRequirements";
import { parseRPackageList } from "../commands/rCommandIntents";
import { requireCurrentRPackageRuntime } from "./rPackageRuntimeGuard";
import {
    requireSuccessfulRuntimeCommand,
    type RuntimeCommandReceipt,
    type RuntimeCommandResult
} from "../../../commands/runtimeCommandReceipt";


export type RPackageAttachmentReceipt = RuntimeCommandReceipt;


export const requireSuccessfulRPackageAttachment = function(
    packageName: string,
    receipt: RuntimeCommandResult,
    isCurrent?: () => boolean
): void {
    requireCurrentRPackageRuntime(isCurrent);
    requireSuccessfulRuntimeCommand(receipt, createRPackageLoadFailureMessage(packageName));
};


export interface RPackageAttachmentBindings {
    isCurrent?(): boolean;
    isAttached(packageName: string): Promise<boolean>;
    attach(packageName: string, command: string): Promise<void>;
    packageReady?(packageName: string): void;
    packagesLoaded?(packageNames: readonly string[]): Promise<void>;
}


export const attachRequiredRPackages = async function(
    packageNames: readonly string[],
    bindings: RPackageAttachmentBindings
): Promise<string[]> {
    const loadedPackages: string[] = [];
    let attachmentFailed = false;
    let attachmentError: unknown;

    try {
        for (const packageName of packageNames) {
            requireCurrentRPackageRuntime(bindings.isCurrent);
            const attached = await bindings.isAttached(packageName);
            requireCurrentRPackageRuntime(bindings.isCurrent);
            if (!attached) {
                await bindings.attach(packageName, createRLibraryLoadCommand(packageName));
                requireCurrentRPackageRuntime(bindings.isCurrent);
                const attachedAfterLoad = await bindings.isAttached(packageName);
                requireCurrentRPackageRuntime(bindings.isCurrent);
                if (!attachedAfterLoad) {
                    throw new Error(createRPackageLoadFailureMessage(packageName));
                }
                loadedPackages.push(packageName);
            }
            bindings.packageReady?.(packageName);
        }
        requireCurrentRPackageRuntime(bindings.isCurrent);
    }
    catch (error) {
        attachmentFailed = true;
        attachmentError = error;
    }

    if (
        loadedPackages.length > 0
        && (!bindings.isCurrent || bindings.isCurrent())
    ) {
        try {
            await bindings.packagesLoaded?.(loadedPackages);
            requireCurrentRPackageRuntime(bindings.isCurrent);
        }
        catch (error) {
            if (attachmentFailed) {
                const attachmentMessage = attachmentError instanceof Error
                    ? attachmentError.message : String(attachmentError);
                const deliveryMessage = error instanceof Error ? error.message : String(error);
                throw new AggregateError([attachmentError, error],
                    `${attachmentMessage}\nPackage workspace refresh failed: ${deliveryMessage}`);
            }
            throw error;
        }
    }

    if (attachmentFailed) {
        throw attachmentError;
    }

    return loadedPackages;
};


export const loadRequiredRPackages = async function(
    packages: unknown,
    bindings: {
        isCurrent?: RPackageAttachmentBindings["isCurrent"];
        readStatus(command: string): Promise<unknown>;
        attach: RPackageAttachmentBindings["attach"];
        packageReady?: RPackageAttachmentBindings["packageReady"];
        packagesLoaded?: RPackageAttachmentBindings["packagesLoaded"];
        missingPackages?(message: string): void;
    }
): Promise<string[]> {
    const packageNames = parseRPackageList(packages);

    if (!packageNames.length) {
        return [];
    }

    requireCurrentRPackageRuntime(bindings.isCurrent);
    const statusValue = await bindings.readStatus(createRRuntimePackageStatusCommand(packageNames));
    requireCurrentRPackageRuntime(bindings.isCurrent);
    const status = parseRRuntimePackageStatus(statusValue, packageNames);

    if (status.missing.length) {
        const message = createRMissingPackageMessage(status.missing);

        bindings.missingPackages?.(message);
        throw new Error(message);
    }

    return attachRequiredRPackages(packageNames, {
        isCurrent: bindings.isCurrent,
        isAttached: async function(packageName) {
            requireCurrentRPackageRuntime(bindings.isCurrent);
            const value = await bindings.readStatus(
                createRRuntimePackageStatusCommand([packageName])
            );
            requireCurrentRPackageRuntime(bindings.isCurrent);
            return parseRRuntimePackageStatus(value, [packageName]).attached.includes(packageName);
        },
        attach: bindings.attach,
        packageReady: bindings.packageReady,
        packagesLoaded: bindings.packagesLoaded
    });
};
