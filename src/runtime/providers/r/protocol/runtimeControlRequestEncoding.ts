export interface RuntimeControlRequestInput {
    id: string;
    method: string;
    params?: Record<string, unknown>;
}


const dedicatedRuntimeRequestPrefix = "DMRUNTIME1";
const arrayParamSeparator = "\u001f";


const safeEncode = function(value: unknown): string {
    try {
        return encodeURIComponent(String(value ?? ""));
    }
    catch {
        return "";
    }
};


const encodeArray = function(value: unknown): string {
    return Array.isArray(value) ? value.join(arrayParamSeparator) : "";
};


const encodeCategories = function(value: unknown): {
    values: string;
    labels: string;
    missing: string;
} {
    const categories = Array.isArray(value) ? value : [];

    return {
        values: categories.map((entry) => {
            const category = entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : {};

            return String(category.value ?? "");
        }).join(arrayParamSeparator),
        labels: categories.map((entry) => {
            const category = entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : {};

            return String(category.label ?? "");
        }).join(arrayParamSeparator),
        missing: categories.map((entry) => {
            const category = entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : {};

            return category.isMissing === true ? "1" : "0";
        }).join(arrayParamSeparator)
    };
};


const encodeMissingRange = function(value: unknown): {
    minimum: string;
    maximum: string;
} {
    if (value === null) {
        return {
            minimum: "__NULL__",
            maximum: "__NULL__"
        };
    }

    if (value && typeof value === "object") {
        const range = value as Record<string, unknown>;

        return {
            minimum: String(range.min ?? ""),
            maximum: String(range.max ?? "")
        };
    }

    return {
        minimum: "",
        maximum: ""
    };
};


export const encodeRuntimeControlRequest = function(
    request: RuntimeControlRequestInput,
    token = ""
): string {
    const params = request.params || {};
    const hasType = Object.prototype.hasOwnProperty.call(params, "type");
    const hasMeasure = Object.prototype.hasOwnProperty.call(params, "measure");
    const hasLabel = Object.prototype.hasOwnProperty.call(params, "label");
    const hasWidth = Object.prototype.hasOwnProperty.call(params, "width");
    const hasDecimals = Object.prototype.hasOwnProperty.call(
        params,
        "decimals"
    );
    const hasAlign = Object.prototype.hasOwnProperty.call(params, "align");
    const hasCategories = Object.prototype.hasOwnProperty.call(
        params,
        "categories"
    );
    const hasMissingRange = Object.prototype.hasOwnProperty.call(
        params,
        "missingRange"
    );
    const categories = encodeCategories(params.categories);
    const missingRange = encodeMissingRange(params.missingRange);

    return JSON.stringify({
        prefix: safeEncode(dedicatedRuntimeRequestPrefix),
        id: safeEncode(request.id),
        method: safeEncode(request.method),
        auth: safeEncode(token),
        code: safeEncode(params.code),
        mode: safeEncode(params.mode),
        outputWidth: safeEncode(params.outputWidth),
        timeoutMs: safeEncode(params.timeoutMs),
        sessionId: safeEncode(params.sessionId),
        topic: safeEncode(params.topic),
        package: safeEncode(params.package),
        requestPrefix: safeEncode(params.prefix),
        cursorColumn: safeEncode(params.cursorColumn),
        includeInternals: safeEncode(params.includeInternals ? "1" : ""),
        forceRefresh: safeEncode(params.forceRefresh ? "1" : ""),
        path: safeEncode(params.path),
        reader: safeEncode(params.reader),
        nrows: safeEncode(params.nrows),
        binary: safeEncode(params.binary ? "1" : ""),
        header: safeEncode(
            params.header === false
                ? "0"
                : params.header === true
                    ? "1"
                    : ""
        ),
        rowNames: safeEncode(params.rowNames),
        sep: safeEncode(params.sep),
        quote: safeEncode(params.quote),
        dec: safeEncode(params.dec),
        naStrings: safeEncode(params.naStrings),
        skip: safeEncode(params.skip),
        stripWhite: safeEncode(params.stripWhite ? "1" : ""),
        commentChar: safeEncode(params.commentChar),
        fileEncoding: safeEncode(params.fileEncoding),
        parentId: safeEncode(params.parentId),
        reply: safeEncode(params.reply),
        names: safeEncode(encodeArray(params.names)),
        name: safeEncode(params.name),
        oldName: safeEncode(params.oldName),
        newName: safeEncode(params.newName),
        nextName: safeEncode(params.nextName),
        targetName: safeEncode(params.targetName),
        variableName: safeEncode(params.variableName),
        xVariableName: safeEncode(params.xVariableName),
        yVariableName: safeEncode(params.yVariableName),
        thresholds: safeEncode(encodeArray(params.thresholds)),
        thresholdNames: safeEncode(encodeArray(params.thresholdNames)),
        variant: safeEncode(params.variant),
        logistic: safeEncode(params.logistic ? "1" : ""),
        ecdf: safeEncode(params.ecdf ? "1" : ""),
        idm: safeEncode(params.idm),
        below: safeEncode(params.below),
        above: safeEncode(params.above),
        increasing: safeEncode(params.increasing === false ? "0" : "1"),
        bell: safeEncode(params.bell ? "1" : ""),
        decreasing: safeEncode(params.decreasing ? "1" : "0"),
        naLast: safeEncode(params.naLast === false ? "0" : "1"),
        emptyLast: safeEncode(params.emptyLast === false ? "0" : "1"),
        hasType: safeEncode(hasType ? "1" : ""),
        type: safeEncode(params.type),
        hasMeasure: safeEncode(hasMeasure ? "1" : ""),
        measure: safeEncode(params.measure),
        hasLabel: safeEncode(hasLabel ? "1" : ""),
        label: safeEncode(params.label),
        hasCategories: safeEncode(hasCategories ? "1" : ""),
        categoryValues: safeEncode(categories.values),
        categoryLabels: safeEncode(categories.labels),
        categoryMissing: safeEncode(categories.missing),
        hasMissingRange: safeEncode(hasMissingRange ? "1" : ""),
        missingRangeMin: safeEncode(missingRange.minimum),
        missingRangeMax: safeEncode(missingRange.maximum),
        hasWidth: safeEncode(hasWidth ? "1" : ""),
        width: safeEncode(params.width),
        hasDecimals: safeEncode(hasDecimals ? "1" : ""),
        decimals: safeEncode(params.decimals),
        hasAlign: safeEncode(hasAlign ? "1" : ""),
        align: safeEncode(params.align),
        row: safeEncode(params.row),
        column: safeEncode(params.column),
        position: safeEncode(params.position),
        value: safeEncode(params.value),
        rowStart: safeEncode(params.rowStart),
        rowCount: safeEncode(params.rowCount),
        columnCount: safeEncode(params.columnCount),
        start: safeEncode(params.start),
        nth: safeEncode(params.nth),
        count: safeEncode(params.count),
        columns: safeEncode(encodeArray(params.columns))
    });
};
