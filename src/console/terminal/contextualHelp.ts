export type ConsoleHelpTopicRequest = {
    query: string;
    topic: string;
    package?: string;
    allowSearch?: boolean;
    kind?: "topic" | "home";
};


export type ParseConsoleHelpCommand = (
    value: unknown
) => ConsoleHelpTopicRequest | null;


export type BuildContextualHelpRequest = (
    selectedText: unknown,
    source: unknown,
    offset: unknown
) => ConsoleHelpTopicRequest | null;
