import type {
    ActiveDatasetSnapshot,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export interface ProductDialogWorkspaceSchema {
    columns?: Array<{
        name?: string;
        type?: string;
    }>;
}


export interface ProductDialogWorkspaceSource {
    listWorkspaceObjects(): Promise<WorkspaceSnapshot>;
    readTabularSchema(objectName: string): Promise<ProductDialogWorkspaceSchema>;
    getActiveDataset(): ActiveDatasetSnapshot;
}


export interface ProductDialogWorkspaceData {
    dataframe: Record<string, {
        colnames: string[];
        numeric: boolean[];
        character: boolean[];
        logical: boolean[];
        factor: boolean[];
    }>;
    select: {
        list: string[];
        matrix: string[];
        vector: string[];
    };
    variables: WorkspaceSnapshot["objects"];
    activeDataset: string;
}


export const createProductDialogWorkspaceDataReader = function(
    source: ProductDialogWorkspaceSource
) {
    return async function(
        workspaceSnapshot?: WorkspaceSnapshot
    ): Promise<ProductDialogWorkspaceData> {
        const workspace = workspaceSnapshot
            || await source.listWorkspaceObjects();
        const dataframe: ProductDialogWorkspaceData["dataframe"] = {};
        const list: string[] = [];
        const matrix: string[] = [];
        const vector: string[] = [];

        for (const object of workspace.objects) {
            const name = String(object.name || "").trim();

            if (!name) {
                continue;
            }

            if (object.capabilities.includes("tabular.read")) {
                const schema = await source.readTabularSchema(name);
                const columns = Array.isArray(schema.columns)
                    ? schema.columns
                    : [];

                dataframe[name] = {
                    colnames: columns.map(function(column): string {
                        return String(column.name || "");
                    }),
                    numeric: columns.map(function(column): boolean {
                        return /numeric|integer|double/.test(
                            String(column.type || "").toLowerCase()
                        );
                    }),
                    character: columns.map(function(column): boolean {
                        return /character|string/.test(
                            String(column.type || "").toLowerCase()
                        );
                    }),
                    logical: columns.map(function(column): boolean {
                        return /logical|boolean/.test(
                            String(column.type || "").toLowerCase()
                        );
                    }),
                    factor: columns.map(function(column): boolean {
                        return /factor|ordered/.test(
                            String(column.type || "").toLowerCase()
                        );
                    })
                };
            }

            const kind = String(object.kind || "").toLowerCase();

            if (kind.includes("matrix")) {
                matrix.push(name);
            }
            else if (
                kind.includes("vector")
                || kind.includes("factor")
            ) {
                vector.push(name);
            }
            else {
                list.push(name);
            }
        }

        return {
            dataframe,
            select: {
                list,
                matrix,
                vector
            },
            variables: workspace.objects,
            activeDataset:
                source.getActiveDataset().objectName || ""
        };
    };
};
