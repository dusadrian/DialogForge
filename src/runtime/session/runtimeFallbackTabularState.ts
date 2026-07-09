import type {
    ValueLabelUpdateRequest,
    VariableMetadataFieldKey
} from "../provider-contract/runtimeProvider";


export type RuntimeFallbackTabularRow = Record<string, unknown>;
export type RuntimeFallbackTabularRows = Record<
    string,
    RuntimeFallbackTabularRow[]
>;
export type RuntimeFallbackTabularRowNames = Record<string, string[]>;
export type RuntimeFallbackTabularProvenance = Record<
    string,
    { source: string; format: string }
>;

type VariableMetadataValues = Record<
    string,
    Record<string, Partial<Record<VariableMetadataFieldKey, string>>>
>;
type LabelValues = ValueLabelUpdateRequest["labels"];
type LabelsByObject = Record<string, Record<string, LabelValues>>;


export interface RuntimeFallbackTabularState {
    rows: RuntimeFallbackTabularRows;
    rowNames: RuntimeFallbackTabularRowNames;
    provenance: RuntimeFallbackTabularProvenance;
    register(
        objectName: string,
        rows: RuntimeFallbackTabularRow[],
        provenance: { source: string; format: string }
    ): void;
    has(objectName: string): boolean;
    move(oldName: string, newName: string): void;
    remove(objectName: string): void;
    clear(): void;
    readMetadata(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        fallback: string
    ): string;
    writeMetadata(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        value: string
    ): void;
    readMetadataNumber(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey
    ): number | undefined;
    readValueLabels(
        objectName: string,
        variableName: string,
        fallback: LabelValues
    ): LabelValues;
    writeValueLabels(
        objectName: string,
        variableName: string,
        values: LabelValues
    ): void;
    readDeclaredMissing(
        objectName: string,
        variableName: string,
        fallback: LabelValues
    ): LabelValues;
    writeDeclaredMissing(
        objectName: string,
        variableName: string,
        values: LabelValues
    ): void;
}


const cloneLabels = function(values: LabelValues): LabelValues {
    return values.map((entry) => {
        return {
            value: entry.value,
            label: String(entry.label || "")
        };
    });
};


export const createRuntimeFallbackTabularState = function(): RuntimeFallbackTabularState {
    const rows: RuntimeFallbackTabularRows = {};
    const rowNames: RuntimeFallbackTabularRowNames = {};
    const provenance: RuntimeFallbackTabularProvenance = {};
    const metadata: VariableMetadataValues = {};
    const valueLabels: LabelsByObject = {};
    const declaredMissing: LabelsByObject = {};

    const readMetadata = function(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        fallback: string
    ): string {
        const value = metadata[objectName]?.[variableName]?.[metadataKey];

        return value === undefined ? fallback : value;
    };

    const writeMetadata = function(
        objectName: string,
        variableName: string,
        metadataKey: VariableMetadataFieldKey,
        value: string
    ): void {
        if (!metadata[objectName]) {
            metadata[objectName] = {};
        }
        if (!metadata[objectName][variableName]) {
            metadata[objectName][variableName] = {};
        }

        metadata[objectName][variableName][metadataKey] = value;
    };

    const readLabels = function(
        store: LabelsByObject,
        objectName: string,
        variableName: string,
        fallback: LabelValues
    ): LabelValues {
        const values = store[objectName]?.[variableName];

        return cloneLabels(values || fallback);
    };

    const writeLabels = function(
        store: LabelsByObject,
        objectName: string,
        variableName: string,
        values: LabelValues
    ): void {
        if (!store[objectName]) {
            store[objectName] = {};
        }

        store[objectName][variableName] = cloneLabels(values);
    };

    const remove = function(objectName: string): void {
        delete rows[objectName];
        delete rowNames[objectName];
        delete provenance[objectName];
        delete metadata[objectName];
        delete valueLabels[objectName];
        delete declaredMissing[objectName];
    };

    return {
        rows,
        rowNames,
        provenance,
        register: function(objectName, nextRows, nextProvenance): void {
            rows[objectName] = nextRows;
            rowNames[objectName] = [];
            provenance[objectName] = nextProvenance;
        },
        has: function(objectName): boolean {
            return Boolean(rows[objectName]);
        },
        move: function(oldName, newName): void {
            if (rows[oldName]) {
                rows[newName] = rows[oldName];
            }
            if (rowNames[oldName]) {
                rowNames[newName] = rowNames[oldName];
            }
            if (provenance[oldName]) {
                provenance[newName] = provenance[oldName];
            }
            if (metadata[oldName]) {
                metadata[newName] = metadata[oldName];
            }
            if (valueLabels[oldName]) {
                valueLabels[newName] = valueLabels[oldName];
            }
            if (declaredMissing[oldName]) {
                declaredMissing[newName] = declaredMissing[oldName];
            }

            remove(oldName);
        },
        remove,
        clear: function(): void {
            const objectNames = new Set([
                ...Object.keys(rows),
                ...Object.keys(rowNames),
                ...Object.keys(provenance),
                ...Object.keys(metadata),
                ...Object.keys(valueLabels),
                ...Object.keys(declaredMissing)
            ]);

            objectNames.forEach(remove);
        },
        readMetadata,
        writeMetadata,
        readMetadataNumber: function(
            objectName,
            variableName,
            metadataKey
        ): number | undefined {
            const value = readMetadata(
                objectName,
                variableName,
                metadataKey,
                ""
            );
            const numberValue = Number(value);

            return value === "" || !Number.isFinite(numberValue)
                ? undefined
                : numberValue;
        },
        readValueLabels: function(objectName, variableName, fallback) {
            return readLabels(
                valueLabels,
                objectName,
                variableName,
                fallback
            );
        },
        writeValueLabels: function(objectName, variableName, values): void {
            writeLabels(valueLabels, objectName, variableName, values);
        },
        readDeclaredMissing: function(objectName, variableName, fallback) {
            return readLabels(
                declaredMissing,
                objectName,
                variableName,
                fallback
            );
        },
        writeDeclaredMissing: function(objectName, variableName, values): void {
            writeLabels(declaredMissing, objectName, variableName, values);
        }
    };
};
