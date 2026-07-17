import {
    createRHelpFallbackHtml,
    parseRHelpHttpdPath,
    parseRHelpTopicFromUrl,
    readRHelpHttpdContentType
} from "../../help/rHelpDocument";
import {
    buildHelpExampleCommand
} from "../../help/helpCommandUrl";


export interface WebRHelpDocument {
    html: string;
    topic: string;
    packageName: string;
    baseUrl: string;
}

export interface WebRHelpPageFetchResult {
    ok: boolean;
    status: number;
    url?: string;
    text?: string;
    contentType?: string;
    error?: string;
}

export interface WebRHelpExampleRunResult {
    status: "ready" | "invalid" | "error";
    text?: string;
    message?: string;
}

export type CaptureWebRHiddenText = (command: string) => Promise<string>;


const buildWebRHelpHttpdCommand = function(pathname: unknown): string {
    return [
        "local({",
        `  .path <- ${JSON.stringify(String(pathname || ""))}`,
        "  .out <- NULL",
        "  invisible(capture.output({",
        "    .out <- tryCatch(tools:::httpd(.path, list()), error = function(.error) list(error = conditionMessage(.error)))",
        "  }))",
        "  if (!is.null(.out$error)) stop(.out$error)",
        "  if (!is.null(.out$payload)) {",
        "    cat(.out$payload)",
        "  } else if (!is.null(.out$file) && file.exists(.out$file)) {",
        "    cat(paste(readLines(.out$file, warn = FALSE), collapse = \"\\n\"))",
        "  } else {",
        "    stop(\"help-page-unavailable\")",
        "  }",
        "})"
    ].join("\n");
};


const buildWebRHelpTopicPathCommand = function(topic: unknown, packageName = ""): string {
    return [
        "local({",
        `  .DialogForgeHelpTopic <- ${JSON.stringify(String(topic || ""))}`,
        `  .DialogForgeHelpPackage <- ${JSON.stringify(String(packageName || ""))}`,
        "  .DialogForgeHelp <- tryCatch(",
        "    if (nzchar(.DialogForgeHelpPackage)) {",
        "      utils::help(.DialogForgeHelpTopic, package = .DialogForgeHelpPackage)",
        "    } else {",
        "      utils::help(.DialogForgeHelpTopic)",
        "    },",
        "    error = function(.DialogForgeHelpError) NULL",
        "  )",
        "  if ((is.null(.DialogForgeHelp) || length(.DialogForgeHelp) == 0L) && !nzchar(.DialogForgeHelpPackage)) {",
        "    .DialogForgeHelpSearch <- sub('^package:', '', grep('^package:', search(), value = TRUE))",
        "    .DialogForgeHelpSearch <- .DialogForgeHelpSearch[nzchar(.DialogForgeHelpSearch)]",
        "    for (.DialogForgeHelpCandidate in .DialogForgeHelpSearch) {",
        "      .DialogForgeHelp <- tryCatch(",
        "        utils::help(.DialogForgeHelpTopic, package = .DialogForgeHelpCandidate),",
        "        error = function(.DialogForgeHelpError) NULL",
        "      )",
        "      if (!is.null(.DialogForgeHelp) && length(.DialogForgeHelp) > 0L) {",
        "        break",
        "      }",
        "    }",
        "  }",
        "  if (is.null(.DialogForgeHelp) || length(.DialogForgeHelp) == 0L) {",
        "    cat(\"\")",
        "  } else {",
        "    .DialogForgeHelpPath <- tryCatch(as.character(.DialogForgeHelp)[[1L]], error = function(.DialogForgeHelpError) '')",
        "    if (!nzchar(.DialogForgeHelpPath)) {",
        "      cat(\"\")",
        "    } else {",
        "      cat(.DialogForgeHelpPath)",
        "    }",
        "  }",
        "})"
    ].join("\n");
};


