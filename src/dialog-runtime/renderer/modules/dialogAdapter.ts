import { DialogCreatorElement, DialogCreatorSchema, RuntimeDialogSchema } from './dialog.types';
import defaultSettings from '../library/defaultSettings';
import {
  DIALOGCREATOR_SUPPORTED_ELEMENTS,
  formatContractErrors,
  validateDialogCreatorContract
} from './dialogImportContract';

const RUNTIME_SUPPORTED_TYPES = new Set(DIALOGCREATOR_SUPPORTED_ELEMENTS.map((x) => x.toLowerCase()));

const NON_RUNTIME_TYPES = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toStringOr(value: unknown, fallback: string): string {
  const out = String(value ?? '').trim();
  return out.length > 0 ? out : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolString(value: unknown, fallback: boolean): 'true' | 'false' {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return 'true';
    if (v === 'false' || v === '0') return 'false';
  }
  if (typeof value === 'number') {
    if (value === 1) return 'true';
    if (value === 0) return 'false';
  }
  return fallback ? 'true' : 'false';
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function toDirection(value: unknown): 'x' | 'y' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'y' || raw === 'vertical') return 'y';
  return 'x';
}

function toDelimitedList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x).trim())
      .filter(Boolean)
      .join(',');
  }
  return String(value ?? '')
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(',');
}

