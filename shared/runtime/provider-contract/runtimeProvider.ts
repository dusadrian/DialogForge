import type {
    RuntimeTransportAuthPolicy,
    RuntimeTransportConnectProbe,
    RuntimeTransportController,
    RuntimeTransportCredential,
    RuntimeTransportSnapshot
} from "../transport/runtimeTransport";


export type RuntimeCapability =
    | "commands.visible"
    | "commands.invisible"
    | "data.import"
    | "workspace.objects"
    | "workspace.activeDataset"
    | "workspace.remove"
    | "workspace.rename"
    | "tabular.schema"
    | "tabular.read"
    | "tabular.writeCells"
    | "tabular.writeColumns"
    | "tabular.writeRows"
    | "tabular.rowNames"
    | "tabular.columnNames"
    | "tabular.variableMetadata"
    | "tabular.variableMetadata.write"
    | "tabular.valueLabels"
    | "tabular.valueLabels.write"
    | "tabular.declaredMissing"
    | "tabular.declaredMissing.write"
    | "help.topics"
    | "completions.symbols"
    | "dependencies.packages"
    | "plots";


export interface RuntimeProviderManifest {
    id: string;
    label: string;
    language: string;
    status: string;
    capabilities: RuntimeCapability[];
    policies?: RuntimeProviderPolicies;
}


export interface RuntimeProviderPolicies {
    packages?: RuntimePackagePolicy;
    filesystem?: RuntimeFilesystemPolicy;
}


export interface RuntimePackagePolicy {
    availability: string;
    installation: string;
    message: string;
}


export interface RuntimeFilesystemPolicy {
    access: string;
    persistence: string;
    message: string;
}


export interface RuntimeSessionSnapshot {
    providerId: string;
    status: string;
    connection: string;
    message: string;
    transport?: RuntimeTransportSnapshot;
}


export interface VisibleCommandRequest {
    kind: "commands.visible";
    text: string;
    source: string;
    createdAt: string;
}


export interface TranscriptEvent {
    type: string;
    commandKind: string;
    source: string;
    text: string;
    createdAt: string;
    message?: string;
    id?: string;
    parentId?: string;
    streamName?: string;
    prompt?: string;
    password?: boolean;
    state?: string;
    inputPrompt?: string;
    continuationPrompt?: string;
}


export type UiCommandVisibility = "hidden" | "visible";


export interface WorkspaceObjectSnapshot {
    name: string;
    kind: string;
    detail: string;
    hasViewer: boolean;
    provenance: null | {
        source: string;
        format: string;
    };
    capabilities: RuntimeCapability[];
}


export interface WorkspaceSnapshot {
    status: string;
    providerId: string;
    objects: WorkspaceObjectSnapshot[];
    message: string;
    refreshedAt: string;
}


export interface WorkspaceListOptions {
    forceRefresh?: boolean;
}


export interface WorkspaceRenameRequest {
    oldName: string;
    newName: string;
    source: string;
}


export interface ActiveDatasetSnapshot {
    status: string;
    providerId: string;
    objectName: string;
    message: string;
    selectedAt: string;
}


export interface ObjectInspectionResult {
    status: string;
    providerId: string;
    objectName: string;
    kind: string;
    detail: string;
    capabilities: RuntimeCapability[];
    summary: Array<{
        name: string;
        value: string;
    }>;
    message: string;
    inspectedAt: string;
}


export interface TabularColumnSnapshot {
    name: string;
    type: string;
    role: string;
    numeric?: boolean;
    character?: boolean;
    logical?: boolean;
    factor?: boolean;
    calibrated?: boolean;
    binary?: boolean;
    categorical?: boolean;
    date?: boolean;
}


export interface TabularSchemaSnapshot {
    status: string;
    providerId: string;
    objectName: string;
    columns: TabularColumnSnapshot[];
    rowCount: number;
    columnCount: number;
    message: string;
    readAt: string;
}


export interface TabularPreviewSnapshot {
    status: string;
    providerId: string;
    objectName: string;
    columns: TabularColumnSnapshot[];
    rows: Record<string, unknown>[];
    rowNames?: string[];
    rowOffset?: number;
    columnOffset?: number;
    totalRowCount?: number;
    totalColumnCount?: number;
    message: string;
    readAt: string;
}


