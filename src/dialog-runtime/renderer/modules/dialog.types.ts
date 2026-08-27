import type {
  RPackageRequirement
} from '../../../core/contracts/applicationComposition';


export interface DialogCreatorProperties {
  name: string;
  title: string;
  width: string | number;
  height: string | number;
  fontSize?: string | number;
  dependencies?: string;
  rPackageRequirements?: RPackageRequirement[];
  language?: string;
  background?: string;
  // When true the dialog window may be resized past its authored size, which
  // stays the minimum. Elements marked resizeWithDialog absorb the growth.
  resizable?: boolean | string;
  // Keep a resizable native dialog at its authored width-to-height ratio.
  preserveAspectRatio?: boolean | string;
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
    rPackageRequirements?: RPackageRequirement[];
    resizable?: boolean;
    preserveAspectRatio?: boolean;
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
