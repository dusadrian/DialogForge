import type { RuntimeSessionManager } from "../provider-contract/runtimeProvider";
import { createRuntimeExtensionMethodRequest } from "../extensions/runtimeExtensionProtocol";
import { createDatasetViewerEmptyFilterMaskPage } from "./datasetViewerSnapshotAdapter";


export const readRuntimeDatasetFilterMask = async function(
    runtime: Pick<RuntimeSessionManager, "executeRuntimeMethod">,
    value: unknown,
    options: {
        fallbackRows: number;
        readFilterState(name: string): { command?: string } | null | undefined;
    }
): Promise<unknown> {
    const page = createDatasetViewerEmptyFilterMaskPage(value, options.fallbackRows);
    page.name = page.name.trim();
    if (!page.name) {
        return null;
    }

    const filter = options.readFilterState(page.name);
    if (filter?.command) {
        const result = await runtime.executeRuntimeMethod(createRuntimeExtensionMethodRequest({
            method: "workspace.dataset_filter_mask",
            params: {
                name: page.name, code: filter.command,
                rowStart: page.rowStart, rowCount: page.rowCount
            },
            source: "base-app.dataset-editor"
        }));
        if (result.status === "ready" && result.value && typeof result.value === "object") {
            return result.value;
        }
    }

    return page;
};
