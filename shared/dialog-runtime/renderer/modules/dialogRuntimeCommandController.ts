import { asText } from "../library/utils";
import { applyCommandDefaults } from "./dialogCommandTemplate";
import type { RuntimeControl } from "./dialogRuntimeTypes";
import {
    dialogRuntimeEventChannels
} from "../../dialogRuntimeIpc";


export interface DialogRuntimeCommandControllerOptions {
    getControls(): Record<string, RuntimeControl>;
    getRadios(): Record<string, Record<string, true>>;
    getSyntax(): {
        command?: string;
        defaultElements?: Record<string, unknown>;
    };
    getCommand(): string;
    setCommand(command: string): void;
    getDependencies(): string[];
    getDialogId(): string;
    sendTo(channel: string, payload: unknown): void;
}


const normalizedCommandText = function(value: unknown): string {
    return asText(value, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
};


export const createDialogRuntimeCommandController = function(
    options: DialogRuntimeCommandControllerOptions
) {
    const getCommandElementValue = function(name: string): unknown {
        const controls = options.getControls();
        const control = controls[name];

        if (control) {
            if (control.checked !== void 0) {
                return Boolean(control.checked);
            }

            if (
                control.choice === true
                && Array.isArray(control.selected)
            ) {
                return control.selected.slice();
            }

            if (control.value !== void 0) {
                return control.value;
            }
        }

        const radioGroup = options.getRadios()[name];

        if (radioGroup) {
            for (const radioName of Object.keys(radioGroup)) {
                const radioControl = controls[radioName];

                if (radioControl && radioControl.selected) {
                    return radioControl.name;
                }
            }

            return "";
        }

        return "";
    };

    const makeCommand = function(): void {
        const syntax = options.getSyntax() || {
            command: "",
            defaultElements: {}
        };
        let command = asText(syntax.command, "");

        if (!command) {
            options.setCommand("");
            options.sendTo(dialogRuntimeEventChannels.commandUpdate, "");
            return;
        }

        const tokens = command.match(/({[a-z0-9_]+})/gi) || [];

        for (const token of tokens) {
            const name = token.substring(1, token.length - 1);
            const value = getCommandElementValue(name);
            command = applyCommandDefaults(
                command,
                syntax.defaultElements || {},
                name,
                token,
                value
            );
        }

        options.setCommand(command);
        options.sendTo(dialogRuntimeEventChannels.commandUpdate, command);
    };

    const sendCurrentCommandToScriptEditor = function(): void {
        const command = normalizedCommandText(options.getCommand());

        if (!command.trim()) {
            return;
        }

        options.sendTo(dialogRuntimeEventChannels.commandUpdate, command);
        options.sendTo("scriptEditor:insertCode", { code: command });
    };

    const sendCurrentCommandToClipboard = function(): void {
        const command = normalizedCommandText(options.getCommand());

        if (!command.trim()) {
            return;
        }

        options.sendTo(dialogRuntimeEventChannels.commandUpdate, command);

        try {
            if (navigator?.clipboard?.writeText) {
                void navigator.clipboard.writeText(command);
                return;
            }
        }
        catch {}

    };

    const runCurrentCommand = function(): void {
        options.sendTo(dialogRuntimeEventChannels.runCommand, {
            command: options.getCommand(),
            dependencies: options.getDependencies().slice(),
            dialogID: options.getDialogId()
        });
    };

    return {
        getCommandElementValue,
        makeCommand,
        runCurrentCommand,
        sendCurrentCommandToClipboard,
        sendCurrentCommandToScriptEditor
    };
};
