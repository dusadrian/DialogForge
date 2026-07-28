import {
    createRuntimeExtensionMethodRequest
} from "../extensions/runtimeExtensionProtocol";
import type {
    RuntimeExtensionMethodResult
} from "../provider-contract/runtimeProvider";


export interface RuntimeVersionReader {
    executeRuntimeMethod(input: {
        method: string;
        params: Record<string, unknown>;
        source: string;
    }): Promise<RuntimeExtensionMethodResult>;
}


export const readRuntimeVersion = async function(
    reader: RuntimeVersionReader,
    source: string
): Promise<string> {
    try {
        const result = await reader.executeRuntimeMethod(
            createRuntimeExtensionMethodRequest({
                method: "runtime.version",
                source
            })
        );

        return result.status === "ready"
            ? String(result.value || "").trim()
            : "";
    }
    catch {
        return "";
    }
};
