export type Missing = (x: unknown) => boolean;
export type Exists = (x: unknown) => boolean;

export type GetKeys = <T extends object>(
    obj: T | null | undefined
) => Array<Extract<keyof T, string>>;
export type Rify = (obj: unknown, first?: boolean) => string;

// --------------------
// Numbers
// --------------------
export type IsNumeric = (x: unknown) => boolean;
export type PossibleNumeric = (x: unknown) => boolean;
export type PossibleInteger = (x: unknown) => boolean;

export type AsNumeric = (x: unknown) => number;
export type AsInteger = (x: unknown) => number;

export type EnsureNumber = (x: unknown, fallback: number) => number;

// --------------------
// Booleans / missingness
// --------------------
export type AsBoolean = (x: unknown, fallback?: boolean) => boolean;
export type IsTrue = (x: unknown) => boolean;
export type IsFalse = (x: unknown) => boolean;

// --------------------
// Strings / sets / misc
// --------------------
export type AsText = (x: unknown, fallback?: string) => string;
export type AsStringArray = (x: unknown) => string[];
export type AsObjectArray = (x: unknown) => Record<string, unknown>[];
export type CloneJSON = <T>(x: T) => T;
export type Capitalize = (str: string) => string;

export type IsElementOf = <T>(x: T, set: T[]) => boolean;
export type IsNotElementOf = <T>(x: T, set: T[]) => boolean;

export type IsValidColor = (value: string) => boolean;
export type IsIdentifier = (text: string) => boolean;

export type TextWidth = (text: string, fontSize: number, fontFamily?: string) => number;
export type ParseJSON = (text: string) => unknown;

// --------------------
// DOM
// --------------------
type VoidPromise = Promise<void>;
export type Checkbox = (isMissing: boolean) => HTMLDivElement;
export type SanitizeFilename = (name: string) => string;
export type GetExtension = (filePath: string) => string;
export type IsSupportedFile = (filePath: string, extensions: string[]) => boolean;
export type EnsureDropDir = (dir: string) => VoidPromise;
export type WriteDroppedFile = (dir: string, filename: string, data: Buffer) => Promise<string>;
export type WriteDiagnosticFile = (dir: string, filename: string, text: string) => Promise<string>;
export type WindowBounds = () => { width: number; height: number; } | null;
