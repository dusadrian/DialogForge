"use strict";

// Browser-only Node fallbacks must remain unavailable. The production bundle
// and disposable WebR fixtures use this SAME source, never filesystem mocks.
const browserNodeFallbacks = {
    fs: ["existsSync", "readFileSync"],
    path: ["dirname", "isAbsolute", "join", "relative", "resolve"]
};

const createBrowserNodeFallbackSource = function(moduleName) {
    const members = browserNodeFallbacks[moduleName];
    if (!members) {
        throw new Error("Unknown browser Node fallback: " + moduleName);
    }
    return [
        "const unavailable = function() {",
        `    throw new Error("Node ${moduleName} is not available in the browser shell.");`,
        "};", "",
        ...members.map(member => `export const ${member} = unavailable;`),
        ...(moduleName === "path" ? ['export const sep = "/";'] : []),
        `export default { ${members.join(", ")}${moduleName === "path" ? ", sep" : ""} };`,
        ""
    ].join("\n");
};

const createBrowserNodeFallbackPlugin = function() {
    return {
        name: "unavailable-browser-node-fallbacks",
        setup(builder) {
            builder.onResolve({ filter: /^(fs|path)$/ }, args => ({
                path: args.path, namespace: "browser-node-fallback"
            }));
            builder.onLoad({ filter: /.*/, namespace: "browser-node-fallback" }, args => ({
                contents: createBrowserNodeFallbackSource(args.path), loader: "js"
            }));
        }
    };
};

module.exports = { browserNodeFallbacks, createBrowserNodeFallbackSource, createBrowserNodeFallbackPlugin };
