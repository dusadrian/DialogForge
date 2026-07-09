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
        name?: string;
        colnames: string[];
        numeric: boolean[];
        character: boolean[];
        logical: boolean[];
        factor: boolean[];
        calibrated: boolean[];
        binary: boolean[];
        categorical: boolean[];
        date: boolean[];
        ncol?: number;
        nrow?: number;
    }>;
    select: {
        list: string[];
        matrix: string[];
        vector: string[];
        datasets?: string[];
        [key: string]: string[] | undefined;
    };
    variables: unknown[];
    activeDataset: string;
}


export interface ProductDialogWorkspaceEntry {
    name?: string;
    kind?: string;
    columns?: string[];
    columnEntries?: unknown[];
    rows?: number;
    rowCount?: number;
}


export interface ProductDialogWorkspaceDataFromEntriesOptions {
    activeDataset?: string;
}


export interface ProductDialogDatasetDescriptor {
    name: string;
    columns: ProductDialogVariableFlagRecord[];
}


export interface ProductDialogDatasetDescriptorOptions {
    allowAllTypes?: boolean;
    readVariables?(
        datasetName: string,
        start: number,
        count: number
    ): Promise<unknown[]>;
}


export interface ProductDialogWorkspaceDataReaderOptions {
    schemaFirst?: boolean;
}


type WorkspaceObject = WorkspaceSnapshot["objects"][number];


