import {
    createColumn,
    createTabularPreview
} from "../../tabular-data/tabularProtocol";
import type {
    RuntimeSessionSnapshot,
    RuntimeWorkspaceController,
    TabularColumnSnapshot,
    TabularPreviewRequest,
    TabularPreviewSnapshot,
    WorkspaceListOptions,
    WorkspaceObjectSnapshot
} from "../../provider-contract/runtimeProvider";
import type { RuntimeTransportController } from "../../transport/runtimeTransport";
import { createWorkspaceObject } from "../../workspace/workspaceProtocol";
import { webRTransportMethods } from "./webRTransportMethods";
import {
    readResponseArray,
    readResponseObject,
    sendWebRRequest
} from "./webRTransportResponse";


const readColumn = function(value: unknown): TabularColumnSnapshot {
    return createColumn(
        value && typeof value === "object" && !Array.isArray(value)
            ? value as Partial<TabularColumnSnapshot>
            : {}
    );
};


const readWorkspaceObject = function(value: unknown): WorkspaceObjectSnapshot {
    return createWorkspaceObject(
        value && typeof value === "object" && !Array.isArray(value)
            ? value as Partial<WorkspaceObjectSnapshot>
            : {}
    );
};


export const createWebRWorkspaceController = function(
    transport: RuntimeTransportController
): RuntimeWorkspaceController {
    return {
        listWorkspaceObjects: async function(
            snapshot: RuntimeSessionSnapshot,
            options?: WorkspaceListOptions
        ): Promise<WorkspaceObjectSnapshot[]> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.workspaceObjects,
                { options: options || {} }
            );

            if (response.status === "error") {
                return [];
            }

            return readResponseArray(response, "objects").map(readWorkspaceObject);
        },
        readTabularPreview: async function(
            objectName: string,
            snapshot: RuntimeSessionSnapshot,
            request?: Partial<TabularPreviewRequest>
        ): Promise<TabularPreviewSnapshot | null> {
            const response = await sendWebRRequest(
                transport,
                webRTransportMethods.tabularPreview,
                {
                    objectName,
                    request: request || {}
                }
            );

            if (response.status === "error") {
                return createTabularPreview({
                    status: "failed",
                    providerId: snapshot.providerId,
                    objectName,
                    message: response.message || "WebR tabular preview failed."
                });
            }

            const payload = readResponseObject(response);
            const columns = Array.isArray(payload.columns)
                ? payload.columns.map(readColumn)
                : [];
            const rows = Array.isArray(payload.rows)
                ? payload.rows as Record<string, unknown>[]
                : [];

            return createTabularPreview({
                status: String(payload.status || "ready"),
                providerId: snapshot.providerId,
                objectName,
                columns,
                rows,
                rowNames: Array.isArray(payload.rowNames)
                    ? payload.rowNames.map((value) => String(value || ""))
                    : [],
                rowOffset: Number(payload.rowOffset),
                columnOffset: Number(payload.columnOffset),
                totalRowCount: Number(payload.totalRowCount),
                totalColumnCount: Number(payload.totalColumnCount),
                message: String(payload.message || response.message || "")
            });
        }
    };
};
