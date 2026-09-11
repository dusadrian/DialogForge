import { coms } from "./coms";
import { createDialogRuntime } from "./dialogRuntime";
import { isRuntimeDialogSchema } from "./dialog.types.js";
import { normalizeNewDialogForRuntime } from "./dialogAdapter";
import { dialogRuntimeEventChannels } from "../../dialogRuntimeIpc";

const runtime = createDialogRuntime();
let pendingWorkspacePollTimer: number | null = null;
let preparedDialogId = "";

const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};

const asDialogState = function(value: unknown): Record<string, Record<string, unknown>> {
    const source = asRecord(value);
    const state: Record<string, Record<string, unknown>> = {};

    Object.entries(source).forEach(([name, entry]) => {
        state[name] = asRecord(entry);
    });

    return state;
};

coms.on(dialogRuntimeEventChannels.created, async (value: unknown) => {
    const args = asRecord(value);
    const rawData = asRecord(args.data);
    const data = isRuntimeDialogSchema(rawData)
        ? rawData
        : normalizeNewDialogForRuntime(rawData as never);
    const properties = asRecord(data.properties);

    if (!isRuntimeDialogSchema(data)) {
        throw new Error("Dialog payload does not contain a normalized runtime schema.");
    }

    const dialogId = String(args.dialogID || "");
    const prepareOnly = args.prepareOnly === true;

    if (prepareOnly) {
        await runtime.build(dialogId, data, true);
        preparedDialogId = dialogId;
        await document.fonts.ready;
        coms.sendTo("main", dialogRuntimeEventChannels.created, {
            name: dialogId,
            prepared: true
        });
        return;
    }

    const wasPrepared = preparedDialogId === dialogId;
    preparedDialogId = "";
    const build = wasPrepared
        ? runtime.activatePrepared()
        : runtime.build(dialogId, data);

    if (args.workspaceData && typeof args.workspaceData === "object") {
        runtime.incommingDataFromR(asRecord(args.workspaceData));
    }

    if (args.lastState && !wasPrepared) {
        runtime.restoreDialogState(asDialogState(args.lastState));
    }

    await build;

    if (args.lastState && wasPrepared) {
        runtime.restoreDialogState(asDialogState(args.lastState));
    }

    coms.sendTo("main", dialogRuntimeEventChannels.created, {
        name: String(args.dialogID || ""),
        dependencies: String(properties.dependencies || ""),
        rPackageRequirements: Array.isArray(
            properties.rPackageRequirements
        )
            ? properties.rPackageRequirements
            : []
    });

    if (pendingWorkspacePollTimer !== null) {
        clearTimeout(pendingWorkspacePollTimer);
        pendingWorkspacePollTimer = null;
    }
});

coms.on(dialogRuntimeEventChannels.incomingData, (value: unknown) => {
    runtime.incommingDataFromR(asRecord(value));
});

coms.on("dataUpdateFromR", (value: unknown) => {
    runtime.incommingUpdateDataFromR(asRecord(value));
});

coms.sendTo("main", dialogRuntimeEventChannels.browserReady, {});

try {
    document.getElementById("dialogSendToConsole")?.addEventListener("click", (event) => {
        event.preventDefault();
        runtime.sendCurrentCommandToClipboard?.();
    });
    document.getElementById("dialogSendToScriptEditor")?.addEventListener("click", (event) => {
        event.preventDefault();
        runtime.sendCurrentCommandToScriptEditor?.();
    });
}
catch {
    // Toolbar actions are optional in embedded dialog hosts.
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Shift") {
        runtime.keyPressedEvent(event.key, true);
    }
});

document.addEventListener("keyup", (event) => {
    if (event.key === "Shift") {
        runtime.keyPressedEvent(event.key, false);
    }
});
