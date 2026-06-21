export interface RuntimeConditionSet {
    elements?: string[];
    [key: string]: unknown;
}

export interface RuntimeControl {
    name: string;
    visible: boolean;
    enabled: boolean;
    initialize: boolean;
    kind?: string;
    value?: unknown;
    checked?: boolean;
    selected?: boolean | unknown[];
    choice?: boolean;
    conditions?: RuntimeConditionSet;
    host?: HTMLElement;
    dataList?: string[];
    dataSource?: string;
    dataValue?: string;
    selectionMode?: string;
    autoSearchEnabled?: boolean;
    memberNames?: string[];
    native?: HTMLInputElement;
    custom?: HTMLElement;
    __scriptItems?: string[];
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    check?: () => void;
    uncheck?: () => void;
    select?: () => void;
    deselect?: () => void;
    setValue?: (value: unknown) => void;
    updateOptionsFromR?: (
        selectData: Record<string, unknown>
    ) => void;
}

export interface SearchableContainerControl extends RuntimeControl {
    kind: "container";
    host: HTMLElement;
    autoSearchEnabled: boolean;
    searchQuery: string;
    applySearchFilter: () => void;
}
