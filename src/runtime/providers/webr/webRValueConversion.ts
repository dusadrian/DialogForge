import type {
    WebR
} from "webr";


const scalarProbe = [
    "if (is.null(.DialogForgeValue)) {",
    "  \"\"",
    "} else if (length(.DialogForgeValue) == 1L) {",
    "  as.character(.DialogForgeValue)",
    "} else {",
    "  paste(as.character(.DialogForgeValue), collapse = \"\\n\")",
    "}"
].join("\n");


export const evaluateWebRInvisibleValue = async function(
    runtime: WebR,
    query: string
): Promise<unknown> {
    try {
        return await runtime.evalRRaw(query, "string");
    }
    catch {
        return await runtime.evalRString(
            [
                ".DialogForgeValue <- ({",
                query,
                "})",
                scalarProbe
            ].join("\n")
        );
    }
};
