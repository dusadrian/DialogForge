import {
    rString
} from "../commands/rLiteral";


interface RPackageVersionResponse {
    ok: boolean;
    result?: unknown;
}

interface RPackageVersionClient {
    execute(request: {
        id: string;
        method: string;
        params: Record<string, unknown>;
    }): Promise<RPackageVersionResponse>;
}


export interface RPackageVersionReaderOptions {
    getClient(): RPackageVersionClient | null;
    createRequestId(prefix: string): string;
}


export const createRPackageVersionReader = function(
    options: RPackageVersionReaderOptions
) {
    return async function(packageName: string): Promise<string> {
        const client = options.getClient();

        if (!client) {
            return "";
        }

        const packageLiteral = rString(packageName);
        const command = [
            `cat(if (requireNamespace(${packageLiteral}, quietly = TRUE)) `,
            `as.character(utils::packageVersion(${packageLiteral})) `,
            "else \"\")"
        ].join("");
        const result = await client.execute({
            id: options.createRequestId("package-version"),
            method: "evaluate_code",
            params: {
                code: command,
                mode: "silent",
                timeoutMs: 5000
            }
        });

        return result.ok ? String(result.result || "").trim() : "";
    };
};
