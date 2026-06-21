
interface ConditionControl {
  name?: string;
  conditions?: {
    conditions?: Record<string, string>;
  };
  [key: string]: unknown;
}

type ObjMap = Record<string, ConditionControl>;

type ParsedConditions = {
  error: boolean;
  result: Record<string, string>;
  elements: string[];
};

const OPERATORS = ['==', '!=', '>=', '<=', '>', '<'];

const removeExternalQuotes = (str: string): string => {
    const text = String(str ?? '');
    if (text.length < 2) return text;
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' || first === "'") && (last === '"' || last === "'")) {
      return text.slice(1, -1);
    }
    return text;
  }

const toLiteral = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  return JSON.stringify(value);
};

const collectElements = (expr: string): string[] => {
  const found = new Set<string>();
  const re = /\b([A-Za-z_][\w]*)\.(selected|checked|visible|enabled|value)\b/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(expr)) !== null) {
    found.add(String(m[1]));
  }
  return Array.from(found);
};

const compileExpression = (expr: string, list: ObjMap): string => {
  let compiled = String(expr || '');
  const re = /\b([A-Za-z_][\w]*)\.(selected|checked|visible|enabled|value)\b/g;

  compiled = compiled.replace(re, (_all, rawName: string, prop: string) => {
    const name = String(rawName);
    const obj = list[name];
    const value = obj ? obj[prop] : undefined;
    return toLiteral(value);
  });

  compiled = compiled.replace(/\&/g, '&&').replace(/\|/g, '||');
  return compiled;
};

const evaluateExpression = (expr: string, list: ObjMap): boolean => {
  const code = compileExpression(expr, list);
  try {
    const fn = new Function(`return Boolean(${code});`);
    return Boolean(fn());
  } catch {
    return false;
  }
};

const parseConditionString = (source: string): ParsedConditions => {
  const text = String(source || '').trim();
  if (!text) return { error: true, result: {}, elements: [] };

  const rules = text
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

  if (rules.length === 0) return { error: true, result: {}, elements: [] };

  const result: Record<string, string> = {};
  const elements = new Set<string>();

  for (const rule of rules) {
    const idx = rule.toLowerCase().indexOf(' if ');
    if (idx === -1) return { error: true, result: {}, elements: [] };

    const action = rule.slice(0, idx).trim();
    const expr = rule.slice(idx + 4).trim();
    if (!action || !expr) return { error: true, result: {}, elements: [] };

    result[action] = expr;
    collectElements(expr).forEach((name) => elements.add(name));
  }

  return { error: false, result, elements: Array.from(elements) };
};

const applyAction = (action: string, element: ConditionControl | undefined, list: ObjMap) => {
  const [rawMethod, rawArg] = String(action || '').split('=');
  const method = String(rawMethod || '').trim();
  const handler = element?.[method];
  if (!method || typeof handler !== 'function') return;

  if (rawArg === undefined) {
    handler.call(element, true);
    return;
  }

  let value: unknown = removeExternalQuotes(String(rawArg).trim());

  const alias = String(value || '');
  if (list[alias] && Object.prototype.hasOwnProperty.call(list[alias], 'value')) {
    value = list[alias].value;
  } else if (alias === 'true') {
    value = true;
  } else if (alias === 'false') {
    value = false;
  } else if (!Number.isNaN(Number(alias)) && alias !== '') {
    value = Number(alias);
  }

  handler.call(element, value);
};

const conditions = {
  operators: OPERATORS,
  elements: [] as string[],
  availableProperties: ['selected', 'checked', 'visible', 'enabled'],

  parseConditions(str: string): ParsedConditions {
    return parseConditionString(str);
  },

  checkConditions(weHave: { name?: string }, element: ConditionControl, list: ObjMap) {
    const elementName = String(element.name || '').trim();
    if (!elementName) return;

    const ruleMap = element?.conditions?.conditions || {};
    const methods = Object.keys(ruleMap);

    methods.forEach((action) => {
      const expr = String(ruleMap[action] || '').trim();
      if (!expr) return;
      if (!evaluateExpression(expr, list)) return;
      applyAction(action, list[elementName], list);
    });
  }
};

module.exports = conditions;
