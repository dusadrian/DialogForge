import type {
    Dialog,
    MessageBoxOptions
} from "electron";


export interface RuntimeExitDetails {
    code: number | null;
    signal: NodeJS.Signals | null;
    output: string;
}


export interface RuntimeRecoveryDialogControllerOptions {
    dialog: Dialog;
    productName: string;
}


export interface RuntimeRecoveryDialogController {
    chooseRecoveryAction(details: RuntimeExitDetails): Promise<"restart" | "close">;
}


const recoveryDetail = function(details: RuntimeExitDetails): string {
    return [
        details.signal ? `Signal: ${details.signal}` : "",
        details.code !== null ? `Exit code: ${String(details.code)}` : "",
        details.output
    ].filter(Boolean).join("\n\n");
};


export const createRuntimeRecoveryDialogController = function(
    options: RuntimeRecoveryDialogControllerOptions
): RuntimeRecoveryDialogController {
    return {
        chooseRecoveryAction: async function(
            details
        ): Promise<"restart" | "close"> {
            const messageOptions: MessageBoxOptions = {
                type: "warning",
                title: options.productName,
                message: "R session ended unexpectedly.",
                detail: recoveryDetail(details),
                buttons: [
                    "Restart",
                    "Close"
                ],
                defaultId: 0,
                cancelId: 1,
                noLink: true
            };
            const response = await options.dialog.showMessageBox(messageOptions);

            return response.response === 0 ? "restart" : "close";
        }
    };
};
