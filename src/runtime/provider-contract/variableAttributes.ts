export type DatasetAttributeSource = {
    id: string;
    label: string;
    types: string[];
};

export type DatasetVariableAttribute = {
    source: string;
    name: string;
    type: string;
    value: string;
    editable: boolean;
    reason: string;
};

export type DatasetAttributeChange = {
    source: string;
    name: string;
    type: string;
    value: string;
    remove?: boolean;
    previousType?: string;
    previousValue?: string;
};
