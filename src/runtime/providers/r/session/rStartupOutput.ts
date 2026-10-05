const readStartupLines = function(output: string): string[] {
    return String(output || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");
};


const isStartupPromptLine = function(line: string): boolean {
    return /^\s*[>+](?:\s|$)/.test(line);
};


export const readRStartupOutput = function(output: string): string {
    const startupLines: string[] = [];
    for (const line of readStartupLines(output)) {
        if (isStartupPromptLine(line)) {
            break;
        }
        startupLines.push(line);
    }
    return startupLines.join("\n").trim();
};


export const hasRStartupPrompt = function(output: string): boolean {
    return readStartupLines(output).some(isStartupPromptLine);
};
