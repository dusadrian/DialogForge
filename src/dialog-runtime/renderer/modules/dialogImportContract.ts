import { DialogCreatorSchema } from './dialog.types';

export const DIALOGCREATOR_CONTRACT_VERSION = '2026-03-01';
export const DIALOGCREATOR_SCHEMA_VERSIONS = Object.freeze(['1']);

export const DIALOGCREATOR_SUPPORTED_ELEMENTS = Object.freeze([
  'Button',
  'Checkbox',
  'Choice',
  'Container',
  'Counter',
  'Group',
  'Input',
  'Label',
  'Plot',
  'Radio',
  'Select',
  'Separator',
  'Slider'
]);

const SUPPORTED_SET = new Set(DIALOGCREATOR_SUPPORTED_ELEMENTS.map((x) => x.toLowerCase()));

type ContractReport = {
  errors: string[];
  warnings: string[];
};

function isFiniteNumberLike(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n);
}

export function validateDialogCreatorContract(dialog: DialogCreatorSchema): ContractReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const schemaVersion = String(dialog.meta?.schemaVersion || '').trim();
  if (!schemaVersion) {
    warnings.push(
      `meta.schemaVersion is missing; treating payload as a compatibility import. ` +
      `Supported explicit versions: ${DIALOGCREATOR_SCHEMA_VERSIONS.join(', ')}.`
    );
  } else if (!DIALOGCREATOR_SCHEMA_VERSIONS.includes(schemaVersion)) {
    errors.push(
      `Unsupported meta.schemaVersion '${schemaVersion}'. ` +
      `Supported versions: ${DIALOGCREATOR_SCHEMA_VERSIONS.join(', ')}.`
    );
  }

  if (!isFiniteNumberLike(dialog.properties.width)) {
    errors.push('properties.width must be numeric.');
  }
  if (!isFiniteNumberLike(dialog.properties.height)) {
    errors.push('properties.height must be numeric.');
  }

  if (!Array.isArray(dialog.elements) || dialog.elements.length === 0) {
    warnings.push('Dialog has no elements.');
    return { errors, warnings };
  }

  const idToName = new Map<string, string>();

  dialog.elements.forEach((el, index) => {
    const type = String(el.type || '').trim();
    const lower = type.toLowerCase();
    const nameid = String(el.nameid || '').trim();

    if (!SUPPORTED_SET.has(lower)) {
      errors.push(`Unsupported element type '${type}' at index ${index}.`);
    }

    if (!nameid) {
      errors.push(`Element at index ${index} has empty nameid.`);
    }

    const id = String(el.id || '').trim();
    if (!id) {
      warnings.push(`Element '${nameid || `#${index}`}' has no id. Group membership references may fail.`);
    } else if (!idToName.has(id)) {
      idToName.set(id, nameid || id);
    }

    if (lower === 'group') {
      const groupRefs = Array.isArray(el.elementIds)
        ? el.elementIds.map((x) => String(x).trim()).filter(Boolean)
        : String(el.elementIds || '').split(',').map((x) => x.trim()).filter(Boolean);

      if (groupRefs.length === 0) {
        warnings.push(`Group '${nameid || id || `#${index}`}' has no elementIds.`);
      }
    }

  });

  dialog.elements.forEach((el, index) => {
    const type = String(el.type || '').trim().toLowerCase();
    if (type !== 'group') return;

    const groupName = String(el.nameid || el.id || `#${index}`);
    const refs = Array.isArray(el.elementIds)
      ? el.elementIds.map((x) => String(x).trim()).filter(Boolean)
      : String(el.elementIds || '').split(',').map((x) => x.trim()).filter(Boolean);

    refs.forEach((ref) => {
      if (!idToName.has(ref)) {
        warnings.push(`Group '${groupName}' references unknown element id '${ref}'.`);
      }
    });
  });

  return { errors, warnings };
}

export function formatContractErrors(report: ContractReport): string {
  const parts: string[] = [];
  if (report.errors.length) {
    parts.push(report.errors.join(' '));
  }
  if (report.warnings.length) {
    parts.push(`Warnings: ${report.warnings.join(' ')}`);
  }
  return parts.join(' ').trim();
}
