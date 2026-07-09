import type * as Monaco from "monaco-editor";
import type {
    ScriptBreadcrumbView
} from "./scriptBreadcrumbView";
import type {
    ScriptEditorShellControllerResult
} from "./scriptEditorShellController";
import type {
    ScriptToolbarView
} from "./scriptToolbarView";


export interface ScriptEditorSurfaceStateControllerOptions {
    setTabsHost(host: HTMLElement): void;
}


export interface ScriptEditorSurfaceStateController {
    readonly editor:
        Monaco.editor.IStandaloneCodeEditor | null;
    readonly toolbarView: ScriptToolbarView | null;
    readonly outlineButton: HTMLButtonElement | null;
    readonly breadcrumbView: ScriptBreadcrumbView | null;
    applyShell(shell: ScriptEditorShellControllerResult): void;
    setEditor(
        editor: Monaco.editor.IStandaloneCodeEditor
    ): void;
    closeBreadcrumbPopup(): void;
}


export const createScriptEditorSurfaceStateController = function(
    options: ScriptEditorSurfaceStateControllerOptions
): ScriptEditorSurfaceStateController {
    let editor:
        Monaco.editor.IStandaloneCodeEditor | null = null;
    let toolbarView: ScriptToolbarView | null = null;
    let outlineButton: HTMLButtonElement | null = null;
    let breadcrumbView: ScriptBreadcrumbView | null = null;

    return {
        get editor() {
            return editor;
        },
        get toolbarView() {
            return toolbarView;
        },
        get outlineButton() {
            return outlineButton;
        },
        get breadcrumbView() {
            return breadcrumbView;
        },
        applyShell(shell) {
            toolbarView = shell.toolbarView;
            outlineButton = shell.outlineButton;
            breadcrumbView = shell.breadcrumbView;
            options.setTabsHost(shell.shellView.tabsBar);
        },
        setEditor(nextEditor) {
            editor = nextEditor;
        },
        closeBreadcrumbPopup() {
            breadcrumbView?.closePopup();
        }
    };
};
