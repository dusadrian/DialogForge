"use strict";

// Both physical adapters use the SAME help reader and these same assertions.
exports.checkActualRuntimeHelp = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw new Error(options.host + ": " + message);
        }
    };
    const pages = [];
    for (const entry of [
        ["/library/base/html/mean.html", /Arithmetic Mean/i],
        ["/library/base/html/00Index.html", /mean/i],
        ["/doc/html/index.html", /The R Language/i],
        ["/library/declared/html/declared.html", /declared/i]
    ]) {
        const page = await options.fetchPage(entry[0]);
        requireResult(page.ok && page.status === 200 && entry[1].test(page.text || ""),
            "Actual help page/content unavailable: " + entry[0] + " status=" + page.status + " error=" + page.error);
        pages.push({ path: entry[0], status: page.status, bytes: new TextEncoder().encode(page.text).byteLength });
    }
    const mean = await options.fetchPage("/library/base/html/mean.html");
    const home = await options.fetchPage("/doc/html/index.html");
    const resources = [];
    const references = new Map();
    for (const document of [mean, home]) {
        for (const match of String(document.text).matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
            if (/R\.css|logo\.(?:svg|png|jpg)/i.test(match[1])) {
                references.set(new URL(match[1], document.url).href, match[1]);
            }
        }
    }
    requireResult([...references.keys()].some(value => /R\.css/i.test(value)), "Actual help page omitted its stylesheet link");
    requireResult([...references.keys()].some(value => /logo\.svg/i.test(value)), "Actual home page omitted its logo link");
    for (const [url, reference] of references) {
        const resource = await options.fetchResource(url);
        requireResult(resource.ok && resource.status === 200 && resource.body?.length > 0,
            "Actual help asset unavailable: " + url);
        resources.push({ reference, status: resource.status, bytes: resource.body.length, contentType: resource.contentType });
    }
    const missing = await options.fetchPage("/library/base/html/dialogforge-fixture-missing.html");
    requireResult(missing.ok && /httpd error/i.test(missing.text || "")
        && /could not be located/i.test(missing.text || ""),
        "R's missing-topic document was not retained: status=" + missing.status + " text=" + String(missing.text).slice(0, 400));
    const missingAsset = await options.fetchResource("/library/base/html/figures/dialogforge-fixture-missing.png");
    requireResult(!missingAsset.ok, "Missing physical help asset was acknowledged as available");
    const recovered = await options.fetchPage("/library/base/html/mean.html");
    requireResult(recovered.ok, "A missing help resource prevented following valid reads");
    await options.retireOwner();
    const retired = await options.fetchPage("/library/base/html/mean.html");
    requireResult(!retired.ok && retired.status === 410, "A retired help reader reused the old owner");
    console.log(options.host + ": actual shared help/resource reader scenario passed");
    return { host: options.host, pages, resources, missingTopicStatus: missing.status,
        missingAssetStatus: missingAsset.status, missingAssetError: missingAsset.error,
        retiredStatus: retired.status, renderedHelpChecked: false };
};

// Hold a completed physical read across a real replacement. This is not an
// in-flight network/FS retirement or a rendered Help/ServiceWorker test.
exports.checkActualHelpRetirement = async function(options) {
    const observations = [];
    for (const kind of ["page", "resource"]) {
        for (const rejects of [false, true]) {
            let release;
            let arrived;
            const gate = new Promise(resolve => { release = resolve; });
            const physicalRead = new Promise(resolve => { arrived = resolve; });
            let payloadBytes = 0;
            const reader = options.createReader(async function(value) {
                payloadBytes = typeof value === "string"
                    ? new TextEncoder().encode(value).byteLength
                    : value.body?.length || new TextEncoder().encode(value.text || "").byteLength;
                arrived();
                await gate;
                if (rejects) {
                    throw Error("Controlled late help transport exception");
                }
                return value;
            });
            const target = kind === "page" ? "/library/base/html/mean.html" : "/doc/html/R.css";
            const pending = kind === "page" ? reader.fetchPage(target) : reader.fetchResource(target);
            let timer;
            try {
                await Promise.race([physicalRead, new Promise((resolve, reject) => {
                    timer = setTimeout(() => reject(Error(options.host + ": physical help read did not arrive")), 7000);
                })]);
                if (!payloadBytes) {
                    throw Error(options.host + ": empty actual help payload");
                }
                await options.restart();
            }
            finally {
                clearTimeout(timer);
                release();
            }
            const retired = await pending;
            observations.push({ kind, rejects, payloadBytes, status: retired.status,
                error: retired.error, bodyPublished: retired.body !== undefined,
                textPublished: retired.text !== undefined });
            const fresh = options.createReader(async value => value);
            const recovered = kind === "page" ? await fresh.fetchPage(target) : await fresh.fetchResource(target);
            if (!recovered.ok) {
                throw Error(options.host + ": replacement help read failed");
            }
        }
    }
    return { host: options.host, observations, executingReadRetirementChecked: false,
        renderedHelpChecked: false };
};

// The adapters establish physical progress BEFORE retirement: an unfinished
// native HTTP body, or a worker query executing R before its resource read.
// Neither adapter holds a completed response to satisfy this scenario.
exports.checkExecutingHelpRetirement = async function(options) {
    const observations = [];
    for (const kind of ["page", "resource"]) {
        let started;
        let timer;
        let completed = false;
        const progress = new Promise(resolve => { started = resolve; });
        const operation = await options.createOperation(started, kind);
        const target = kind === "page" ? "/library/base/html/mean.html" : "/doc/html/R.css";
        const pending = (kind === "page"
            ? operation.reader.fetchPage(target)
            : operation.reader.fetchResource(target)).then(value => {
                completed = true;
                return value;
            });
        try {
            const physical = await Promise.race([progress, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error(options.host + ": executing help read never started")), 7000);
            })]);
            clearTimeout(timer);
            if (completed) {
                throw Error(options.host + ": help read completed before retirement");
            }
            await options.restart();
            await operation.release();
            const retired = await Promise.race([pending, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error(options.host + ": retired help read did not settle")), 7000);
            })]);
            if (retired.ok || retired.status !== 410
                || retired.body !== undefined || retired.text !== undefined) {
                throw Error(options.host + ": executing old help read published after replacement: "
                    + JSON.stringify(retired));
            }
            const fresh = options.createFreshReader();
            const recovered = kind === "page" ? await fresh.fetchPage(target) : await fresh.fetchResource(target);
            if (!recovered.ok) {
                throw Error(options.host + ": fresh help read failed after executing retirement");
            }
            observations.push({ kind, physical, status: retired.status, error: retired.error,
                bodyPublished: false, textPublished: false, recoveredStatus: recovered.status });
        }
        finally {
            clearTimeout(timer);
            await operation.dispose();
        }
    }
    return { host: options.host, observations, executingReadRetirementChecked: true,
        renderedHelpChecked: false };
};
