// PURE utilities functions, no side effects, no dependencies
// these do not depend on browser-only APIs, so can be imported
// in both renderer AND main process.

import * as path from 'path';
import * as fs from "fs";
import type * as Types from './utils.types';

export interface WindowBoundsLike {
    getBounds(): {
        width: number;
        height: number;
    };
}

const getSettingsStore = () => {
    try {
        return require('../modules/settings');
    } catch {
        return null;
    }
};

const TRUE_SET = new Set(['true', 't', '1']); // , 'yes', 'y', 'on'
const FALSE_SET = new Set(['false', 'f', '0']); // , 'no', 'n', 'off'
const DECIMAL_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const INT_REGEX = /^[+-]?\d+$/;





// ---- inline typing necessary below ----
    export const isRecord = (x: unknown): x is Record<string, unknown> => {
        return notNil(x) && typeof x === "object" && !Array.isArray(x);
    };

    export const isNull = <T>(x: T | null | undefined): x is null => {
        // If x's type includes undefined, it remains possibly undefined in the false branch
        return x === null; // automatically means x is not undefined (so it exists)
    }

    export const notNull = <T>(x: T | null | undefined): x is null => {
        return !isNull(x);
    }

    export const isNil = <T>(x: T | null | undefined): x is null | undefined => {
        return missing(x) || isNull(x);
    }

    export const notNil = <T>(x: T | null | undefined): x is NonNullable<T> => {
        // NonNullable: x is neither null nor undefined, at the same time
        return exists(x) && notNull(x);
    }

    export const isKeyOf = <T extends object>(obj: T, key: PropertyKey): key is keyof T => {
        return !!obj && key in obj;
    }

    export const isOwnKeyOf = <T extends object>(obj: T, key: PropertyKey): key is keyof T => {
        if (!obj) return false;
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    export const getKeyValue = <T extends object, K extends keyof T>(obj: T, key: K): T[K] => {
        return obj[key];
    }

    // Overloaded primitive type expectation helper
    export const expectType = (function() {
        function expectType<T extends object, K extends string>(obj: T, key: K, kind: 'string'): asserts obj is T & Record<K, string>;
        function expectType<T extends object, K extends string>(obj: T, key: K, kind: 'number'): asserts obj is T & Record<K, number>;
        function expectType<T extends object, K extends string>(obj: T, key: K, kind: 'boolean'): asserts obj is T & Record<K, boolean>;
        function expectType(obj: object, key: string, kind: 'string' | 'number' | 'boolean') {
            if (!obj || !(key in obj)) {
                throw new Error(`Missing property "${key}"`);
            }
            const v = Reflect.get(obj, key);
            if (typeof v !== kind || (kind === 'number' && !Number.isFinite(v))) {
                throw new Error(`Expected "${key}" to be ${kind}, got ${typeof v}`);
            }
        }
        return expectType;
    })();
// ---- end of necessary inline typing ----

export const missing: Types.Missing = (x) => {
    return x === undefined;
};

export const exists: Types.Exists = (x) => {
    return !missing(x);
};

export const getKeys: Types.GetKeys = (obj) => {
    if (isNil(obj)) {
        // never[] is assignable to Array<Extract<keyof typeof obj,string>>
        return [] as never[];
    }
    return Object.keys(obj) as Array<Extract<keyof typeof obj, string>>;
};

export const Rify: Types.Rify = (obj, first = true) => {
    let result = '';

    const scalarIsNumeric = (x: unknown): boolean => {
        return !/^(NaN|-?Infinity)$/.test(String(Number(x)));
    };

    if (obj === null) {
        result += 'c()';
    } else if (Array.isArray(obj)) {
        if (obj.length > 1) result += 'c(';
        const objnum = obj.length > 0 ? scalarIsNumeric(obj[0]) : false;
        result += (objnum ? '' : '"');
        result += obj.join((objnum ? ', ' : '", "'));
        result += (objnum ? '' : '"');
        if (obj.length > 1) result += ')';
    } else if (typeof obj === 'object') {
        result += first ? '' : 'list(';
        const keys = getKeys(obj as Record<string, unknown>);
        if (keys.length > 0) {
            for (let i = 0; i < keys.length; i++) {
                result += keys[i] + ' = ';
                result += Rify((obj as Record<string, unknown>)[keys[i]], false);
                if (i < keys.length - 1) result += ', ';
            }
        } else {
            result += 'x = ""';
        }
        result += first ? '' : ')';
    } else {
        result += scalarIsNumeric(obj) ? String(obj) : (`"${String(obj)}"`);
    }

    return result.replace('false', 'FALSE').replace('true', 'TRUE');
};
// export const getKeys: Types.GetKeys = function(obj) {
//     if (obj === null) return([]);
//     return Object.keys(obj);
// };

export const isNumeric: Types.IsNumeric = (x) => {
    // True only for finite number primitives or boxed Number objects.
    if (typeof x === 'number') {
        return Number.isFinite(x);
    }

    // Accept boxed numbers, ex. let x = new Number(5);
    if (Object.prototype.toString.call(x) === '[object Number]') {
        try {
            const n = (x as unknown as Number).valueOf() as unknown as number;
            return Number.isFinite(n);
        } catch {
            return false;
        }
    }

    return false;
};

export const possibleNumeric: Types.PossibleNumeric = (x) => {
    // Return true only for full-string finite decimal numeric literals (optionally scientific notation)
    // Allowed examples: 42, '42', '  -3.14  ', '+1.0', '1e3', '-2.5E-2', '.5', '5.'
    // Disallowed examples: '5x', '3.2abc', '', 'Infinity', Infinity, true/false, null/undefined, '0x10', '0b1010', '0o77'

    // The global isFinite() is different from Number.isFinite();
    // it first coerces to number, for instance '42' -> 42
    // but here asNumeric() attempts this very coercion, minus the edge cases.
    return isFinite(asNumeric(x));
};

export const possibleInteger: Types.PossibleInteger = (x) => {
    // True if x is an integer-valued numeric under strict decimal/scientific parsing.
    // Accepts: 3, 3.0, '3', '3.0', '1e3', '+0', '-0', '.0'
    // Rejects: '3.5', '5x', '', 'Infinity', Infinity, NaN, booleans, null/undefined, '0x10', '0b10', '0o7'
    return Number.isInteger(asNumeric(x));
};

export const asNumeric: Types.AsNumeric = (x) => {
    if (isNil(x)) {
        return NaN;
    }

    if (typeof x === 'number') {
        return Number.isFinite(x) ? x : NaN;
    }

    if (Object.prototype.toString.call(x) === '[object Number]') {
        // boxed numbers, ex. let x = new Number(3);
        try {
            const n = (x as unknown as Number).valueOf() as unknown as number;
            return Number.isFinite(n) ? n : NaN;
        } catch {
            return NaN;
        }
    }

    if (typeof x === 'string') {
        const s = x.trim();
        if (s.length === 0) {
            return NaN;
        }

        if (!DECIMAL_REGEX.test(s)) {
            return NaN;
        }

        const n = Number(s);
        return Number.isFinite(n) ? n : NaN;
    }

    return NaN;
};

export const asInteger: Types.AsInteger = (x) => {
    if (isNil(x)) {
        return NaN;
    }

    if (typeof x === 'number') {
        return Number.isFinite(x) ? Math.trunc(x) : NaN;
    }

    if (Object.prototype.toString.call(x) === '[object Number]') {
        try {
            const n = (x as unknown as Number).valueOf() as unknown as number;
            return Number.isFinite(n) ? Math.trunc(n) : NaN;
        } catch {
            return NaN;
        }
    }

    if (typeof x === 'string') {
        const s = x.trim();
        if (s.length === 0) {
            return NaN;
        }

        // If strict integer, parse directly; else if valid decimal numeric, truncate; else NaN
    }

    return NaN;
};

export const ensureNumber: Types.EnsureNumber = (x, fallback) => {
    return possibleNumeric(x) ? asNumeric(x) : fallback;
};

export const asBoolean: Types.AsBoolean = (x, fallback = false) => {
    if (isTrue(x)) return true;
    if (isFalse(x)) return false;
    return fallback;
};

export const asText: Types.AsText = (x, fallback = '') => {
    if (x === undefined || x === null) return fallback;
    return String(x);
};

export const asStringArray: Types.AsStringArray = (x) => {
    if (Array.isArray(x)) return x.map((item) => String(item));
    return asText(x, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

export const asObjectArray: Types.AsObjectArray = (x) => {
    if (!Array.isArray(x)) return [];
    return x.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
};

export const cloneJSON: Types.CloneJSON = <T>(x: T): T => {
    return JSON.parse(JSON.stringify(x));
};

export const isTrue: Types.IsTrue = (x) => {
    if (isNil(x)) {
        return false;
    }
    // return (x === true || (typeof x === 'string' && (x === 'true' || x === 'True')));
    if (typeof x === 'boolean') return x === true;
    if (typeof x === 'number') return x === 1;
    if (typeof x === 'string') {
        const s = x.trim().toLowerCase();
        if (TRUE_SET.has(s)) return true;
        if (FALSE_SET.has(s)) return false; // explicit false tokens remain false
    }
    return false;
};

export const isFalse: Types.IsFalse = (x) => {
    if (isNil(x)) {
        return false;
    }
    if (typeof x === 'boolean') return x === false;
    if (typeof x === 'number') return x === 0;
    if (typeof x === 'string') {
        const s = x.trim().toLowerCase();
        if (FALSE_SET.has(s)) return true;
        if (TRUE_SET.has(s)) return false; // explicit true tokens remain false
    }
    return false;
};

export const capitalize: Types.Capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const isElementOf: Types.IsElementOf = (x, set) => {
    if (isNil(x) || isNil(set) || set.length === 0) {
        return false;
    }
    return set.includes(x);
};

export const isNotElementOf: Types.IsNotElementOf = (x, set) => {
    if (isNil(x) || isNil(set) || set.length === 0) {
        return false;
    }
    return !set.includes(x);
};

export const isValidColor: Types.IsValidColor = (value) => {
    const x = new Option().style;
    x.color = value;
    return x.color !== '';
};

export const isIdentifier: Types.IsIdentifier = (text) => {
    // Returns true if (and only if) the string is a valid, non-reserved simple JavaScript identifier
    // under a narrow ASCII rule set (letters, digits, _, $) that does NOT start with a digit.
    // Otherwise false.

    if (typeof text !== 'string' || text.length === 0) {
        return false;
    }

    if (!/^[A-Za-z_$][\w$]*$/.test(text)) {
        return false;
    }

    // Exclude ECMAScript reserved words and literals.
    const RESERVED = new Set<string>([
        // Strict + future + contextual (conservative superset)
        'break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends',
        'false','finally','for','function','if','import','in','instanceof','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','let','static','implements','interface','package','private','protected','public','await','arguments','eval','of','from','as'
    ]);

    if (RESERVED.has(text.toLowerCase())) {
        return false;
    }

    return true;
};

export const textWidth: Types.TextWidth = (text, fontSize, fontFamily?) => {
    const t = String(text ?? '');
    if (t.length === 0) return 0;

    const size = Number(fontSize) || 12;

    // Resolve a usable font-family string
    let family = (fontFamily && String(fontFamily).trim().length) ? String(fontFamily) : '';

    if (
        !family &&    // same thing as family === '' because '' is falsy
        typeof window !== 'undefined' &&
        typeof getComputedStyle === 'function'
    ) {
        family = getComputedStyle(document.body || document.documentElement).fontFamily || '';
    }

    // Default app font-family (Inter stack) if nothing else found
    if (!family) { // same thing as if (family === '') because '' is falsy
        family = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', 'Liberation Sans', sans-serif";
    }

    // Quote family names with spaces that are not already quoted
    const familyNormalized = family
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(name => (/^['"]/ .test(name) || !/\s/.test(name)) ? name : `"${name}"`)
        .join(', ');

    // Prefer OffscreenCanvas if available (no layout required)
    const Offscreen = globalThis.OffscreenCanvas;
    if (Offscreen && typeof Offscreen === 'function') {
        const off = new Offscreen(0, 0);
        const ctx = off.getContext('2d');
        if (ctx && typeof ctx.measureText === 'function') {
            ctx.font = `${size}px ${familyNormalized}`;
            const metrics = ctx.measureText(t);
            return Math.ceil(metrics.width);
        }
    }

    // Fallback to a hidden canvas element in the DOM
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.font = `${size}px ${familyNormalized}`;
            const metrics = ctx.measureText(t);
            return Math.ceil(metrics.width);
        }
    }

    // Final fallback approximation: average character width ≈ 0.6 * fontSize
    return Math.ceil(t.length * size * 0.6);
};

export const parseJSON: Types.ParseJSON = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

export const makeCheckbox: Types.Checkbox = (isMissing) => {
    const customCheckbox = document.createElement('div');
    customCheckbox.className = 'custom-checkbox ds-labels-table__checkbox';
    customCheckbox.setAttribute('role', 'checkbox');
    customCheckbox.tabIndex = 0;
    customCheckbox.setAttribute('aria-checked', isMissing ? 'true' : 'false');
    customCheckbox.dataset.fill = 'true';
    customCheckbox.style.setProperty('--active-color', '#7bb798');
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.overflow = 'visible';
    svg.style.position = 'absolute';
    svg.style.top = '-2px';
    svg.style.left = '-1px';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M17 45 L45 80 L92 -15');
    path.setAttribute('stroke', 'black');
    path.setAttribute('fill', 'none');
    path.setAttribute('class', 'tick-mark');
    svg.appendChild(path);
    customCheckbox.appendChild(svg);
    return customCheckbox;
}

export const sanitizeFilename: Types.SanitizeFilename = (name) => name.replace(/[<>:"/\\|?*\u0000]/g, '_');

export const getExtension: Types.GetExtension = (filePath) => {
    return path.extname(filePath).replace(/^\./, '').toLowerCase();
};

export const isSupportedFile: Types.IsSupportedFile = (filePath, extensions) => {
    return isElementOf(getExtension(filePath), extensions);
};

export const ensureDropDir: Types.EnsureDropDir = async (dir) => {
    try {
        await fs.promises.mkdir(dir, { recursive: true });
    } catch {}
}

export const writeDroppedFile: Types.WriteDroppedFile = async (dir, filename, data) => {
    await ensureDropDir(dir);
    const cleanName = sanitizeFilename(filename) || 'dropped-file';
    const dropPath = path.join(dir, cleanName);
    // Overwrite any previous temp file with the same name
    await fs.promises.writeFile(dropPath, data);
    return dropPath;
};

export const writeDiagnosticFile: Types.WriteDiagnosticFile = async (dir, filename, text) => {
    await ensureDropDir(dir);
    const timestamp = Date.now();
    const cleanLabel = sanitizeFilename(filename) || `output-${timestamp}`;
    const dumpPath = path.join(dir, `${timestamp}-${cleanLabel}.json`);
    await fs.promises.writeFile(dumpPath, text, 'utf8');
    // console.log('Saved output to', dumpPath);
    return dumpPath;
};

// Persist and restore window size
export const readWindowBounds: Types.WindowBounds = () => {
    try {
        const settings = getSettingsStore();
        if (!settings || typeof settings.get !== 'function') return null;
        const value = settings.get('windowBounds');
        const bounds = isRecord(value) ? value : {};
        const w = Number(bounds.width) || 0;
        const h = Number(bounds.height) || 0;
        if (w > 400 && h > 300) return { width: w, height: h };
    } catch {}
    return null;
}

export const saveWindowBounds = (win: WindowBoundsLike | null) => {
    if (!win) return;
    try {
        const settings = getSettingsStore();
        if (!settings || typeof settings.set !== 'function') return;
        const { width, height } = win.getBounds();
        settings.set('windowBounds', { width, height });
    } catch {}
}
