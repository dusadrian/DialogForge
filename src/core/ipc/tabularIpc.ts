import type {
    CellUpdateBatchResult,
    CellUpdateRequest,
    CellUpdateResult,
    ColumnInsertRequest,
    ColumnInsertResult,
    ColumnRemoveRequest,
    ColumnRemoveResult,
    ColumnRenameRequest,
    ColumnRenameResult,
    DeclaredMissingSnapshot,
    DeclaredMissingUpdateRequest,
    DeclaredMissingUpdateResult,
    ImportRequest,
    ImportResult,
    RowInsertRequest,
    RowInsertResult,
    RowNameUpdateRequest,
    RowNameUpdateResult,
    RowRemoveRequest,
    RowRemoveResult,
    RowSortRequest,
    RowSortResult,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    TabularSchemaSnapshot,
    ValueLabelSnapshot,
    ValueLabelUpdateRequest,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
    VariableMetadataUpdateRequest,
    VariableMetadataUpdateResult
} from "../../runtime/provider-contract/runtimeProvider";


export const tabularIpcChannels = {
    readSchema: "base-app:readTabularSchema",
    readPreview: "base-app:readTabularPreview",
    writeCell: "base-app:writeCell",
    writeCells: "base-app:writeCells",
    renameColumn: "base-app:renameColumn",
    insertColumn: "base-app:insertColumn",
    removeColumn: "base-app:removeColumn",
    insertRow: "base-app:insertRow",
    removeRow: "base-app:removeRow",
    sortRows: "base-app:sortRows",
    updateRowName: "base-app:updateRowName",
    readVariableMetadata: "base-app:readVariableMetadata",
    writeVariableMetadata: "base-app:writeVariableMetadata",
    readValueLabels: "base-app:readValueLabels",
    writeValueLabels: "base-app:writeValueLabels",
    readDeclaredMissing: "base-app:readDeclaredMissing",
    writeDeclaredMissing: "base-app:writeDeclaredMissing",
    importData: "base-app:importData"
} as const;


export type TabularIpcChannel =
    typeof tabularIpcChannels[
        keyof typeof tabularIpcChannels
    ];


interface TabularIpcInputs {
    "base-app:readTabularSchema": string;
    "base-app:readTabularPreview":
        string | Partial<TabularPreviewRequest>;
    "base-app:writeCell": Partial<CellUpdateRequest>;
    "base-app:writeCells": Partial<CellUpdateRequest>[];
    "base-app:renameColumn": Partial<ColumnRenameRequest>;
    "base-app:insertColumn": Partial<ColumnInsertRequest>;
    "base-app:removeColumn": Partial<ColumnRemoveRequest>;
    "base-app:insertRow": Partial<RowInsertRequest>;
    "base-app:removeRow": Partial<RowRemoveRequest>;
    "base-app:sortRows": Partial<RowSortRequest>;
    "base-app:updateRowName": Partial<RowNameUpdateRequest>;
    "base-app:readVariableMetadata": string;
    "base-app:writeVariableMetadata":
        Partial<VariableMetadataUpdateRequest>;
    "base-app:readValueLabels": string;
    "base-app:writeValueLabels":
        Partial<ValueLabelUpdateRequest>;
    "base-app:readDeclaredMissing": string;
    "base-app:writeDeclaredMissing":
        Partial<DeclaredMissingUpdateRequest>;
    "base-app:importData": Partial<ImportRequest>;
}


interface TabularIpcResults {
    "base-app:readTabularSchema": TabularSchemaSnapshot;
    "base-app:readTabularPreview": TabularPreviewSnapshot;
    "base-app:writeCell": CellUpdateResult;
    "base-app:writeCells": CellUpdateBatchResult;
    "base-app:renameColumn": ColumnRenameResult;
    "base-app:insertColumn": ColumnInsertResult;
    "base-app:removeColumn": ColumnRemoveResult;
    "base-app:insertRow": RowInsertResult;
    "base-app:removeRow": RowRemoveResult;
    "base-app:sortRows": RowSortResult;
    "base-app:updateRowName": RowNameUpdateResult;
    "base-app:readVariableMetadata": VariableMetadataSnapshot;
    "base-app:writeVariableMetadata":
        VariableMetadataUpdateResult;
    "base-app:readValueLabels": ValueLabelSnapshot;
    "base-app:writeValueLabels": ValueLabelUpdateResult;
    "base-app:readDeclaredMissing": DeclaredMissingSnapshot;
    "base-app:writeDeclaredMissing":
        DeclaredMissingUpdateResult;
    "base-app:importData": ImportResult;
}


interface InvokeTransport {
    invoke(
        channel: string,
        ...args: unknown[]
    ): Promise<unknown>;
}


export const invokeTabularRoute = function<
    Channel extends TabularIpcChannel
>(
    transport: InvokeTransport,
    channel: Channel,
    input: TabularIpcInputs[Channel]
): Promise<TabularIpcResults[Channel]> {
    return transport.invoke(
        channel,
        input
    ) as Promise<TabularIpcResults[Channel]>;
};
