export interface DatasetEditorIdentityState {
    readonly currentName: string;
    readonly datasetNames: string[];
    setCurrentName(datasetName: string): void;
    setDatasetNames(datasetNames: string[]): void;
}


export const createDatasetEditorIdentityState = function(
): DatasetEditorIdentityState {
    let currentName = "";
    let datasetNames: string[] = [];

    return {
        get currentName(): string {
            return currentName;
        },
        get datasetNames(): string[] {
            return datasetNames;
        },
        setCurrentName: function(datasetName): void {
            currentName = datasetName;
        },
        setDatasetNames: function(nextDatasetNames): void {
            datasetNames = nextDatasetNames;
        }
    };
};
