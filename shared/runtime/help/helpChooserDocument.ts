import type {
    HelpTopicResult
} from "../provider-contract/runtimeProvider";
import { createHelpCommandUrl } from "./helpCommandUrl";


const escapeHelpHtml = function(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};


export const buildHelpChooserDocument = function(
    result: HelpTopicResult,
    toHelpUrl: (pathValue: string) => string
): string {
    const matches = Array.isArray(result.matches) ? result.matches : [];
    const topic = String(result.topic || "").trim();
    const title = result.kind === "search"
        ? `Search results for ${topic}`
        : `Help topics matching ${topic}`;
    const rows = matches.map((match) => {
        const matchTopic = String(match.topic || "").trim();
        const packageName = String(match.package || "").trim();
        const matchTitle = String(match.title || matchTopic).trim();
        const href = match.path
            ? toHelpUrl(String(match.path))
            : createHelpCommandUrl("help", matchTopic);
        const detail = packageName
            ? `${matchTopic} in ${packageName}`
            : matchTopic;

        return [
            '<li class="helpChooserItem">',
            `<a href="${escapeHelpHtml(href)}">${escapeHelpHtml(matchTitle)}</a>`,
            `<div class="helpChooserDetail">${escapeHelpHtml(detail)}</div>`,
            "</li>"
        ].join("");
    }).join("");

    return [
        '<section class="helpChooser">',
        `<h1>${escapeHelpHtml(title)}</h1>`,
        rows
            ? `<ul>${rows}</ul>`
            : '<p class="helpEmpty">Help topic not found.</p>',
        "</section>"
    ].join("");
};
