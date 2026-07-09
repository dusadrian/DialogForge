export type HelpCommandUrlResult =
    | { kind: "help"; value: string }
    | { kind: "run"; value: string }
    | { kind: "vignette"; value: string };


const appHelpScheme = "app:";
const appHelpAuthority = "app-shell";
const appHelpPath = "/cli";


export const parseHelpCommandUrl = function(value: unknown): HelpCommandUrlResult | null {
    try {
        const raw = String(value || "").trim();

        if (!raw) {
            return null;
        }

        const parsed = new URL(raw);

        if (parsed.protocol !== appHelpScheme) {
            return null;
        }

        if (parsed.hostname !== appHelpAuthority) {
            return null;
        }

        if (parsed.pathname !== appHelpPath) {
            return null;
        }

        const command = String(parsed.searchParams.get("command") || "").trim();
        const match = command.match(/^x-r-(help|run|vignette):(.+)$/);

        if (!match) {
            return null;
        }

        const kind = String(match[1] || "").trim();
        const payload = decodeURIComponent(String(match[2] || "").trim());

        if (!payload) {
            return null;
        }

        if (kind === "help") {
            return { kind: "help", value: payload };
        }

        if (kind === "run") {
            return { kind: "run", value: payload };
        }

        if (kind === "vignette") {
            return { kind: "vignette", value: payload };
        }

        return null;
    }
    catch {
        return null;
    }
};


export const createHelpCommandUrl = function(kind: HelpCommandUrlResult["kind"], value: string): string {
    const payload = String(value || "").trim();

    if (!payload) {
        return "";
    }

    return `app://${appHelpAuthority}${appHelpPath}?command=x-r-${kind}:${encodeURIComponent(payload)}`;
};


const escapeRString = function(value: unknown): string {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
};


export const buildHelpExampleCommand = function(topic: string, packageName = ""): string {
    const normalizedTopic = String(topic || "").trim();
    const normalizedPackage = String(packageName || "").trim();

    if (!normalizedTopic) {
        return "";
    }

    if (normalizedPackage) {
        return `example("${escapeRString(normalizedTopic)}", package = "${escapeRString(normalizedPackage)}")`;
    }

    return `example("${escapeRString(normalizedTopic)}")`;
};
