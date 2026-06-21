export const DATASET_EDITOR_ROW_HEIGHT = 26;
export const DATASET_EDITOR_HEADER_HEIGHT = 27;
export const DATASET_EDITOR_INDEX_COLUMN_WIDTH = 58;
export const DATASET_EDITOR_OVERSCAN_ROWS = 20;
export const DATASET_EDITOR_OVERSCAN_COLUMNS = 4;

export const INITIAL_DATA_ROW_COUNT = 40;
export const INITIAL_DATA_COLUMN_WIDTH = 112;
export const INITIAL_DATA_MINIMUM_COLUMNS = 16;
export const INITIAL_DATA_MAXIMUM_COLUMNS = 32;

export const VARIABLE_METADATA_BATCH_SIZE = 48;
export const VARIABLE_METADATA_BATCH_IDLE_DELAY = 320;
export const VARIABLE_METADATA_BATCH_ACTIVE_DELAY = 60;


export const getMinimumVisibleVariableRows = function(
    host?: HTMLElement | null
): number {
    const minimumHeight = DATASET_EDITOR_ROW_HEIGHT * 12;
    const viewportHeight = Math.max(host?.clientHeight || 0, minimumHeight);

    return Math.max(
        12,
        Math.ceil(viewportHeight / DATASET_EDITOR_ROW_HEIGHT) + 8
    );
};
