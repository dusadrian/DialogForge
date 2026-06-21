export interface DialogCreatorProperties {
  name: string;
  title: string;
  width: string | number;
  height: string | number;
  fontSize?: string | number;
  dependencies?: string;
  language?: string;
  background?: string;
}

export interface DialogCreatorSyntax {
  command?: string;
  defaultElements?: Record<string, unknown> | unknown[];
}

export interface DialogCreatorMeta {
  schemaVersion?: string;
  producer?: string;
  producerVersion?: string;
  exportedAt?: string;
}

export interface DialogCreatorElement {
  id?: string;
  type: string;
  nameid: string;
  [key: string]: unknown;
}

export interface DialogCreatorSchema {
  id?: string;
  properties: DialogCreatorProperties;
  meta?: DialogCreatorMeta;
  syntax?: DialogCreatorSyntax;
  customJS?: string;
  __localizedMessages?: Record<string, unknown>;
  __baseMessages?: Record<string, unknown>;
  elements: DialogCreatorElement[];
}

export type RuntimeElementSpec = Record<string, unknown>;

export interface RuntimeDialogSchema {
  properties: {
    name: string;
    title: string;
    width: number | string;
    height: number | string;
    fontSize?: number | string;
    background?: string;
    dependencies: string;
  };
  syntax: {
    command: string;
    defaultElements: Record<string, unknown>;
  };
  elements: Record<string, RuntimeElementSpec>;
  customJS?: string;
  messages?: Record<string, string>;
  defaultMessages?: Record<string, string>;
}

export function isRuntimeDialogSchema(value: unknown): value is RuntimeDialogSchema {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const properties = candidate.properties;
  const syntax = candidate.syntax;
  const elements = candidate.elements;

  return !!properties
    && typeof properties === 'object'
    && !Array.isArray(properties)
    && !!syntax
    && typeof syntax === 'object'
    && !Array.isArray(syntax)
    && !!elements
    && typeof elements === 'object'
    && !Array.isArray(elements);
}
