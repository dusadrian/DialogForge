import {
    createObjectInspectionResult
} from "./workspaceProtocol";
import { createTabularPreview } from "../tabular-data/tabularProtocol";
import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    TabularColumnSnapshot,
    WorkspaceObjectSnapshot
} from "../provider-contract/runtimeProvider";


export interface RuntimeFallbackWorkspaceControllerOptions {
    listObjects(): WorkspaceObjectSnapshot[];
    hasRows(objectName: string): boolean;
    readRows(objectName: string): Record<string, unknown>[];
    readRowNames(objectName: string): string[];
    createColumns(rows: Record<string, unknown>[]): TabularColumnSnapshot[];
}


export const createRuntimeFallbackWorkspaceController = function(
    options: RuntimeFallbackWorkspaceControllerOptions
): RuntimeWorkspaceController {
    return {
        listWorkspaceObjects: async function() {
            return options.listObjects();
        },
        readTabularPreview: async function(objectName, snapshot) {
            if (!options.hasRows(objectName)) {
                return null;
            }

            const rows = options.readRows(objectName);

            return createTabularPreview({
                status: "ready",
                providerId: snapshot.providerId,
                objectName,
                columns: options.createColumns(rows),
                rows,
                rowNames: options.readRowNames(objectName),
                message: "Placeholder tabular preview; no language process was queried."
            });
        },
        inspectObject: async function(objectName, snapshot) {
            const object = options.listObjects().find((candidate) => {
                return candidate.name === objectName;
            });

            if (!object) {
                return null;
            }

            const rows = options.readRows(object.name);
            const columns = options.createColumns(rows);
            const summary = rows.length > 0
                ? [
                    { name: "rows", value: String(rows.length) },
                    { name: "columns", value: String(columns.length) }
                ]
                : [
                    {
                        name: "summary",
                        value: "No provider-neutral summary is available."
                    }
                ];

            return createObjectInspectionResult({
                status: "ready",
                providerId: snapshot.providerId,
                objectName: object.name,
                kind: object.kind,
                detail: object.detail,
                capabilities: object.capabilities,
                summary,
                message: "Placeholder object inspection; no language process was queried."
            });
        }
    };
};