export interface TabularPreviewRequest {
    objectName: string;
    rowStart?: number;
    rowCount?: number;
    columns?: string[];
    columnCount?: number;
}


export interface CellUpdateRequest {
    objectName: string;
    rowIndex: number;
    columnName: string;
    value: unknown;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface CellUpdateResult {
    status: string;
    providerId: string;
    objectName: string;
    rowIndex: number;
    columnName: string;
    value: unknown;
    cell?: {
        display: string;
        raw: string;
        declaredMissing?: boolean;
    };
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface CellUpdateBatchResult {
    status: string;
    providerId: string;
    objectName: string;
    updated: number;
    failed: number;
    results: CellUpdateResult[];
    message: string;
    updatedAt: string;
}


export interface ColumnRenameRequest {
    objectName: string;
    fromName: string;
    toName: string;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface ColumnRenameResult {
    status: string;
    providerId: string;
    objectName: string;
    fromName: string;
    toName: string;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface ColumnInsertRequest {
    objectName: string;
    referenceName: string;
    newName: string;
    position: "before" | "after";
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface ColumnInsertResult {
    status: string;
    providerId: string;
    objectName: string;
    columnName: string;
    columnIndex: number;
    columnCount?: number;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface ColumnRemoveRequest {
    objectName: string;
    columnName: string;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface ColumnRemoveResult {
    status: string;
    providerId: string;
    objectName: string;
    columnName: string;
    columnCount?: number;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface RowNameUpdateRequest {
    objectName: string;
    rowIndex: number;
    name: string;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface RowNameUpdateResult {
    status: string;
    providerId: string;
    objectName: string;
    rowIndex: number;
    name: string;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface RowInsertRequest {
    objectName: string;
    rowIndex: number;
    name: string;
    position: "before" | "after";
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface RowInsertResult {
    status: string;
    providerId: string;
    objectName: string;
    rowIndex: number;
    name?: string;
    rowCount?: number;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface RowRemoveRequest {
    objectName: string;
    rowIndex: number;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface RowRemoveResult {
    status: string;
    providerId: string;
    objectName: string;
    rowIndex: number;
    rowCount?: number;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface RowSortRequest {
    objectName: string;
    columnName: string;
    direction: "ascending" | "descending";
    naLast?: boolean;
    emptyLast?: boolean;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface RowSortResult {
    status: string;
    providerId: string;
    objectName: string;
    columnName: string;
    direction: "ascending" | "descending";
    rowCount?: number;
    command?: string;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface VariableMetadataSnapshot {
    status: string;
    providerId: string;
    objectName: string;
    variables: Array<{
        name: string;
        type: string;
        role: string;
        label: string;
        width?: number;
        decimals?: number;
        values?: string;
        categories?: Array<{
            value: unknown;
            label: string;
            isMissing?: boolean;
        }>;
        missingRange?: {
            min: string;
            max: string;
        } | null;
        align?: string;
        measure?: string;
        numeric?: boolean;
        factor?: boolean;
        calibrated?: boolean;
        binary?: boolean;
        character?: boolean;
        categorical?: boolean;
        date?: boolean;
    }>;
    message: string;
    refreshedAt: string;
}


export type VariableMetadataFieldKey =
    | "name"
    | "type"
    | "role"
    | "width"
    | "decimals"
    | "label"
    | "values"
    | "align"
    | "measure";


export interface VariableMetadataUpdateRequest {
    objectName: string;
    variableName: string;
    metadataKey: VariableMetadataFieldKey;
    value: string;
    label: string;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface VariableMetadataUpdateResult {
    status: string;
    providerId: string;
    objectName: string;
    variableName: string;
    metadataKey: VariableMetadataFieldKey;
    value: string;
    label: string;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface ValueLabelSnapshot {
    status: string;
    providerId: string;
    objectName: string;
    valueLabels: Array<{
        variable: string;
        labels: Array<{
            value: unknown;
            label: string;
        }>;
    }>;
    message: string;
    refreshedAt: string;
}


export interface ValueLabelUpdateRequest {
    objectName: string;
    variableName: string;
    labels: Array<{
        value: unknown;
        label: string;
    }>;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface ValueLabelUpdateResult {
    status: string;
    providerId: string;
    objectName: string;
    variableName: string;
    labels: Array<{
        value: unknown;
        label: string;
    }>;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface DeclaredMissingSnapshot {
    status: string;
    providerId: string;
    objectName: string;
    declaredMissing: Array<{
        variable: string;
        values: Array<{
            value: unknown;
            label: string;
        }>;
    }>;
    message: string;
    refreshedAt: string;
}


export interface DeclaredMissingUpdateRequest {
    objectName: string;
    variableName: string;
    values: Array<{
        value: unknown;
        label: string;
    }>;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface DeclaredMissingUpdateResult {
    status: string;
    providerId: string;
    objectName: string;
    variableName: string;
    values: Array<{
        value: unknown;
        label: string;
    }>;
    transcriptEvents: TranscriptEvent[];
    message: string;
    updatedAt: string;
}


export interface ImportRequest {
    source: string;
    format: string;
    targetName: string;
    overwrite: boolean;
    uiCommandVisibility: UiCommandVisibility;
    visibleCommandText: string;
}


export interface ImportPlanRequest {
    source: string;
    targetName: string;
}


export interface ImportPlanResult {
    status: string;
    source: string;
    format: string;
    targetName: string;
    exists: boolean;
    sizeBytes: number;
    message: string;
    plannedAt: string;
}


export interface ImportResult {
    status: string;
    providerId: string;
    source: string;
    format: string;
    targetName: string;
    overwrite: boolean;
    transcriptEvents: TranscriptEvent[];
    message: string;
    importedAt: string;
}


export interface HelpTopicRequest {
    topic: string;
    package?: string;
    allowSearch?: boolean;
    source: string;
}


export interface HelpTopicMatch {
    topic: string;
    title: string;
    package: string;
    packagePath: string;
    library: string;
    path: string;
}


export interface HelpTopicResult {
    status: string;
    providerId: string;
    topic: string;
    kind: string;
    title: string;
    path: string;
    matches: HelpTopicMatch[];
    body: string;
    message: string;
    resolvedAt: string;
}


export interface CompletionRequest {
    prefix: string;
    source: string;
    code?: string;
    cursorColumn?: number;
    timeoutMs?: number;
    packageName?: string;
    includeInternals?: boolean;
}


export interface CompletionResult {
    status: string;
    providerId: string;
    prefix: string;
    items: Array<{
        label: string;
        detail: string;
        kind: string;
    }>;
    exports?: string[];
    internals?: string[];
    symbols?: string[];
    message: string;
    resolvedAt: string;
}


export interface DependencyCheckRequest {
    kind: string;
    names: string[];
    source: string;
}


export interface DependencyCheckResult {
    status: string;
    providerId: string;
    kind: string;
    items: Array<{
        name: string;
        status: string;
        version: string;
        message: string;
    }>;
    message: string;
    checkedAt: string;
}


export interface InvisibleQueryRequest {
    query: string;
    source: string;
}


export interface InvisibleQueryResult {
    status: string;
    providerId: string;
    query: string;
    value: unknown;
    message: string;
    queriedAt: string;
}


export interface InvisibleMutationRequest {
    mutation: string;
    value: unknown;
    source: string;
}


export interface InvisibleMutationResult {
    status: string;
    providerId: string;
    mutation: string;
    value: unknown;
    message: string;
    mutatedAt: string;
}


export interface DialogExecutionRequest {
    dialogId: string;
    owner: string;
    inputs: Record<string, unknown>;
    source: string;
}


export interface DialogExecutionResult {
    status: string;
    providerId: string;
    dialogId: string;
    owner: string;
    outputs: Record<string, unknown>;
    message: string;
    executedAt: string;
}


export interface RuntimeEventRecord {
    type: string;
    providerId: string;
    objectName: string;
    detail: string;
    payload: Record<string, unknown>;
    createdAt: string;
}


export interface RuntimeEventSnapshot {
    status: string;
    providerId: string;
    events: RuntimeEventRecord[];
    message: string;
    refreshedAt: string;
}


export interface PromptRequest {
    prompt: string;
    kind: string;
    source: string;
}


export interface PromptAnswerRequest {
    promptId: string;
    answer: unknown;
}


export interface PromptRecord {
    id: string;
    providerId: string;
    prompt: string;
    kind: string;
    status: string;
    answer: unknown;
    createdAt: string;
    answeredAt: string;
}


export interface PromptResult {
    status: string;
    providerId: string;
    prompt: PromptRecord | null;
    message: string;
    updatedAt: string;
}


export interface PromptSnapshot {
    status: string;
    providerId: string;
    prompts: PromptRecord[];
    message: string;
    refreshedAt: string;
}


export interface StartupTaskExecutionRequest {
    taskId: string;
    owner: string;
    source: string;
}


export interface StartupTaskExecutionResult {
    status: string;
    providerId: string;
    taskId: string;
    owner: string;
    message: string;
    executedAt: string;
}

export interface ProductCommandRequest {
    productId: string;
    command: string;
    label: string;
    capability: string;
    rPackages: string[];
    source: string;
}


export interface ProductCommandResult {
    status: string;
    providerId: string;
    productId: string;
    command: string;
    transcriptEvents: TranscriptEvent[];
    message: string;
    executedAt: string;
}


export interface RuntimeExtensionMethodRequest {
    method: string;
    params: Record<string, unknown>;
    source: string;
}


export interface RuntimeExtensionMethodResult {
    status: string;
    providerId: string;
    method: string;
    value: unknown;
    message: string;
    executedAt: string;
}


export interface RuntimeProvider {
    manifest: RuntimeProviderManifest;
    createSession: () => RuntimeSessionSnapshot;
    lifecycleController?: RuntimeLifecycleController;
    commandController?: RuntimeCommandController;
    workspaceController?: RuntimeWorkspaceController;
    tabularController?: RuntimeTabularController;
    importController?: RuntimeImportController;
    toolController?: RuntimeToolController;
    queryController?: RuntimeQueryController;
    productCommandController?: RuntimeProductCommandController;
    extensionController?: RuntimeExtensionController;
    eventController?: RuntimeEventController;
    transportController?: RuntimeTransportController;
    readOnlyAdapter?: RuntimeReadOnlyAdapter;
}

export interface RuntimeProviderOptions {
    rootDir?: string;
    productId?: string;
    processLifecycle?: boolean;
    transportEndpoint?: string;
    transportAuthPolicy?: RuntimeTransportAuthPolicy;
    transportCredential?: RuntimeTransportCredential;
    transportConnectProbe?: RuntimeTransportConnectProbe;
    runtimeBootstrap?: unknown;
    onTranscriptEvents?: (events: TranscriptEvent[]) => void;
    onUnexpectedExit?: (details: {
        code: number | null;
        signal: NodeJS.Signals | null;
        output: string;
    }) => void;
}


export interface RuntimeLifecycleController {
    start: (snapshot: RuntimeSessionSnapshot) => Promise<RuntimeSessionSnapshot>;
    stop: (snapshot: RuntimeSessionSnapshot) => Promise<RuntimeSessionSnapshot>;
}


export interface RuntimeCommandController {
    executeVisibleCommand: (request: VisibleCommandRequest, snapshot: RuntimeSessionSnapshot) => Promise<TranscriptEvent[]>;
}


export interface RuntimeEventController {
    listRuntimeEvents: (snapshot: RuntimeSessionSnapshot) => Promise<RuntimeEventRecord[]>;
}


export interface RuntimeWorkspaceController {
    listWorkspaceObjects: (
        snapshot: RuntimeSessionSnapshot,
        options?: WorkspaceListOptions
    ) => Promise<WorkspaceObjectSnapshot[]>;
    readTabularSchema?: (
        objectName: string,
        snapshot: RuntimeSessionSnapshot
    ) => Promise<TabularSchemaSnapshot | null>;
    readTabularPreview: (
        objectName: string,
        snapshot: RuntimeSessionSnapshot,
        request?: Partial<TabularPreviewRequest>
    ) => Promise<TabularPreviewSnapshot | null>;
    inspectObject?: (objectName: string, snapshot: RuntimeSessionSnapshot) => Promise<ObjectInspectionResult | null>;
    removeWorkspaceObjects?: (objectNames: string[], snapshot: RuntimeSessionSnapshot) => Promise<WorkspaceObjectSnapshot[]>;
    renameWorkspaceObject?: (request: WorkspaceRenameRequest, snapshot: RuntimeSessionSnapshot) => Promise<WorkspaceObjectSnapshot[]>;
    clearWorkspace?: (snapshot: RuntimeSessionSnapshot) => Promise<WorkspaceObjectSnapshot[]>;
}


export interface RuntimeTabularController {
    writeCell: (request: CellUpdateRequest, snapshot: RuntimeSessionSnapshot) => Promise<CellUpdateResult>;
    renameColumn?: (request: ColumnRenameRequest, snapshot: RuntimeSessionSnapshot) => Promise<ColumnRenameResult>;
    insertColumn?: (request: ColumnInsertRequest, snapshot: RuntimeSessionSnapshot) => Promise<ColumnInsertResult>;
    removeColumn?: (request: ColumnRemoveRequest, snapshot: RuntimeSessionSnapshot) => Promise<ColumnRemoveResult>;
    insertRow?: (request: RowInsertRequest, snapshot: RuntimeSessionSnapshot) => Promise<RowInsertResult>;
    removeRow?: (request: RowRemoveRequest, snapshot: RuntimeSessionSnapshot) => Promise<RowRemoveResult>;
    sortRows?: (request: RowSortRequest, snapshot: RuntimeSessionSnapshot) => Promise<RowSortResult>;
    updateRowName?: (request: RowNameUpdateRequest, snapshot: RuntimeSessionSnapshot) => Promise<RowNameUpdateResult>;
    readVariableMetadata?: (objectName: string, snapshot: RuntimeSessionSnapshot) => Promise<VariableMetadataSnapshot | null>;
    writeVariableMetadata?: (request: VariableMetadataUpdateRequest, snapshot: RuntimeSessionSnapshot) => Promise<VariableMetadataUpdateResult>;
    readValueLabels?: (objectName: string, snapshot: RuntimeSessionSnapshot) => Promise<ValueLabelSnapshot | null>;
    writeValueLabels?: (request: ValueLabelUpdateRequest, snapshot: RuntimeSessionSnapshot) => Promise<ValueLabelUpdateResult>;
    readDeclaredMissing?: (objectName: string, snapshot: RuntimeSessionSnapshot) => Promise<DeclaredMissingSnapshot | null>;
    writeDeclaredMissing?: (request: DeclaredMissingUpdateRequest, snapshot: RuntimeSessionSnapshot) => Promise<DeclaredMissingUpdateResult>;
}


export interface RuntimeImportController {
    supportsFormat?: (format: string) => boolean;
    importData: (request: ImportRequest, snapshot: RuntimeSessionSnapshot) => Promise<ImportResult>;
}


export interface RuntimeToolController {
    readHelpTopic?: (request: HelpTopicRequest, snapshot: RuntimeSessionSnapshot) => Promise<HelpTopicResult>;
    readCompletions?: (request: CompletionRequest, snapshot: RuntimeSessionSnapshot) => Promise<CompletionResult>;
    checkDependencies?: (request: DependencyCheckRequest, snapshot: RuntimeSessionSnapshot) => Promise<DependencyCheckResult>;
}


export interface RuntimeQueryController {
    executeInvisibleQuery?: (request: InvisibleQueryRequest, snapshot: RuntimeSessionSnapshot) => Promise<InvisibleQueryResult>;
    executeInvisibleMutation?: (request: InvisibleMutationRequest, snapshot: RuntimeSessionSnapshot) => Promise<InvisibleMutationResult>;
}


export interface RuntimeProductCommandController {
    executeProductCommand?: (request: ProductCommandRequest, snapshot: RuntimeSessionSnapshot) => Promise<ProductCommandResult>;
}


export interface RuntimeExtensionController {
    executeRuntimeMethod?: (
        request: RuntimeExtensionMethodRequest,
        snapshot: RuntimeSessionSnapshot
    ) => Promise<RuntimeExtensionMethodResult>;
}


export interface RuntimeReadOnlyAdapter {
    listWorkspaceObjects: (providerId: string) => WorkspaceObjectSnapshot[];
    readTabularPreview: (providerId: string, objectName: string) => TabularPreviewSnapshot | null;
    readVariableMetadata?: (providerId: string, objectName: string) => VariableMetadataSnapshot | null;
    readValueLabels?: (providerId: string, objectName: string) => ValueLabelSnapshot | null;
    readDeclaredMissing?: (providerId: string, objectName: string) => DeclaredMissingSnapshot | null;
}


export type RuntimeProviderFactory = (options?: RuntimeProviderOptions) => RuntimeProvider;


export interface RuntimeProviderRegistry {
    [providerId: string]: RuntimeProviderFactory;
}


export interface RuntimeSessionManager {
    getSnapshot: () => RuntimeSessionSnapshot;
    start: () => Promise<RuntimeSessionSnapshot>;
    stop: () => Promise<RuntimeSessionSnapshot>;
    executeVisibleCommand: (request: VisibleCommandRequest) => Promise<TranscriptEvent[]>;
    getWorkspaceSnapshot: () => WorkspaceSnapshot;
    listWorkspaceObjects: (
        options?: WorkspaceListOptions
    ) => Promise<WorkspaceSnapshot>;
    removeWorkspaceObjects: (objectNames: string[]) => Promise<WorkspaceSnapshot>;
    renameWorkspaceObject: (request: WorkspaceRenameRequest) => Promise<WorkspaceSnapshot>;
    clearWorkspace: () => Promise<WorkspaceSnapshot>;
    inspectObject: (objectName: string) => Promise<ObjectInspectionResult>;
    getActiveDataset: () => ActiveDatasetSnapshot;
    setActiveDataset: (objectName: string) => Promise<ActiveDatasetSnapshot>;
    readTabularSchema: (objectName: string) => Promise<TabularSchemaSnapshot>;
    readTabularPreview: (input: string | Partial<TabularPreviewRequest>) => Promise<TabularPreviewSnapshot>;
    writeCell: (request: CellUpdateRequest) => Promise<CellUpdateResult>;
    writeCells: (requests: CellUpdateRequest[]) => Promise<CellUpdateBatchResult>;
    renameColumn: (request: ColumnRenameRequest) => Promise<ColumnRenameResult>;
    insertColumn: (request: ColumnInsertRequest) => Promise<ColumnInsertResult>;
    removeColumn: (request: ColumnRemoveRequest) => Promise<ColumnRemoveResult>;
    insertRow: (request: RowInsertRequest) => Promise<RowInsertResult>;
    removeRow: (request: RowRemoveRequest) => Promise<RowRemoveResult>;
    sortRows: (request: RowSortRequest) => Promise<RowSortResult>;
    updateRowName: (request: RowNameUpdateRequest) => Promise<RowNameUpdateResult>;
    readVariableMetadata: (objectName: string) => Promise<VariableMetadataSnapshot>;
    writeVariableMetadata: (request: VariableMetadataUpdateRequest) => Promise<VariableMetadataUpdateResult>;
    readValueLabels: (objectName: string) => Promise<ValueLabelSnapshot>;
    writeValueLabels: (request: ValueLabelUpdateRequest) => Promise<ValueLabelUpdateResult>;
    readDeclaredMissing: (objectName: string) => Promise<DeclaredMissingSnapshot>;
    writeDeclaredMissing: (request: DeclaredMissingUpdateRequest) => Promise<DeclaredMissingUpdateResult>;
    importData: (request: ImportRequest) => Promise<ImportResult>;
    readHelpTopic: (request: HelpTopicRequest) => Promise<HelpTopicResult>;
    readCompletions: (request: CompletionRequest) => Promise<CompletionResult>;
    checkDependencies: (request: DependencyCheckRequest) => Promise<DependencyCheckResult>;
    executeInvisibleQuery: (request: InvisibleQueryRequest) => Promise<InvisibleQueryResult>;
    executeInvisibleMutation: (request: InvisibleMutationRequest) => Promise<InvisibleMutationResult>;
    executeRuntimeMethod: (request: RuntimeExtensionMethodRequest) => Promise<RuntimeExtensionMethodResult>;
    executeDialog: (request: DialogExecutionRequest) => Promise<DialogExecutionResult>;
    executeProductCommand: (request: ProductCommandRequest) => Promise<ProductCommandResult>;
    listRuntimeEvents: () => Promise<RuntimeEventSnapshot>;
    requestPrompt: (request: PromptRequest) => Promise<PromptResult>;
    answerPrompt: (request: PromptAnswerRequest) => Promise<PromptResult>;
    listPrompts: () => Promise<PromptSnapshot>;
    executeStartupTask: (request: StartupTaskExecutionRequest) => Promise<StartupTaskExecutionResult>;
}
