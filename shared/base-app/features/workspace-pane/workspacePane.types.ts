import type { WorkspaceSnapshot } from "../../../runtime/provider-contract/runtimeProvider";


export type WorkspaceVariableKind =
    | "table"
    | "function"
    | "class"
    | "boolean"
    | "number"
    | "string"
    | "collection"
    | "other";


export interface WorkspaceVariable {
    access_key: string;
    display_name: string;
    display_value: string;
    display_type: string;
    type_info: string;
    size: number;
    kind: WorkspaceVariableKind;
    length: number;
    has_children: boolean;
    has_viewer: boolean;
    is_truncated: boolean;
    updated_time: number;
}


export interface WorkspaceSnapshotPayload {
    variables: WorkspaceVariable[];
    objectCount: number;
    updatedAt: number;
}


export interface WorkspaceVariableViewItem extends WorkspaceVariable {
    isRecent: boolean;
}


export interface WorkspaceVariableGroup {
    id: string;
    titleKey: string;
    items: WorkspaceVariableViewItem[];
}


export interface WorkspacePaneOptions {
    container: HTMLElement;
    t?: (key: string) => string;
    onInsertVariable?: (name: string) => void;
    onOpenVariable?: (item: WorkspaceVariableViewItem) => void | Promise<void>;
    onMakeActiveDataset?: (item: WorkspaceVariableViewItem) => void | Promise<void>;
    onDeleteVariable?: (name: string) => void | Promise<void>;
    onClearWorkspace?: () => void | Promise<void>;
}


export interface WorkspacePaneController {
    setSnapshot(snapshot: WorkspaceSnapshot | WorkspaceSnapshotPayload | unknown): void;
    setActiveDataset(name: string): void;
    setTranslator(t: (key: string) => string): void;
}
