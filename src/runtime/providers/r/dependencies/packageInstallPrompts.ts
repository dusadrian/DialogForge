import type { PackageLibraryChoice, PackageRestartChoice } from "./packageInstallWorkflow";


export interface RPackageInstallPrompt {
    type: "warning" | "question";
    title: string;
    message: string;
    detail: string;
    buttons: string[];
    cancelId: number;
    defaultId: number;
    noLink: boolean;
}


export const createRPackageInstallPrompts = function(bindings: {
    translate(text: string): string;
    showMessageBox(prompt: RPackageInstallPrompt): Promise<{ response: number }>;
}) {
    const t = bindings.translate;

    return {
        async confirmRestart(input: { packages?: unknown }): Promise<PackageRestartChoice> {
            const names = Array.isArray(input.packages)
                ? input.packages.map((value) => String(value || "").trim()).filter(Boolean)
                : [];
            const result = await bindings.showMessageBox({
                type: "warning", buttons: [t("Cancel"), t("Clean"), t("Restore")],
                cancelId: 0, defaultId: 0, noLink: true,
                title: t("Restart R before installing packages"),
                message: t("Some R packages are already loaded."),
                detail: [
                    t("Restart R before installing or updating these packages. Choose Clean to restart with an empty workspace, or Restore to restart and restore the current workspace."),
                    names.join(", ")
                ].filter(Boolean).join("\n\n")
            });

            if (result.response === 1) {
                return { action: "clean" };
            }
            if (result.response === 2) {
                return { action: "restore" };
            }
            return { action: "cancel" };
        },
        async chooseLibrary(input: {
            userLibrary?: unknown; defaultLibrary?: unknown;
        }): Promise<PackageLibraryChoice> {
            const userLibrary = String(input.userLibrary || "").trim();
            const defaultLibrary = String(input.defaultLibrary || "").trim();
            const result = await bindings.showMessageBox({
                type: "question",
                buttons: [t("Cancel"), t("At user level"), t("At system level")],
                cancelId: 0, defaultId: 1, noLink: true,
                title: t("Choose R package library"),
                message: t("Choose where to install R packages."),
                detail: [
                    t("The user-level library is usually in your home directory. The default library is managed by the R installation."),
                    userLibrary ? `${t("At user level")}: ${userLibrary}` : "",
                    defaultLibrary ? `${t("At system level")}: ${defaultLibrary}` : ""
                ].filter(Boolean).join("\n")
            });

            if (result.response === 1) {
                return { action: "user" };
            }
            if (result.response === 2) {
                return { action: "default" };
            }
            return { action: "cancel" };
        }
    };
};
