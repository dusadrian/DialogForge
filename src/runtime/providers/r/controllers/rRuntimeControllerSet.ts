import type {
    RuntimeCommandExecutionResult,
    RuntimeExtensionController,
    RuntimeImportController,
    RuntimeProductCommandController,
    RuntimeQueryController,
    RuntimeSessionSnapshot,
    RuntimeTabularController,
    RuntimeToolController,
    RuntimeWorkspaceController,
    TranscriptEvent
} from "../../../provider-contract/runtimeProvider";
import type {
    RRuntimeControlClient
} from "../protocol/runtimeControlClient";
import {
    createRExtensionController
} from "./rExtensionController";
import {
    createRImportController
} from "./rImportController";
import {
    createRPackageVersionReader
} from "./rPackageVersionReader";
import {
    createRProductCommandController
} from "./rProductCommandController";
import {
    createRQueryController
} from "./rQueryController";
import {
    createRTabularMetadataController
} from "./rTabularMetadataController";
import {
    createRTabularMutationController
} from "./rTabularMutationController";
import {
    createRToolController
} from "./rToolController";
import {
    createRWorkspaceController
} from "./rWorkspaceController";


export interface RRuntimeControllerSet {
    workspaceController: RuntimeWorkspaceController;
    tabularController: RuntimeTabularController;
    importController: RuntimeImportController;
    queryController: RuntimeQueryController;
    productCommandController: RuntimeProductCommandController;
    toolController: RuntimeToolController;
    extensionController: RuntimeExtensionController;
}


export interface RRuntimeControllerSetOptions {
    getClient(): RRuntimeControlClient | null;
    createRequestId(prefix: string): string;
    executeVisibleCommand(
        commandText: string,
        source: string,
        snapshot: RuntimeSessionSnapshot
    ): Promise<RuntimeCommandExecutionResult>;
    transcriptHasFailure(events: TranscriptEvent[]): boolean;
    interrupt(): boolean | null;
    onVisibleWorkspaceRefresh?(): void;
}


export const createRRuntimeControllerSet = function(
    options: RRuntimeControllerSetOptions
): RRuntimeControllerSet {
    const checkPackageVersion = createRPackageVersionReader({
        getClient: options.getClient,
        createRequestId: options.createRequestId
    });
    const metadataController = createRTabularMetadataController({
        getClient: options.getClient,
        createRequestId: options.createRequestId,
        executeVisibleCommand: options.executeVisibleCommand,
        transcriptHasFailure: options.transcriptHasFailure
    });
    const mutationController = createRTabularMutationController({
        getClient: options.getClient,
        createRequestId: options.createRequestId,
        executeVisibleCommand: options.executeVisibleCommand,
        transcriptHasFailure: options.transcriptHasFailure
    });

    return {
        workspaceController: createRWorkspaceController({
            getClient: options.getClient,
            createRequestId: options.createRequestId,
            onVisibleWorkspaceRefresh: options.onVisibleWorkspaceRefresh
        }),
        tabularController: {
            ...metadataController,
            ...mutationController
        },
        importController: createRImportController({
            getClient: options.getClient,
            createRequestId: options.createRequestId,
            executeVisibleCommand: options.executeVisibleCommand,
            transcriptHasFailure: options.transcriptHasFailure
        }),
        queryController: createRQueryController({
            getClient: options.getClient,
            createRequestId: options.createRequestId
        }),
        productCommandController: createRProductCommandController({
            getClient: options.getClient,
            checkPackageVersion
        }),
        toolController: createRToolController({
            getClient: options.getClient,
            createRequestId: options.createRequestId,
            checkPackageVersion
        }),
        extensionController: createRExtensionController({
            getClient: options.getClient,
            createRequestId: options.createRequestId,
            interrupt: options.interrupt
        })
    };
};
