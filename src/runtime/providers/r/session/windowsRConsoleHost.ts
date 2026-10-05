import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Only Windows R startup mechanics belong here. The host runs the same R
// launcher and shared prompt/control sources used by the other native hosts.
export const resolveWindowsRConsoleHost = function(
    rCommand: string,
    env: Record<string, string>,
    helperRoot: string
): { command: string; env: Record<string, string> } {
    const identity = execFileSync(rCommand, ["--vanilla", "--slave", "-e", [
        'cat(paste(R.version$platform, getRversion(), sep = "-"), "\\n",',
        'R.home(), "\\n", R.home("bin"), "\\n", sep = "")'
    ].join(" ")], { env, encoding: "utf8", timeout: 10000, windowsHide: true }).trim().split(/\r?\n/);
    if (identity.length !== 3 || !/^x86_64-w64-mingw32-\d+\.\d+\.\d+$/.test(identity[0])) {
        throw new Error("Cannot identify the selected Windows R version and architecture.");
    }
    const command = path.join(helperRoot, identity[0], "dialogforgeruntime",
        "libs", "x64", "dialogforge-r-host.exe");
    if (!fs.existsSync(command) || !fs.statSync(command).isFile()) {
        throw new Error("The selected Windows R requires its verified, version-pinned DialogForge console host.");
    }
    const result: Record<string, string> = { ...env, R_HOME: identity[1] };
    const existingPath = Object.keys(result).find(name => name.toLowerCase() === "path");
    const currentPath = existingPath ? result[existingPath] : "";
    for (const name of Object.keys(result).filter(name => name.toLowerCase() === "path")) {
        delete result[name];
    }
    result.PATH = identity[2] + ";" + (currentPath || "");
    return { command, env: result };
};
