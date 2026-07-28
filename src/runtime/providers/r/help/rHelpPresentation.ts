export const rHelpTitle = "R Help";


export const createRHelpTopicTitle = function(
    topic: unknown,
    separator = ": "
): string {
    const cleanTopic = String(topic || "").trim();

    return cleanTopic && cleanTopic !== rHelpTitle
        ? `${rHelpTitle}${separator}${cleanTopic}`
        : rHelpTitle;
};
