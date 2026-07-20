import effEnglishWords from "./liveScriptShortCodeWords";


export const LIVE_SCRIPT_SHORT_CODE_VERSION = 1 as const;
export const LIVE_SCRIPT_SHORT_CODE_WORD_COUNT = 3;
export const LIVE_SCRIPT_MINIMUM_SHORT_CODE_VOCABULARY = 2048;


const excludedWords = new Set([
    // Common English homophones are poor spoken classroom identifiers.
    "accept", "except", "affect", "effect", "allowed", "aloud", "altar",
    "alter", "ate", "eight", "bare", "bear", "bee", "brake", "break",
    "buy", "bye", "cell", "sell", "cent", "scent", "sent", "cereal",
    "serial", "coarse", "course", "dear", "deer", "die", "dye", "fair",
    "fare", "flour", "flower", "four", "hear", "here", "hole", "whole",
    "hour", "knight", "night", "know", "mail", "male", "meat", "meet",
    "one", "pair", "pear", "peace", "piece", "plain", "plane", "right",
    "write", "role", "roll", "sea", "see", "stair", "stare", "steal",
    "steel", "suite", "sweet", "tail", "tale", "their", "there", "threw",
    "through", "too", "two", "wait", "weight", "weak", "week", "weather",
    "whether", "which", "witch", "wood", "would", "won", "your",
    // Exclude words that are unsuitable to announce in a classroom.
    "alcohol", "bomb", "cancer", "corpse", "death", "drunk", "funeral",
    "gun", "hate", "hell", "kill", "nazi", "profane", "rape", "rifle",
    "slave", "suicide", "terror", "weapon"
]);


const vocabulary = Object.values(effEnglishWords).filter((word) => {
    return /^[a-z]{3,8}$/.test(word) && !excludedWords.has(word);
});


if (vocabulary.length < LIVE_SCRIPT_MINIMUM_SHORT_CODE_VOCABULARY) {
    throw new Error("Live-script short-code vocabulary is too small.");
}


const vocabularySet = new Set(vocabulary);


const randomIndex = function(size: number): number {
    const maximum = Math.floor(0x100000000 / size) * size;
    const random = new Uint32Array(1);

    do {
        crypto.getRandomValues(random);
    }
    while (random[0] >= maximum);

    return random[0] % size;
};


export const liveScriptShortCodeVocabulary = function(): readonly string[] {
    return vocabulary;
};


export const createLiveScriptShortCode = function(): string {
    const words: string[] = [];

    while (words.length < LIVE_SCRIPT_SHORT_CODE_WORD_COUNT) {
        const word = vocabulary[randomIndex(vocabulary.length)];

        if (!words.includes(word)) {
            words.push(word);
        }
    }

    return words.join("-");
};


export const normalizeLiveScriptShortCode = function(value: unknown): string {
    const words = String(value || "")
        .trim()
        .toLowerCase()
        .split(/[\s-]+/)
        .filter(Boolean);

    if (words.length !== LIVE_SCRIPT_SHORT_CODE_WORD_COUNT
        || words.some((word) => !vocabularySet.has(word))) {
        return "";
    }

    return words.join("-");
};
