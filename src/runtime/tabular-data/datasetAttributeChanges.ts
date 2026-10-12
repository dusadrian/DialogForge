import type { DatasetAttributeChange, DatasetVariableMetadata } from "./datasetViewerTypes";


export const collectAttributeChanges = function(
    original: DatasetVariableMetadata,
    draft: DatasetVariableMetadata
): DatasetAttributeChange[] {
    const before = original.attributeEntries || [];
    const after = draft.attributeEntries || [];
    const changes: DatasetAttributeChange[] = [];

    for (const entry of after) {
        if (!entry.editable) {
            continue;
        }
        const previous = before.find((item) => {
            return item.source === entry.source && item.name === entry.name;
        });
        if (!previous || previous.type !== entry.type || previous.value !== entry.value) {
            changes.push({
                source: entry.source,
                name: entry.name,
                type: entry.type,
                value: entry.value,
                previousType: previous?.type,
                previousValue: previous?.value
            });
        }
    }
    for (const entry of before) {
        if (entry.editable && !after.some((item) => {
            return item.source === entry.source && item.name === entry.name;
        })) {
            changes.push({
                source: entry.source,
                name: entry.name,
                type: entry.type,
                value: entry.value,
                remove: true,
                previousType: entry.type,
                previousValue: entry.value
            });
        }
    }
    return changes;
};