function assertCreatorShape(dialog: unknown): asserts dialog is DialogCreatorSchema {
  if (!isRecord(dialog)) {
    throw new Error('Dialog payload must be an object.');
  }

  if (!isRecord(dialog.properties)) {
    throw new Error('Dialog properties are missing.');
  }

  const name = String(dialog.properties.name ?? '').trim();
  const title = String(dialog.properties.title ?? '').trim();
  if (!name || !title) {
    throw new Error('Dialog properties.name and properties.title are required.');
  }

  if (!Array.isArray(dialog.elements)) {
    throw new Error('Dialog elements must be an array.');
  }

  const seen = new Set<string>();
  dialog.elements.forEach((el, index) => {
    if (!isRecord(el)) {
      throw new Error(`Dialog element at index ${index} is invalid.`);
    }

    const type = String(el.type ?? '').trim();
    const nameid = String(el.nameid ?? '').trim();

    if (!type || !nameid) {
      throw new Error(`Dialog element at index ${index} must include type and nameid.`);
    }

    const key = nameid.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate element nameid '${nameid}'.`);
    }
    seen.add(key);
  });
}

function mapButton(el: DialogCreatorElement): Record<string, unknown> {
  return {
    ...defaultSettings.button,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    label: toStringOr(el.label, String(defaultSettings.button.label)),
    icon: toStringOr(el.icon, defaultSettings.button.icon),
    iconSize: toNumber(el.iconSize, defaultSettings.button.iconSize),
    width: toNumber(el.width, 100),
    height: toNumber(el.height, defaultSettings.button.height),
    lineClamp: toNumber(el.lineClamp, 1),
    color: toStringOr(el.color, '#efefef'),
    fontColor: toStringOr(el.fontColor, '#000000'),
    borderColor: toStringOr(el.borderColor, '#939393'),
    left: String(el.left ?? defaultSettings.button.left),
    top: String(el.top ?? defaultSettings.button.top),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    onClick: String(el.onClick ?? ''),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapCheckbox(el: DialogCreatorElement): Record<string, unknown> {
  return {
    ...defaultSettings.checkbox,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    // DialogCreator frequently renders checkbox text via a separate Label element.
    // Do not force a fallback label that was never in source JSON.
    label: toStringOr(el.label, ''),
    left: String(el.left ?? defaultSettings.checkbox.left),
    top: String(el.top ?? defaultSettings.checkbox.top),
    size: toNumber(el.size, defaultSettings.checkbox.size ?? 14),
    fill: toBoolString(el.fill, true),
    color: toStringOr(el.color, defaultSettings.checkbox.color || '#70a470'),
    borderColor: toStringOr(el.borderColor, defaultSettings.checkbox.borderColor || '#8c8c8c'),
    disabledColor: toStringOr(el.disabledColor, defaultSettings.checkbox.disabledColor),
    isChecked: toBoolString(el.isChecked, false),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapContainer(el: DialogCreatorElement): Record<string, unknown> {
  const name = String(el.nameid || '').trim();

  return {
    ...defaultSettings.container,
    parentId: toStringOr(el.id, String(el.nameid)),
    type: 'Container',
    name,
    width: toNumber(el.width, defaultSettings.container.width),
    height: toNumber(el.height, defaultSettings.container.height),
    selection: toStringOr(el.selection, defaultSettings.container.selection || 'single'),
    variableType: toStringOr(el.variableType ?? el.itemType, defaultSettings.container.variableType),
    parentContainer: toStringOr(el.parentContainer, defaultSettings.container.parentContainer),
    backgroundColor: toStringOr(el.backgroundColor, defaultSettings.container.backgroundColor || '#ffffff'),
    fontColor: toStringOr(el.fontColor, defaultSettings.container.fontColor || '#000000'),
    activeBackgroundColor: toStringOr(el.activeBackgroundColor, defaultSettings.container.activeBackgroundColor || '#589658'),
    activeFontColor: toStringOr(el.activeFontColor, defaultSettings.container.activeFontColor || '#ffffff'),
    disabledColor: toStringOr(el.disabledColor, defaultSettings.container.disabledColor),
    borderColor: toStringOr(el.borderColor, defaultSettings.container.borderColor || '#b8b8b8'),
    itemOrder: toBoolString(el.itemOrder, false),
    pinontop: toBoolString(el.pinontop, false),
    left: String(el.left ?? defaultSettings.container.left),
    top: String(el.top ?? defaultSettings.container.top),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapCounter(el: DialogCreatorElement): Record<string, unknown> {
  return {
    ...defaultSettings.counter,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    minval: toNumber(el.minval, defaultSettings.counter.minval),
    startval: toNumber(el.startval, defaultSettings.counter.startval),
    maxval: toNumber(el.maxval, defaultSettings.counter.maxval),
    width: toNumber(el.width, defaultSettings.counter.width),
    space: toNumber(el.space, defaultSettings.counter.space),
    color: toStringOr(el.color, defaultSettings.counter.color),
    borderColor: toStringOr(el.borderColor, defaultSettings.counter.borderColor || '#8c8c8c'),
    disabledColor: toStringOr(el.disabledColor, '#dedede'),
    updownsize: toNumber(el.updownsize, defaultSettings.counter.updownsize),
    left: String(el.left ?? defaultSettings.counter.left),
    top: String(el.top ?? defaultSettings.counter.top),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapInput(el: DialogCreatorElement): Record<string, unknown> {
  return {
    ...defaultSettings.input,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    width: toNumber(el.width, defaultSettings.input.width),
    height: toNumber(el.height, defaultSettings.input.height),
    left: String(el.left ?? defaultSettings.input.left),
    top: String(el.top ?? defaultSettings.input.top),
    borderColor: toStringOr(el.borderColor, defaultSettings.input.borderColor || '#8c8c8c'),
    disabledColor: toStringOr(el.disabledColor, defaultSettings.input.disabledColor),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    value: String(el.value ?? ''),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapLabel(el: DialogCreatorElement): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    ...defaultSettings.label,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    text: toStringOr(el.value ?? el.text, String(defaultSettings.label.text)),
    baseText: toStringOr(el.__baseValue ?? el.baseValue ?? el.value ?? el.text, defaultSettings.label.text),
    icon: toStringOr(el.icon, defaultSettings.label.icon),
    iconSize: toNumber(el.iconSize, defaultSettings.label.iconSize),
    left: String(el.left ?? defaultSettings.label.left),
    top: String(el.top ?? defaultSettings.label.top),
    maxWidth: toNumber(el.maxWidth, 200),
    lineClamp: toNumber(el.lineClamp, 1),
    align: toStringOr(el.align, 'left'),
    valign: toStringOr(el.valign, String(defaultSettings.label.valign)),
    rotate: [0, 90, 180, 270].includes(toNumber(el.rotate, 0)) ? toNumber(el.rotate, 0) : 0,
    fontWeight: toStringOr(el.fontWeight, defaultSettings.label.fontWeight),
    fontColor: toStringOr(el.fontColor, '#000000'),
    isVisible: toBoolString(el.isVisible, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
  if (el.fontSize !== undefined && el.fontSize !== null && String(el.fontSize).trim() !== '') {
    mapped.fontSize = toNumber(el.fontSize, defaultSettings.label.fontSize);
  } else {
    delete mapped.fontSize;
  }
  return mapped;
}

function mapPlot(el: DialogCreatorElement): Record<string, unknown> {
  return {
    ...defaultSettings.plot,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    width: toNumber(el.width, defaultSettings.plot.width),
    height: toNumber(el.height, defaultSettings.plot.height),
    left: String(el.left ?? defaultSettings.plot.left),
    top: String(el.top ?? defaultSettings.plot.top),
    backgroundColor: toStringOr(el.backgroundColor, defaultSettings.plot.backgroundColor || '#ffffff'),
    borderColor: toStringOr(el.borderColor, defaultSettings.plot.borderColor || '#c9c9c9'),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapRadio(el: DialogCreatorElement): Record<string, unknown> {
  return {
    ...defaultSettings.radio,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    label: toStringOr(el.label, ''),
    radioGroup: toStringOr(el.group ?? el.radioGroup, String(defaultSettings.radio.radioGroup)),
    left: String(el.left ?? defaultSettings.radio.left),
    top: String(el.top ?? defaultSettings.radio.top),
    size: toNumber(el.size, defaultSettings.radio.size),
    color: toStringOr(el.color, defaultSettings.radio.color),
    disabledColor: toStringOr(el.disabledColor, defaultSettings.radio.disabledColor),
    isSelected: toBoolString(el.isSelected, false),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapSelect(el: DialogCreatorElement): Record<string, unknown> {
  const dataValue = toStringOr(el.dataValue ?? el.value, String(defaultSettings.select.dataValue));

  return {
    ...defaultSettings.select,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    width: toNumber(el.width, defaultSettings.select.width),
    label: toStringOr(el.label, ''),
    value: toStringOr(el.value, ''),
    left: String(el.left ?? defaultSettings.select.left),
    top: String(el.top ?? defaultSettings.select.top),
    arrowColor: toStringOr(el.arrowColor, defaultSettings.select.arrowColor),
    disabledColor: toStringOr(el.disabledColor, defaultSettings.select.disabledColor),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    dataSource: toStringOr(el.dataSource, 'custom'),
    dataValue,
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapChoice(el: DialogCreatorElement): Record<string, unknown> {
  const items = toDelimitedList(el.items ?? el.value);
  const rawOrdering = String(el.ordering ?? defaultSettings.choice.ordering ?? 'no').trim().toLowerCase();
  const ordering = rawOrdering === 'true'
    ? 'decreasing'
    : (rawOrdering === 'false' || rawOrdering === '' ? 'no' : rawOrdering);
  const rawSelection = String(el.selection ?? defaultSettings.choice.selection).trim().toLowerCase();
  const selection = rawSelection === 'single-radio' || rawSelection === 'single_forced' || rawSelection === 'radio'
    ? 'single-radio'
    : (rawSelection === 'single' ? 'single' : 'multiple');
  const orientationRaw = String(el.orientation ?? defaultSettings.choice.orientation ?? 'vertical').trim().toLowerCase();
  const orientation = orientationRaw === 'horizontal' ? 'horizontal' : 'vertical';
  return {
    ...defaultSettings.choice,
    parentId: toStringOr(el.id, String(el.nameid)),
    type: 'Choice',
    name: String(el.nameid),
    left: String(el.left ?? defaultSettings.choice.left),
    top: String(el.top ?? defaultSettings.choice.top),
    width: toNumber(el.width, defaultSettings.choice.width),
    height: toNumber(el.height, defaultSettings.choice.height),
    items,
    backgroundColor: toStringOr(el.backgroundColor, String(defaultSettings.choice.backgroundColor || '#ffffff')),
    fontColor: toStringOr(el.fontColor, String(defaultSettings.choice.fontColor || '#000000')),
    sortable: toBoolString(el.sortable, true),
    ordering,
    selection,
    orientation,
    align: toStringOr(el.align, String(defaultSettings.choice.align)),
    activeBackgroundColor: toStringOr(el.activeBackgroundColor, String(defaultSettings.choice.activeBackgroundColor || '#e6f1e6')),
    activeFontColor: toStringOr(el.activeFontColor, String(defaultSettings.choice.activeFontColor || '#000000')),
    borderColor: toStringOr(el.borderColor, String(defaultSettings.choice.borderColor || '#b8b8b8')),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapGroup(el: DialogCreatorElement, groupedNames: string[]): Record<string, unknown> {
  return {
    ...defaultSettings.group,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: groupedNames,
    conditions: toStringOr(el.conditions, '')
  };
}

function mapSeparator(el: DialogCreatorElement): Record<string, unknown> {
  const direction = toDirection(el.direction);
  const length = direction === 'x'
    ? toNumber(el.length ?? el.width, defaultSettings.separator.length)
    : toNumber(el.length ?? el.height, defaultSettings.separator.length);
  const width = toNumber(el.width, direction === 'x' ? length : defaultSettings.separator.height);
  const height = toNumber(el.height, direction === 'x' ? defaultSettings.separator.height : length);

  return {
    ...defaultSettings.separator,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    direction,
    color: toStringOr(el.color, defaultSettings.separator.color),
    width,
    height,
    left: String(el.left ?? defaultSettings.separator.left),
    top: String(el.top ?? defaultSettings.separator.top),
    length,
    isVisible: toBoolString(el.isVisible, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

function mapSlider(el: DialogCreatorElement): Record<string, unknown> {
  const length = toNumber(el.length ?? el.width, defaultSettings.slider.length);
  const value = typeof el.value === 'number'
    ? el.value
    : toNumber(el.handlepos, Number(defaultSettings.slider.value) * 100) / 100;
  const directionRaw = String(el.direction ?? defaultSettings.slider.direction).trim().toLowerCase();
  const direction = directionRaw === 'vertical' || directionRaw === 'y' ? 'vertical' : 'horizontal';

  return {
    ...defaultSettings.slider,
    parentId: toStringOr(el.id, String(el.nameid)),
    name: String(el.nameid),
    left: String(el.left ?? defaultSettings.slider.left),
    top: String(el.top ?? defaultSettings.slider.top),
    value: Math.max(0, Math.min(1, Number(value))),
    length,
    width: toNumber(el.width, Number(defaultSettings.slider.width ?? length)),
    height: toNumber(el.height, Number(defaultSettings.slider.height ?? 8)),
    direction,
    color: toStringOr(el.color, defaultSettings.slider.color),
    handleshape: toStringOr(el.handleshape, defaultSettings.slider.handleshape),
    handleColor: toStringOr(el.handleColor, defaultSettings.slider.handleColor),
    handlesize: toNumber(el.handlesize, defaultSettings.slider.handlesize),
    isVisible: toBoolString(el.isVisible, true),
    isEnabled: toBoolString(el.isEnabled, true),
    elementIds: toArray(el.elementIds),
    conditions: toStringOr(el.conditions, '')
  };
}

const mapperByType: Record<string, (el: DialogCreatorElement) => Record<string, unknown>> = {
  button: mapButton,
  checkbox: mapCheckbox,
  choice: mapChoice,
  container: mapContainer,
  counter: mapCounter,
  input: mapInput,
  label: mapLabel,
  plot: mapPlot,
  radio: mapRadio,
  select: mapSelect,
  separator: mapSeparator,
  slider: mapSlider
};

export function parseNewDialogJson(raw: string): DialogCreatorSchema {
  const parsed = JSON.parse(raw);
  assertCreatorShape(parsed);
  const report = validateDialogCreatorContract(parsed);
  if (report.errors.length) {
    throw new Error(formatContractErrors(report));
  }
  return parsed;
}

export function normalizeNewDialogForRuntime(source: DialogCreatorSchema): RuntimeDialogSchema {
  const runtimeElements: Record<string, Record<string, unknown>> = {};
  const namesById = new Map<string, string>();
  const localizedMessages = isRecord(source.__localizedMessages)
    ? Object.fromEntries(
      Object.entries(source.__localizedMessages)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [String(key), String(value)])
    )
    : {};
  const defaultMessages = isRecord(source.__baseMessages)
    ? Object.fromEntries(
      Object.entries(source.__baseMessages)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [String(key), String(value)])
    )
    : {};

  source.elements.forEach((rawElement) => {
    const id = String(rawElement.id || '').trim();
    const name = String(rawElement.nameid || '').trim();
    if (id && name) namesById.set(id, name);
  });

  source.elements.forEach((rawElement, index) => {
    const type = String(rawElement.type || '').trim().toLowerCase();
    const name = String(rawElement.nameid || '').trim();

    if (!type || !name) return;

    if (NON_RUNTIME_TYPES.has(type)) {
      if (type === 'group') return;
      throw new Error(`Element type '${rawElement.type}' is not supported by the dialog runtime.`);
    }

    if (!RUNTIME_SUPPORTED_TYPES.has(type)) {
      throw new Error(`Unknown element type '${rawElement.type}'.`);
    }

    let mapped: Record<string, unknown>;
    if (type === 'group') {
      const memberRefs = toArray(rawElement.elementIds);
      const memberNames = memberRefs
        .map((item) => namesById.get(item) || item)
        .map((item) => String(item).trim())
        .filter(Boolean);
      mapped = mapGroup(rawElement, memberNames);
    } else {
      mapped = mapperByType[type](rawElement);
    }
    runtimeElements[`${index}_${name}`] = mapped;
  });

  const defaults = source.syntax?.defaultElements;
  const runtimeDefaults = isRecord(defaults) ? defaults : {};

  return {
    properties: {
      name: String(source.properties.name),
      title: String(source.properties.title),
      width: toNumber(source.properties.width, 640),
      height: toNumber(source.properties.height, 480),
      fontSize: toNumber(source.properties.fontSize, 12),
      background: toStringOr(source.properties.background, '#ffffff'),
      dependencies: toStringOr(source.properties.dependencies, '')
    },
    syntax: {
      command: toStringOr(source.syntax?.command, ''),
      defaultElements: runtimeDefaults
    },
    customJS: toStringOr(source.customJS, ''),
    messages: localizedMessages,
    defaultMessages,
    elements: runtimeElements
  };
}
