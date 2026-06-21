const normalizedCommandValue = function(value: unknown): unknown {
    if (value === true) {
        return "true";
    }

    if (value === false) {
        return "false";
    }

    return value;
};

const commandArgumentParts = function(command: string): string[] {
    const firstParenthesis = command.indexOf("(");
    const lastParenthesis = command.lastIndexOf(")");

    if (
        firstParenthesis === -1
        || lastParenthesis === -1
        || lastParenthesis < firstParenthesis
    ) {
        return [];
    }

    const argumentsText = command.substring(
        firstParenthesis + 1,
        lastParenthesis
    );

    return [
        command.substring(0, firstParenthesis + 1),
        ...argumentsText.split(","),
        command.substring(lastParenthesis)
    ];
};

export const applyCommandDefaults = function(
    command: string,
    defaultElements: Record<string, unknown>,
    elementName: string,
    fullToken: string,
    elementValue: unknown
): string {
    const normalizedValue = normalizedCommandValue(elementValue);
    const parts = commandArgumentParts(command);

    if (parts.length === 0) {
        return command.replace(
            fullToken,
            String(normalizedValue ?? "")
        );
    }

    let rebuilt = parts[0];

    for (let index = 1; index < parts.length - 1; index += 1) {
        let part = parts[index];
        let include = true;

        for (const defaultName of Object.keys(defaultElements || {})) {
            if (
                part.indexOf(defaultName) !== -1
                && defaultName === elementName
                && defaultElements[defaultName] === normalizedValue
            ) {
                include = false;
            }
        }

        if (index === 1) {
            part = part.trim();
        }

        if (
            (
                normalizedValue === ""
                || normalizedValue === null
                || normalizedValue === undefined
            )
            && part.indexOf(elementName) !== -1
        ) {
            include = false;
        }

        if (include && part !== "") {
            rebuilt += part + ",";
        }
    }

    if (rebuilt.endsWith(",")) {
        rebuilt = rebuilt.slice(0, -1);
    }

    rebuilt += parts[parts.length - 1];

    return rebuilt.replace(
        fullToken,
        String(normalizedValue ?? "")
    );
};