export interface ProductDialogVariableFlagRecord extends Record<string, unknown> {
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


export interface ProductDialogVariableEntryOptions {
    allowAllTypes?: boolean;
}


const productDialogVariableFilterFlags = [
    "numeric",
    "character",
    "logical",
    "factor",
    "calibrated",
    "binary",
    "categorical",
    "date"
];


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


const measureTokens = function(value: unknown): string[] {
    return String(value || "")
        .split(/[\/,]/)
        .map(function(entry): string {
            return entry.trim().toLowerCase();
        })
        .filter(Boolean);
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


const likelyCategoricalVariableName = function(name: unknown): boolean {
    return /\b(species|group|class|type|category|sex|gender|region|country|status)\b/i.test(
        String(name || "")
    );
};


export const createProductDialogVariableFlagRecord = function(
    variable: VariableMetadataSnapshot["variables"][number] | Record<string, unknown>
): ProductDialogVariableFlagRecord {
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
    const measures = measureTokens(record.measure);
    const categories = categoryCount(record.categories);
    const isMeasuredNumeric =
        measures.includes("quantitative") ||
        measures.includes("interval") ||
        measures.includes("ratio") ||
        measures.includes("scale");
    const isIntrinsicNumeric =
        typeToken === "numeric" ||
        typeToken === "double" ||
        typeToken === "integer" ||
        typeToken === "logical" ||
        isMeasuredNumeric;
    const isOrdinalNumeric = measures.includes("ordinal") && categories >= 7;
    const isNominalCategorical = measures.includes("nominal") && categories > 0;
    const calibrated = record.calibrated === true;
    const categorical =
        typeToken === "factor" ||
        typeToken === "ordered" ||
        measures.includes("nominal") ||
        measures.includes("ordinal") ||
        measures.includes("categorical") ||
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


export const createProductDialogVariableEntries = function(
    entries: unknown[],
    options: ProductDialogVariableEntryOptions = {}
): ProductDialogVariableFlagRecord[] {
    return (Array.isArray(entries) ? entries : []).map(function(entry): ProductDialogVariableFlagRecord {
        const record = createProductDialogVariableFlagRecord(
            entry && typeof entry === "object"
                ? entry as Record<string, unknown>
                : { name: String(entry || "").trim() }
        );

        if (options.allowAllTypes) {
            productDialogVariableFilterFlags.forEach(function(flag): void {
                record[flag] = true;
            });

            return record;
        }

        if (record.factor || record.character || record.logical) {
            record.categorical = true;
        }
        if (
            !record.numeric
            && !record.categorical
            && likelyCategoricalVariableName(record.name)
        ) {
            record.categorical = true;
            record.factor = true;
        }

        return record;
    }).filter(function(record): boolean {
        return Boolean(record.name);
    });
};


export const createProductDialogWorkspaceDataFromEntries = function(
    entries: ProductDialogWorkspaceEntry[],
    options: ProductDialogWorkspaceDataFromEntriesOptions = {}
): ProductDialogWorkspaceData {
    const dataframe: ProductDialogWorkspaceData["dataframe"] = {};
    const variables: unknown[] = [];
    const select: ProductDialogWorkspaceData["select"] = {
        list: [],
        matrix: [],
        vector: [],
        datasets: []
    };

    (Array.isArray(entries) ? entries : []).forEach(function(entry): void {
        const name = String(entry?.name || "").trim();

        if (!name || entry?.kind !== "data.frame") {
            return;
        }

        const columns = Array.isArray(entry.columns)
            ? entry.columns.map(function(column): string {
                return String(column || "").trim();
            }).filter(Boolean)
            : [];
        const columnEntries = Array.isArray(entry.columnEntries) && entry.columnEntries.length > 0
            ? entry.columnEntries
            : columns.map(function(column): { name: string } {
                return { name: column };
            });
        const columnDescriptors = columnEntries.map(function(column): ProductDialogVariableFlagRecord {
            return createProductDialogVariableFlagRecord(
                column && typeof column === "object"
                    ? column as Record<string, unknown>
                    : { name: String(column || "").trim() }
            );
        });

        dataframe[name] = {
            name,
            colnames: columns,
            numeric: columnDescriptors.map(function(column): boolean {
                return column.numeric === true;
            }),
            character: columnDescriptors.map(function(column): boolean {
                return column.character === true;
            }),
            logical: columnDescriptors.map(function(column): boolean {
                return column.logical === true;
            }),
            factor: columnDescriptors.map(function(column): boolean {
                return column.factor === true;
            }),
            calibrated: columnDescriptors.map(function(column): boolean {
                return column.calibrated === true;
            }),
            binary: columnDescriptors.map(function(column): boolean {
                return column.binary === true;
            }),
            categorical: columnDescriptors.map(function(column): boolean {
                return column.categorical === true;
            }),
            date: columnDescriptors.map(function(column): boolean {
                return column.date === true;
            }),
            ncol: columns.length,
            nrow: Number(entry.rows || entry.rowCount || 0) || 0
        };
        select[name] = columns.slice();
        select.datasets?.push(name);

        columns.forEach(function(column, index): void {
            const descriptor = columnDescriptors[index]
                || createProductDialogVariableFlagRecord({ name: column });

            variables.push({
                dataset: name,
                ...descriptor,
                name: column
            });
        });
    });

    return {
        dataframe,
        activeDataset: String(options.activeDataset || ""),
        variables,
        select
    };
};


export const readProductDialogDatasetDescriptors = async function(
    entries: ProductDialogWorkspaceEntry[],
    options: ProductDialogDatasetDescriptorOptions = {}
): Promise<ProductDialogDatasetDescriptor[]> {
    const descriptors: ProductDialogDatasetDescriptor[] = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        const name = String(entry?.name || "").trim();

        if (!name || entry?.kind !== "data.frame") {
            continue;
        }

        const fallbackEntries = Array.isArray(entry.columnEntries) && entry.columnEntries.length > 0
            ? entry.columnEntries
            : Array.isArray(entry.columns)
                ? entry.columns.map(function(column): { name: string } {
                    return { name: String(column || "").trim() };
                })
                : [];
        const fallbackColumns = createProductDialogVariableEntries(
            fallbackEntries,
            { allowAllTypes: options.allowAllTypes === true }
        );
        let columns = fallbackColumns;

        if (options.readVariables) {
            try {
                const metadata = await options.readVariables(
                    name,
                    1,
                    Math.max(1, fallbackColumns.length)
                );

                if (Array.isArray(metadata) && metadata.length) {
                    columns = metadata
                        .map(function(variable): ProductDialogVariableFlagRecord {
                            return createProductDialogVariableFlagRecord(
                                variable && typeof variable === "object"
                                    ? variable as Record<string, unknown>
                                    : { name: String(variable || "").trim() }
                            );
                        })
                        .filter(function(column): boolean {
                            return Boolean(column.name);
                        });
                }
            }
            catch {}
        }

        descriptors.push({
            name,
            columns
        });
    }

    return descriptors.filter(function(entry): boolean {
        return Boolean(entry.name);
    });
};


const dataframeFromVariableMetadata = function(
    metadata: VariableMetadataSnapshot
): ProductDialogWorkspaceData["dataframe"][string] | null {
    if (!isMetadataReady(metadata)) {
        return null;
    }

    const variables = metadata.variables
        .map(createProductDialogVariableFlagRecord)
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
