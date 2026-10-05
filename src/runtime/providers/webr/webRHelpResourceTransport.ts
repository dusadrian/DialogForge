import { decodeRHelpResourcePacket, rHelpResourceMaxBytes } from "../../help/rHelpResourceProtocol";
import type { ResourceBufferResult } from "../../../core/contracts/hostAdapter";


export const buildWebRHelpResourceCommand = function(pathname: string, search = ""): string {
    // Native R receives a named character vector from its HTTP socket parser.
    // The worker has no socket, so carry those request fields to the same handler.
    const fields = search.replace(/^\?/, "").split("&");
    const decode = function(value: string): string {
        const decoded = decodeURIComponent(value.replace(/\+/g, " "));
        if (decoded.includes("\0")) {
            throw new Error("invalid-help-resource-query");
        }
        return JSON.stringify(decoded);
    };
    const names: string[] = [];
    const values: string[] = [];
    if (search && search !== "?") {
        for (const field of fields) {
            const separator = field.indexOf("=");
            names.push(decode(separator < 0 ? "" : field.slice(0, separator)));
            values.push(decode(separator < 0 ? field : field.slice(separator + 1)));
        }
    }
    const query = values.length
        ? `base::structure(base::c(${values.join(", ")}), names = base::c(${names.join(", ")}))`
        : "NULL";
    // Match R's HTTP handler result positions (Rhttpd.c); tools::httpd remains
    // the page/resource owner. This adapter only carries its bytes off-worker.
    return [
        "base::local({",
        `    .path <- ${JSON.stringify(pathname)}`,
        `    .query <- ${query}`,
        '    .runtime <- base::as.environment("DialogApp")',
        "    .out <- NULL",
        "    base::invisible(utils::capture.output(.out <- tools:::httpd(.path, .query)))",
        '    if (!base::is.list(.out) || !base::length(.out)) {',
        '        base::stop("help-resource-unavailable")',
        "    }",
        "    .out <- base::unclass(.out)",
        '    .type <- "text/html"',
        "    if (base::length(.out) >= 2L && base::is.character(.out[[2L]]) && base::length(.out[[2L]])) {",
        "        .type <- .out[[2L]][[1L]]",
        "    }",
        "    .headers <- base::character(0)",
        "    if (base::length(.out) >= 3L && base::is.character(.out[[3L]])) {",
        "        .headers <- base::unclass(.out[[3L]])",
        "    }",
        "    .status <- 200L",
        "    if (base::length(.out) >= 4L) {",
        "        .status <- base::as.integer(.out[[4L]])",
        "    }",
        "    .value <- .out[[1L]]",
        "    .file <- NULL",
        '    if (!base::is.null(base::names(.out)) && base::identical(base::names(.out)[[1L]], "file")) {',
        "        .file <- .value[[1L]]",
        "    }",
        '    if (base::is.character(.value) && base::length(.value) > 1L && base::identical(.value[[1L]], "*FILE*")) {',
        "        .file <- .value[[2L]]",
        "    }",
        "    if (!base::is.null(.file)) {",
        '        .connection <- base::file(.file, "rb")',
        "        .body <- base::tryCatch(",
        `            base::readBin(.connection, "raw", n = ${rHelpResourceMaxBytes + 1}L),`,
        "            finally = base::close(.connection)",
        "        )",
        "    } else if (base::is.raw(.value)) {",
        "        .body <- base::unclass(.value)",
        "    } else if (base::is.character(.value) && base::length(.value)) {",
        "        .body <- base::charToRaw(base::enc2utf8(.value[[1L]]))",
        "    } else {",
        '        base::stop("help-resource-unavailable")',
        "    }",
        `    if (base::length(.body) > ${rHelpResourceMaxBytes}L) {`,
        '        base::stop("help-resource-too-large")',
        "    }",
        '    .hex <- base::paste(base::sprintf("%02x", base::as.integer(.body)), collapse = "")',
        // Hexadecimal bytes contain no JSON escapes. Do not walk a large binary
        // resource again through the runtime's general text-escaping helper.
        '    .header_json <- base::paste(base::vapply(.headers, .runtime$json_str, base::character(1)), collapse = ",")',
        "    base::cat(base::paste0(",
        '        \'{"status":\', .status, \',"contentType":\', .runtime$json_str(.type),',
        '        \',"headers":[\', .header_json, \'],"body":"\', .hex, \'"}\'',
        "    ))",
        "})"
    ].join("\n");
};


export const fetchWebRHelpResource = async function(
    pathname: string,
    url: string,
    captureHiddenText: (command: string) => Promise<string>
): Promise<ResourceBufferResult & { headers: string[] }> {
    const search = new URL(url, "http://localhost").search;
    const packet = await captureHiddenText(buildWebRHelpResourceCommand(pathname, search));
    return decodeRHelpResourcePacket(packet, url);
};