export const prepareWebRHelpDocumentHtml = function(html: unknown): string {
    return String(html || "")
        .replace(/<link\b[^>]*>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<img\b[^>]*class=["'][^"']*\btoplogo\b[^"']*["'][^>]*>/gi, "");
};


export const fetchWebRHelpHttpdPath = async function(
    pathname: unknown,
    captureHiddenText: CaptureWebRHiddenText
): Promise<string> {
    const command = buildWebRHelpHttpdCommand(pathname);

    return String(await captureHiddenText(command) || "").trim();
};


export const fetchWebRHelpTopicDocument = async function(
    topic: unknown,
    packageName: string,
    origin: string,
    captureHiddenText: CaptureWebRHiddenText
): Promise<WebRHelpDocument> {
    const command = buildWebRHelpTopicPathCommand(topic, packageName);
    const pathValue = String(await captureHiddenText(command) || "").trim();
    const pathMatch = pathValue.match(/\/library\/([^/]+)\/html\/([^/]+)\.html$/)
        || pathValue.match(/\/library\/([^/]+)\/help\/([^/]+)$/)
        || pathValue.match(/\/\.?dialogr-library\/([^/]+)\/html\/([^/]+)\.html$/)
        || pathValue.match(/\/\.?dialogr-library\/([^/]+)\/help\/([^/]+)$/);
    const resolvedPackage = String(packageName || pathMatch?.[1] || "").trim();
    const resolvedTopic = String(topic || pathMatch?.[2] || "").trim();
    const resolvedHelpFileTopic = String(pathMatch?.[2] || topic || "").trim();
    const baseUrl = resolvedPackage && resolvedHelpFileTopic
        ? `${origin}/library/${encodeURIComponent(resolvedPackage)}/html/${encodeURIComponent(resolvedHelpFileTopic)}.html`
        : "";
    const html = baseUrl
        ? await fetchWebRHelpHttpdPath(new URL(baseUrl).pathname, captureHiddenText)
        : "";

    return {
        html: prepareWebRHelpDocumentHtml(html).trim()
            || createRHelpFallbackHtml(
                topic,
                `No help page was found for ${packageName ? `${packageName}::` : ""}${topic}.`
            ),
        topic: resolvedTopic || String(topic || "").trim(),
        packageName: resolvedPackage,
        baseUrl
    };
};


export const fetchWebRHelpPageByUrl = async function(
    value: unknown,
    origin: string,
    captureHiddenText: CaptureWebRHiddenText
): Promise<WebRHelpPageFetchResult> {
    const target = parseRHelpTopicFromUrl(value, origin);
    const httpdPath = target?.path || parseRHelpHttpdPath(value, origin);

    if (!httpdPath) {
        return {
            ok: false,
            status: 404,
            error: "unsupported-help-url"
        };
    }

    try {
        const text = await fetchWebRHelpHttpdPath(httpdPath, captureHiddenText);
        const contentType = readRHelpHttpdContentType(httpdPath);

        return {
            ok: true,
            status: 200,
            url: `${origin}${httpdPath}`,
            text: contentType.startsWith("text/html")
                ? prepareWebRHelpDocumentHtml(text)
                : text,
            contentType
        };
    }
    catch (error) {
        return {
            ok: false,
            status: 500,
            error: error instanceof Error ? error.message : String(error)
        };
    }
};


export const runWebRHelpExample = async function(
    input: {
        topic?: unknown;
        package?: unknown;
    } = {},
    captureHiddenText: CaptureWebRHiddenText
): Promise<WebRHelpExampleRunResult> {
    const command = buildHelpExampleCommand(
        String(input.topic || ""),
        String(input.package || "")
    );

    if (!command) {
        return {
            status: "invalid",
            message: "Invalid help example request."
        };
    }

    try {
        const text = await captureHiddenText(command);

        return {
            status: "ready",
            text: String(text || "").trim()
        };
    }
    catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error)
        };
    }
};
