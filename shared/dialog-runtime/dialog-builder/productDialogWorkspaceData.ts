import type {
    ActiveDatasetSnapshot,
    VariableMetadataSnapshot,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface ProductDialogWorkspaceSchema {
    columns?: Array<{
        name?: string;
        type?: string;
        numeric?: boolean;
        character?: boolean;
        logical?: boolean;
        factor?: boolean;
        calibrated?: boolean;
        binary?: boolean;
        categorical?: boolean;
        date?: boolean;
    }>;
}


export interface ProductDialogWorkspaceSource {
    listWorkspaceObjects(): Promise<WorkspaceSnapshot>;
    readTabularSchema(objectName: string): Promise<ProductDialogWorkspaceSchema>;
    readVariableMetadata(objectName: string): Promise<VariableMetadataSnapshot>;
    getActiveDataset(): ActiveDatasetSnapshot;
}


export interface ProductDialogWorkspaceData {
    dataframe: Record<string, {
        colnames: string[];
        numeric: boolean[];
        character: boolean[];
        logical: boolean[];
        factor: boolean[];
        calibrated: boolean[];
        binary: boolean[];
        categorical: boolean[];
        date: boolean[];
    }>;
    select: {
        list: string[];
        matrix: string[];
        vector: string[];
    };
    variables: WorkspaceSnapshot["objects"];
    activeDataset: string;
}


export interface ProductDialogWorkspaceDataReaderOptions {
    schemaFirst?: boolean;
}


type WorkspaceObject = WorkspaceSnapshot["objects"][number];


interface VariableFlagRecord {
    name: string;
    numeric: boolean;
    character: boolean;
    logical: boolean;
    factor: boolean;
    calibrated: boolean;
    binary: boolean;
    categorical: boolean;
    date: boolean;
}


const isTabularWorkspaceObject = function(object: WorkspaceObject): boolean {
    return object.capabilities.includes("tabular.schema") ||
        object.capabilities.includes("tabular.read");
};


const isMetadataReady = function(
    metadata: VariableMetadataSnapshot
): boolean {
    return metadata.status === "ready" && metadata.variables.length > 0;
};


const firstTypeToken = function(value: unknown): string {
    return String(value || "")
        .split(/[\/,]/)
        .map(function(entry): string {
            return entry.trim().toLowerCase();
        })
        .find(Boolean) || "";
};


const categoryCount = function(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
};


const hasBooleanFlag = function(
    record: Record<string, unknown>,
    key: string
): boolean {
    return typeof record[key] === "boolean";
};


const booleanFlag = function(
    record: Record<string, unknown>,
    key: string
): boolean {
    return record[key] === true;
};


const variableFlagRecord = function(
    variable: VariableMetadataSnapshot["variables"][number]
): VariableFlagRecord {
    const record = variable as Record<string, unknown>;
    const name = String(record.name || "").trim();
    const hasRuntimeFlags =
        hasBooleanFlag(record, "numeric") ||
        hasBooleanFlag(record, "calibrated") ||
        hasBooleanFlag(record, "categorical") ||
        hasBooleanFlag(record, "factor");

    if (hasRuntimeFlags) {
        const calibrated = booleanFlag(record, "calibrated");

        return {
            name,
            numeric: booleanFlag(record, "numeric") || calibrated,
            character: booleanFlag(record, "character"),
            logical: firstTypeToken(record.type) === "logical",
            factor:
                booleanFlag(record, "factor") ||
                booleanFlag(record, "categorical"),
            calibrated,
            binary: booleanFlag(record, "binary"),
            categorical: booleanFlag(record, "categorical"),
            date: booleanFlag(record, "date")
        };
    }

    const typeToken = firstTypeToken(record.type);
    const measure = String(record.measure || "").trim().toLowerCase();
    const categories = categoryCount(record.categories);
    const isMeasuredNumeric =
        measure === "interval" ||
        measure === "ratio" ||
        measure === "scale";
    const isIntrinsicNumeric =
        typeToken === "numeric" ||
        typeToken === "double" ||
        typeToken === "integer" ||
        typeToken === "logical" ||
        isMeasuredNumeric;
    const isOrdinalNumeric = measure === "ordinal" && categories >= 7;
    const isNominalCategorical = measure === "nominal" && categories > 0;
    const calibrated = record.calibrated === true;
    const categorical =
        typeToken === "factor" ||
        typeToken === "ordered" ||
        measure === "nominal" ||
        measure === "ordinal" ||
        categories > 0;
    const binary =
        record.binary === true ||
        typeToken === "logical" ||
        categories === 2;
    const numeric =
        calibrated ||
        (
            !isNominalCategorical &&
            isIntrinsicNumeric
        ) ||
        isOrdinalNumeric;

    return {
        name,
        numeric,
        character: typeToken === "character" || typeToken === "string",
        logical: typeToken === "logical" || typeToken === "boolean",
        factor: categorical,
        calibrated,
        binary,
        categorical,
        date:
            typeToken === "date" ||
            typeToken === "posixct" ||
            typeToken === "posixlt"
    };
};


const dataframeFromVariableMetadata = function(
    metadata: VariableMetadataSnapshot
): ProductDialogWorkspaceData["dataframe"][string] | null {
    if (!isMetadataReady(metadata)) {
        return null;
    }

    const variables = metadata.variables
        .map(variableFlagRecord)
        .filter(function(variable): boolean {
            return Boolean(variable.name);
        });

    if (variables.length === 0) {
        return null;
    }

    return {
        colnames: variables.map(function(variable): string {
            return variable.name;
        }),
        numeric: variables.map(function(variable): boolean {
            return variable.numeric;
        }),
        character: variables.map(function(variable): boolean {
            return variable.character;
        }),
        logical: variables.map(function(variable): boolean {
            return variable.logical;
        }),
        factor: variables.map(function(variable): boolean {
            return variable.factor;
        }),
        calibrated: variables.map(function(variable): boolean {
            return variable.calibrated;
        }),
        binary: variables.map(function(variable): boolean {
            return variable.binary;
        }),
        categorical: variables.map(function(variable): boolean {
            return variable.categorical;
        }),
        date: variables.map(function(variable): boolean {
            return variable.date;
        })
    };
};


const dataframeFromSchema = function(
    schema: ProductDialogWorkspaceSchema
): ProductDialogWorkspaceData["dataframe"][string] {
    const columns = Array.isArray(schema.columns)
        ? schema.columns
        : [];

    return {
        colnames: columns.map(function(column): string {
            return String(column.name || "");
        }),
        numeric: columns.map(function(column): boolean {
            return column.numeric === true
                || column.calibrated === true
                || /numeric|integer|double/.test(
                String(column.type || "").toLowerCase()
            );
        }),
        character: columns.map(function(column): boolean {
            return column.character === true
                || /character|string/.test(
                String(column.type || "").toLowerCase()
            );
        }),
        logical: columns.map(function(column): boolean {
            return column.logical === true
                || /logical|boolean/.test(
                String(column.type || "").toLowerCase()
            );
        }),
        factor: columns.map(function(column): boolean {
            return column.factor === true
                || /factor|ordered/.test(
                String(column.type || "").toLowerCase()
            );
        }),
        calibrated: columns.map(function(column): boolean {
            return column.calibrated === true;
        }),
        binary: columns.map(function(column): boolean {
            return column.binary === true
                || /logical|boolean/.test(
                String(column.type || "").toLowerCase()
            );
        }),
        categorical: columns.map(function(column): boolean {
            return column.categorical === true
                || /factor|ordered/.test(
                String(column.type || "").toLowerCase()
            );
        }),
        date: columns.map(function(column): boolean {
            return column.date === true
                || /date|posixct|posixlt/.test(
                String(column.type || "").toLowerCase()
            );
        })
    };
};


const readVariableMetadataFrame = async function(
    source: ProductDialogWorkspaceSource,
    name: string
): Promise<ProductDialogWorkspaceData["dataframe"][string] | null> {
    try {
        return dataframeFromVariableMetadata(
            await source.readVariableMetadata(name)
        );
    }
    catch {
        return null;
    }
};


const readSchemaFrame = async function(
    source: ProductDialogWorkspaceSource,
    name: string
): Promise<ProductDialogWorkspaceData["dataframe"][string] | null> {
    try {
        return dataframeFromSchema(await source.readTabularSchema(name));
    }
    catch {
        return null;
    }
};


export const createProductDialogWorkspaceDataReader = function(
    source: ProductDialogWorkspaceSource,
    options: ProductDialogWorkspaceDataReaderOptions = {}
) {
    return async function(
        workspaceSnapshot?: WorkspaceSnapshot
    ): Promise<ProductDialogWorkspaceData> {
        const workspace = workspaceSnapshot
            || await source.listWorkspaceObjects();
        const dataframe: ProductDialogWorkspaceData["dataframe"] = {};
        const list: string[] = [];
        const matrix: string[] = [];
        const vector: string[] = [];

        for (const object of workspace.objects) {
            const name = String(object.name || "").trim();

            if (!name) {
                continue;
            }

            if (isTabularWorkspaceObject(object)) {
                const schemaFrame = options.schemaFirst
                    ? await readSchemaFrame(source, name)
                    : null;
                const metadataFrame = schemaFrame
                    ? null
                    : await readVariableMetadataFrame(source, name);
                const fallbackSchemaFrame = metadataFrame || schemaFrame
                    ? null
                    : await readSchemaFrame(source, name);
                const frame = metadataFrame
                    || schemaFrame
                    || fallbackSchemaFrame;

                if (frame) {
                    dataframe[name] = frame;
                }
            }

            const kind = String(object.kind || "").toLowerCase();

            if (kind.includes("matrix")) {
                matrix.push(name);
            }
            else if (
                kind.includes("vector")
                || kind.includes("factor")
            ) {
                vector.push(name);
            }
            else {
                list.push(name);
            }
        }

        return {
            dataframe,
            select: {
                list,
                matrix,
                vector
            },
            variables: workspace.objects,
            activeDataset:
                source.getActiveDataset().objectName || ""
        };
    };
};
