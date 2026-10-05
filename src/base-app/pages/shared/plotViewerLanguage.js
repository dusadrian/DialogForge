(function (windowRef) {
    "use strict";

    const bindPlotViewerLanguage = function (bindings) {
        const bridge = bindings.bridge || {};
        let languageRevision = 0;

        const apply = function (i18n) {
            bindings.applyTranslations(i18n || {});
            bindings.refreshHistory();
        };

        if (typeof bridge.onLanguageChanged === "function") {
            bridge.onLanguageChanged(function (payload) {
                if (!payload || !payload.i18n || typeof payload.i18n !== "object") {
                    return;
                }

                languageRevision += 1;
                apply(payload.i18n);
            });
        }

        if (typeof bridge.getComposition !== "function") {
            return Promise.resolve();
        }

        const initialRevision = languageRevision;

        return Promise.resolve().then(function () {
            return bridge.getComposition();
        }).then(function (composition) {
            if (languageRevision !== initialRevision) {
                return;
            }

            apply(composition && composition.i18n);
        }).catch(function () {});
    };

    const api = { bindPlotViewerLanguage };

    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }

    if (windowRef) {
        windowRef.DialogForgePlotViewerLanguage = api;
    }
})(typeof window === "object" ? window : null);
