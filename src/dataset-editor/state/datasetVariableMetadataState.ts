export interface DatasetVariableMetadataState<Item> {
    readonly items: Item[] | null;
    clear(): void;
    setItems(items: Item[]): void;
    replaceItem(index: number, item: Item): void;
}


export const createDatasetVariableMetadataState = function<Item>(): DatasetVariableMetadataState<Item> {
    let items: Item[] | null = null;

    return {
        get items(): Item[] | null {
            return items;
        },
        clear: function(): void {
            items = null;
        },
        setItems: function(nextItems): void {
            items = nextItems;
        },
        replaceItem: function(index, item): void {
            if (!items || index < 0 || index >= items.length) {
                return;
            }

            items[index] = item;
        }
    };
};
