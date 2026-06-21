/* eslint-disable no-console */
export {};
import fs from "fs";
import path from "path";
import type {
  ProfileCustomJSApi,
  ProfileCustomJSContext,
  ProfileCustomJSModule
} from "../modules/profileCustomJSApi";
import {
  dialogRuntimeEventChannels,
  dialogRuntimeIpcChannels
} from "../../dialogRuntimeIpc";

// Imported dialog scripts are user-authored JavaScript. Values crossing this
// compatibility boundary remain dynamic; host-owned APIs are typed separately.
type DialogScriptValue = any;

const resolveProfileCustomJSModulePath = (): string | null => {
  const product = String(process.env.DIALOGFORGE_PRODUCT || '').trim();
  const rootDir = String(process.env.DIALOGFORGE_ROOT || process.cwd()).trim();
  const candidates = [
    product
      ? path.join(rootDir, 'dist', 'products', product, 'dialogs', 'customJSRuntime.js')
      : '',
    product
      ? path.join(rootDir, 'products', product, 'dialogs', 'customJSRuntime.js')
      : '',
    product && typeof process.resourcesPath === 'string'
      ? path.join(
          process.resourcesPath,
          'app.asar',
          'dist',
          'products',
          product,
          'dialogs',
          'customJSRuntime.js'
        )
      : ''
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }

  return null;
};

const extendApiFromProfile = async (
  api: ProfileCustomJSApi,
  ctx: ProfileCustomJSContext
): Promise<void> => {
  const modulePath = resolveProfileCustomJSModulePath();
  if (!modulePath) return;

  try {
    const mod = require(modulePath) as ProfileCustomJSModule;
    const extend = typeof mod?.extendCustomJSApi === 'function'
      ? mod.extendCustomJSApi
      : (typeof mod?.default === 'function' ? mod.default : null);
    if (!extend) return;

    const out = await extend(api, ctx);
    if (out && typeof out === 'object') Object.assign(api, out);
  } catch (error) {
    console.error('[customJS profile extension error]', error);
  }
};

const customJSRuntime = {
  setup(dialogSpec: DialogScriptValue, objects: DialogScriptValue, coms: DialogScriptValue) {
    const code = (dialogSpec && dialogSpec.customJS) ? String(dialogSpec.customJS) : '';
    if (!code.trim()) return;
    const localizedMessages = (() => {
      const raw = dialogSpec && typeof dialogSpec === 'object' ? dialogSpec.messages : null;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {} as Record<string, string>;
      const out: Record<string, string> = {};
      Object.keys(raw).forEach((key) => {
        const value = (raw as Record<string, unknown>)[key];
        if (value !== undefined && value !== null) {
          out[String(key)] = String(value);
        }
      });
      return out;
    })();
    const defaultMessages = (() => {
      const raw = dialogSpec && typeof dialogSpec === 'object' ? dialogSpec.defaultMessages : null;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {} as Record<string, string>;
      const out: Record<string, string> = {};
      Object.keys(raw).forEach((key) => {
        const value = (raw as Record<string, unknown>)[key];
        if (value !== undefined && value !== null) {
          out[String(key)] = String(value);
        }
      });
      return out;
    })();
    const translateMessage = (message: DialogScriptValue) => {
      const text = String(message ?? '');
      if (!text) return text;
      const matchKey = Object.keys(defaultMessages).find((key) => defaultMessages[key] === text);
      if (matchKey && Object.prototype.hasOwnProperty.call(localizedMessages, matchKey)) {
        return localizedMessages[matchKey];
      }
      return text;
    };
    const parseDependencies = (value: DialogScriptValue) => {
      return String(value ?? '')
        .split(/[;,\n]/g)
        .map((x) => x.trim())
        .filter(Boolean);
    };
    const dialogDependencies = parseDependencies(dialogSpec?.properties?.dependencies);

    const handlers = new Map();
    const registeredRawClicks = new Set();
    const activeEmits = new Set();
    const containerDataBindings = new Map();
    const validationMessages = new Map();
    const selectionMemoryBindings = new Map();
    const selectionMemoryByDependent = new Map();
    const selectionMemoryStore = new Map();
    const activeDatasetOptOut = new Set<string>();
    const activeDatasetChangedHandlers = new Set<(name: string) => void>();
    const externalCalls = new Map<string, (parameters?: unknown) => unknown | Promise<unknown>>();
    const objectSources = new Map<string, {
      listNames: () => string[];
      getObjects?: () => unknown[] | Promise<unknown[]>;
      emitSelectionChange?: boolean;
    }>();

    const asWorkspaceVariables = () => {
      return Array.isArray(objects.workspaceVariables) ? objects.workspaceVariables : [];
    };

    const listSourceNames = (key: DialogScriptValue) => {
      const entries = objects.selectData && Array.isArray(objects.selectData[key]) ? objects.selectData[key] : [];
      return toItems(entries);
    };

    const getWorkspaceObjectDescriptors = (names: DialogScriptValue) => {
      const byName = new Map();
      asWorkspaceVariables().forEach((entry: DialogScriptValue) => {
        if (!entry || typeof entry !== 'object') return;
        const name = String((entry as Record<string, unknown>).access_key || (entry as Record<string, unknown>).display_name || '').trim();
        if (!name) return;
        byName.set(name, entry);
      });
      return toItems(names)
        .map((name: DialogScriptValue) => byName.get(name) || null)
        .filter(Boolean);
    };

    const registerObjectSource = (type: DialogScriptValue, source: DialogScriptValue) => {
      const normalized = String(type || '').trim().toLowerCase();
      if (!normalized || !source || typeof source.listNames !== 'function') return;
      objectSources.set(normalized, {
        listNames: () => toItems(source.listNames()),
        getObjects: typeof source.getObjects === 'function' ? source.getObjects : void 0,
        emitSelectionChange: source.emitSelectionChange !== false
      });
    };

    const registerExternalCall = (name: DialogScriptValue, handler: DialogScriptValue) => {
      const normalized = String(name || '').trim();
      if (!normalized) throw new SyntaxError('registerExternalCall() expects a non-empty function name');
      if (typeof handler !== 'function') throw new TypeError(`registerExternalCall("${normalized}") expects a function handler`);
      externalCalls.set(normalized, handler);
    };

    const callMainExternal = async (
      name: string,
      parameters?: Record<string, unknown>
    ): Promise<unknown> => {
      if (!coms || typeof coms.invoke !== 'function') {
        throw new TypeError(`Missing coms.invoke for ${name}`);
      }

      const result = await coms.invoke(
        'base-app:callDialogExternal',
        name,
        parameters || {}
      );

      if (!result || typeof result !== 'object') {
        throw new Error(`Dialog external call did not return a result: ${name}`);
      }

      if (result.status !== 'ready') {
        throw new Error(
          String(result.message || `Dialog external call failed: ${name}`)
        );
      }

      return result.value;
    };

    registerObjectSource('datasets', {
      listNames: () => Object.keys(objects.dataframes || {}),
      getObjects: () => getWorkspaceObjectDescriptors(Object.keys(objects.dataframes || {})),
      emitSelectionChange: true
    });

    registerObjectSource('lists', {
      listNames: () => listSourceNames('list'),
      getObjects: () => getWorkspaceObjectDescriptors(listSourceNames('list')),
      emitSelectionChange: true
    });

    registerObjectSource('matrices', {
      listNames: () => listSourceNames('matrix'),
      getObjects: () => getWorkspaceObjectDescriptors(listSourceNames('matrix')),
      emitSelectionChange: true
    });

    registerObjectSource('vectors', {
      listNames: () => listSourceNames('vector'),
      getObjects: () => getWorkspaceObjectDescriptors(listSourceNames('vector')),
      emitSelectionChange: true
    });

    const register = (name: DialogScriptValue, eventName: DialogScriptValue, fn: DialogScriptValue) => {
      const key = String(name);
      const ev = String(eventName);
      if (!handlers.has(key)) handlers.set(key, {});
      const byEvent = handlers.get(key);
      if (!byEvent[ev]) byEvent[ev] = [];
      byEvent[ev].push(fn);
    };

    const emit = (name: DialogScriptValue, eventName: DialogScriptValue) => {
      const key = String(name);
      const ev = String(eventName);
      const emitKey = `${key}::${ev}`;
      if (activeEmits.has(emitKey)) return;
      const byEvent = handlers.get(key);
      if (!byEvent || !Array.isArray(byEvent[ev])) return;
      activeEmits.add(emitKey);
      try {
        byEvent[ev].forEach((fn) => {
          try { fn(); } catch (err) { console.error('[customJS handler error]', key, ev, err); }
        });
      } finally {
        activeEmits.delete(emitKey);
      }
    };

    objects.emitCustomJSEvent = (name: DialogScriptValue, eventName = 'change') => {
      emit(String(name), String(eventName));
    };


    const find = (el: DialogScriptValue) => {
      if (!el && el !== 0) throw new Error('Element is required');
      const name = String(el).trim();
      const obj = objects.objList[name];
      if (!obj) throw new Error('Unknown element: ' + name);
      return obj;
    };

    const coerceName = (el: DialogScriptValue) => {
      if (!el && el !== 0) throw new SyntaxError('Element is required');
      return String(el).trim();
    };

    const inferType = (obj: DialogScriptValue) => {
      if (!obj) return 'unknown';
      if (obj.kind === 'plot') return 'plot';
      if (obj.kind === 'select') return 'select';
      if (obj.sortable !== void 0 && obj.ordering !== void 0 && Array.isArray(obj.value)) return 'choice';
      if (obj.checked !== void 0) return 'checkbox';
      if (obj.group !== void 0 && obj.selected !== void 0) return 'radio';
      if (Array.isArray(obj.value)) return 'container';
      if (obj.dataList !== void 0 && obj.selected !== void 0 && typeof obj.setValue === 'function') return 'select';
      if (obj.value !== void 0 && typeof obj.setValue === 'function') return 'value';
      return 'other';
    };

    const isRadioGroup = (name: DialogScriptValue) => {
      return objects.radios && objects.radios[name] !== void 0;
    };

    const asArray = (value: DialogScriptValue) => {
      if (Array.isArray(value)) return value;
      if (value === void 0 || value === null) return [];
      return [value];
    };

    const normalizeMemoryList = (values: DialogScriptValue) => {
      const seen = new Set();
      const out: string[] = [];
      asArray(values).forEach((value) => {
        const next = String(value ?? '').trim();
        if (!next || seen.has(next)) return;
        seen.add(next);
        out.push(next);
      });
      return out;
    };

    const toItems = (arr: DialogScriptValue) => {
      return arr
        .map((x: DialogScriptValue) => {
          if (typeof x === 'object' && x !== null) {
            if (x.name !== void 0) return String(x.name);
            if (x.text !== void 0) return String(x.text);
          }
          return String(x);
        })
        .map((x: DialogScriptValue) => x.trim())
        .filter(Boolean);
    };

    const availableDatasetNames = () => Object.keys(objects.dataframes || {});

    const getCachedActiveDataset = () => {
      const active = String(objects.activeDataset || '').trim();
      return active && availableDatasetNames().includes(active) ? active : '';
    };

    const setCachedActiveDataset = (name: DialogScriptValue) => {
      objects.activeDataset = String(name || '').trim();
      return objects.activeDataset;
    };

    const shouldSyncActiveDataset = (name: DialogScriptValue) => !activeDatasetOptOut.has(String(name || '').trim());

    const syncActiveDatasetFromControl = (name: DialogScriptValue) => {
      const key = String(name || '').trim();
      if (!key || !shouldSyncActiveDataset(key)) return;
      if (String(containerDataBindings.get(key) || '') !== 'datasets') return;
      const obj = objects.objList && objects.objList[key];
      const selected = Array.isArray(obj?.value) ? String(obj.value[0] || '').trim() : '';
      if (!selected || selected === getCachedActiveDataset()) return;
      setCachedActiveDataset(selected);
      try {
        void coms.invoke('activeDataset:set', {
          name: selected,
          datasetNames: availableDatasetNames()
        });
      } catch {}
    };

    const chooseDatasetSelection = (items: DialogScriptValue) => {
      const names = toItems(items);
      const active = getCachedActiveDataset();
      if (active && names.includes(active)) return [active];
      return names.length === 1 ? [names[0]] : [];
    };

    const getBindingForDependent = (dependent: DialogScriptValue) => {
      const source = selectionMemoryByDependent.get(String(dependent || '').trim());
      if (!source) return null;
      return selectionMemoryBindings.get(source) || null;
    };

    const getSelectionMemoryBucket = (dependent: DialogScriptValue) => {
      const name = String(dependent || '').trim();
      let bucket = selectionMemoryStore.get(name);
      if (!bucket) {
        bucket = new Map();
        selectionMemoryStore.set(name, bucket);
      }
      return bucket;
    };

    const readSelectionValuesForMemory = (name: DialogScriptValue) => normalizeMemoryList(getSelected(name));

    const readSourceMemoryKey = (name: DialogScriptValue) => {
      const selected = normalizeMemoryList(getSelected(name));
      if (selected.length > 0) return selected.join('\u001f');
      const value = getValue(name);
      if (Array.isArray(value)) {
        const items = value
          .map((entry) => {
            if (typeof entry === 'string') return entry.trim();
            if (entry && typeof entry === 'object') {
              if (entry.text != null) return String(entry.text).trim();
              if (entry.label != null) return String(entry.label).trim();
              if (entry.name != null) return String(entry.name).trim();
              if (entry.value != null) return String(entry.value).trim();
            }
            return String(entry ?? '').trim();
          })
          .filter(Boolean);
        return items.join('\u001f');
      }
      if (value === null || value === void 0) return '';
      return String(value).trim();
    };

    const storeDependentSelectionForKey = (dependent: DialogScriptValue, key: DialogScriptValue) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return;
      getSelectionMemoryBucket(dependent).set(normalizedKey, readSelectionValuesForMemory(dependent));
    };

    const storeDependentSelectionForCurrentSource = (dependent: DialogScriptValue) => {
      const binding = getBindingForDependent(dependent);
      if (!binding) return;
      const key = binding.lastKey || readSourceMemoryKey(binding.source);
      binding.lastKey = key;
      storeDependentSelectionForKey(dependent, key);
    };

    const clearRememberedSelection = (name: DialogScriptValue) => {
      const obj = find(name);
      const t = inferType(obj);
      if (t === 'container' || t === 'choice') {
        setSelected(name, []);
      }
    };

    const restoreDependentSelectionFromMemory = (dependent: DialogScriptValue) => {
      const binding = getBindingForDependent(dependent);
      if (!binding) return;
      const key = binding.lastKey || readSourceMemoryKey(binding.source);
      binding.lastKey = key;
      if (!key) {
        clearRememberedSelection(dependent);
        return;
      }
      const remembered = getSelectionMemoryBucket(dependent).get(key) || [];
      setSelected(dependent, remembered);
    };

    const resetSelectionMemory = () => {
      selectionMemoryBindings.forEach((binding) => {
        binding.lastKey = '';
      });
      selectionMemoryStore.clear();
    };

    const toContainerEntries = (arr: DialogScriptValue) => {
      return asArray(arr)
        .map((x) => {
          if (typeof x === 'object' && x !== null) {
            const rec = x as Record<string, unknown>;
            const rawName = rec.name !== void 0 ? rec.name : rec.text;
            const name = String(rawName ?? '').trim();
            if (!name) return null;
            const flags = Object.fromEntries(
              Object.entries(rec)
                .filter(([key, value]) => key !== 'enabled' && typeof value === 'boolean')
                .map(([key, value]) => [String(key), value === true])
            ) as Record<string, boolean>;
            return {
              name,
              enabled: rec.enabled !== false,
              flags
            };
          }
          const name = String(x ?? '').trim();
          if (!name) return null;
          return { name, enabled: true, flags: {} as Record<string, boolean> };
        })
        .filter((entry): entry is { name: string; enabled: boolean; flags: Record<string, boolean> } => !!entry);
    };

    const makeSourceArray = (source: DialogScriptValue, items: DialogScriptValue) => {
      const out = Array.isArray(items) ? items.slice() : [];
      try {
        Object.defineProperty(out, '__dmSource', {
          value: String(source || ''),
          enumerable: false,
          configurable: false,
          writable: false
        });
      } catch {}
      return out;
    };

    const workspaceObjectNamesByType = (type: DialogScriptValue) => {
      const normalized = String(type || '').trim().toLowerCase();
      const source = objectSources.get(normalized);
      if (!source) return [];
      return source.listNames();
    };

    const setContainerItems = (containerObj: DialogScriptValue, items: DialogScriptValue) => {
      const entries = toContainerEntries(items);
      const list = entries.map((entry) => entry.name);
      const variableType = (containerObj.variableType && String(containerObj.variableType).trim()) ? String(containerObj.variableType) : 'any';
      const flagNames = new Set<string>(['any', 'numeric', 'factor', variableType]);
      entries.forEach((entry) => {
        Object.keys(entry.flags || {}).forEach((key) => {
          if (key) flagNames.add(String(key));
        });
      });
      const dataEntry: Record<string, unknown> = { colnames: list };
      flagNames.forEach((flagName) => {
        dataEntry[flagName] = entries.map((entry) => {
          if (flagName === 'any') return entry.enabled !== false;
          if (entry.flags && Object.prototype.hasOwnProperty.call(entry.flags, flagName)) {
            return entry.enabled !== false && entry.flags[flagName] === true;
          }
          return false;
        });
      });
      containerObj.__scriptItems = list.slice();
      const payload = {
        selected: ['__script__'],
        data: {
          __script__: dataEntry
        }
      };

      if (typeof containerObj.makeVarialeSetList === 'function') {
        containerObj.makeVarialeSetList(payload);
      } else if (typeof containerObj.makeDataSetList === 'function') {
        const asObj: Record<string, Record<string, never>> = {};
        list.forEach((name) => { asObj[name] = {}; });
        containerObj.makeDataSetList(asObj);
      }
    };

    const applyContainerSearchFilter = (containerObj: DialogScriptValue) => {
      const host = getElementNode(containerObj?.name || '');
      if (!(host instanceof HTMLElement)) return;
      const query = String(containerObj?.searchQuery || '').trim().toLowerCase();
      Array.from(host.querySelectorAll<HTMLElement>('.container-item')).forEach((row) => {
        const value = String(row.dataset.value || row.textContent || '').trim().toLowerCase();
        row.style.display = (!query || value.includes(query)) ? '' : 'none';
      });
    };

    const syncBoundContainer = (containerObj: DialogScriptValue, source: DialogScriptValue) => {
      if (!containerObj || !source) return;
      const normalized = String(source).trim().toLowerCase();
      const sourceEntry = objectSources.get(normalized);
      if (!sourceEntry) return;
      const current = Array.isArray(containerObj.value) ? containerObj.value.slice() : [];
      const previousItems = Array.isArray(containerObj.__scriptItems) ? containerObj.__scriptItems.slice() : [];
      const names = workspaceObjectNamesByType(normalized);
      setContainerItems(containerObj, names);
      const keep = current.filter((x: DialogScriptValue) => names.includes(String(x)));
      const nextSelection = normalized === 'datasets'
        ? (keep.includes(getCachedActiveDataset()) ? keep : chooseDatasetSelection(names))
        : (keep.length === 0 && names.length === 1 ? [names[0]] : keep);
      const sameSelection = nextSelection.length === current.length
        && nextSelection.every((value: DialogScriptValue, index: DialogScriptValue) => String(value) === String(current[index]));
      const sameItems = previousItems.length === names.length && previousItems.every((value: DialogScriptValue, index: DialogScriptValue) => String(value) === String(names[index]));
      if (sameSelection) {
        if (!sameItems && typeof containerObj.setValue === 'function') {
          // Rebuild rows while preserving the existing valid selection without firing a change cycle.
          containerObj.initialize = true;
          try {
            containerObj.setValue(nextSelection);
          } finally {
            containerObj.initialize = false;
          }
        }
        if (sourceEntry.emitSelectionChange !== false && nextSelection.length > 0) {
          try {
            emit(String(containerObj.name || ''), 'change');
          } catch {}
        }
        return;
      }
      if (typeof containerObj.setValue === 'function') {
        containerObj.setValue(nextSelection);
      }
      try {
        emit(String(containerObj.name || ''), 'change');
      } catch {}
    };

    const getValue = (el: DialogScriptValue) => {
      const obj = find(el);
      const t = inferType(obj);

      if (t === 'checkbox') return !!obj.checked;
      if (t === 'radio') return !!obj.selected;
      if (t === 'choice') return Array.isArray(obj.value) ? obj.value.slice() : [];
      if (t === 'container') {
        if (Array.isArray(obj.__scriptItems)) return obj.__scriptItems.slice();
        return Array.isArray(obj.value) ? obj.value.slice() : [];
      }
      if (t === 'plot') return obj.value ?? null;
      if (t === 'select') return obj.value || '';
      if (obj.value !== void 0) return obj.value;
      if (obj.element && obj.element.txt && typeof obj.element.txt.attr === 'function') {
        return obj.element.txt.attr('text');
      }
      return null;
    };

    const setValue = (el: DialogScriptValue, value: DialogScriptValue) => {
      const obj = find(el);
      const t = inferType(obj);

      if (t === 'checkbox') {
        value ? obj.check() : obj.uncheck();
        return;
      }
      if (t === 'radio') {
        value ? obj.select() : obj.deselect();
        return;
      }
      if (t === 'container') {
        if (Array.isArray(value)) {
          const source = String(Reflect.get(value, '__dmSource') || '').trim();
          if (source) containerDataBindings.set(String(obj.name), source);
          else containerDataBindings.delete(String(obj.name));
          const nextItems = toItems(value);
          setContainerItems(obj, value);
          if (source === 'datasets') {
            obj.setValue(chooseDatasetSelection(nextItems));
          } else if (source && nextItems.length === 1) {
            obj.setValue(nextItems);
          } else if (source) {
            obj.setValue([]);
          }
          restoreDependentSelectionFromMemory(String(obj.name));
          storeDependentSelectionForCurrentSource(String(obj.name));
        } else {
          containerDataBindings.delete(String(obj.name));
          obj.setValue(asArray(value).map(String));
          storeDependentSelectionForCurrentSource(String(obj.name));
        }
        return;
      }
      if (t === 'choice') {
        if (typeof obj.setValue === 'function') {
          obj.setValue(Array.isArray(value) ? value : asArray(value));
        }
        restoreDependentSelectionFromMemory(String(obj.name));
        storeDependentSelectionForCurrentSource(String(obj.name));
        return;
      }
      if (t === 'select') {
        if (Array.isArray(value) && typeof obj.setOptions === 'function') {
          obj.setOptions(asArray(value).map((item) => {
            if (item && typeof item === 'object') {
              const rec = item as Record<string, unknown>;
              return String(rec.name ?? rec.text ?? rec.value ?? '').trim();
            }
            return String(item ?? '').trim();
          }).filter(Boolean));
          return;
        }
        if (typeof obj.setValue === 'function') {
          obj.setValue(value);
        }
        return;
      }
      if (t === 'plot') {
        if (typeof obj.setValue === 'function') {
          obj.setValue(value);
        }
        return;
      }
      if (typeof obj.setValue === 'function') {
        obj.setValue(value);
      }
    };

    const getSelected = (el: DialogScriptValue) => {
      const obj = find(el);
      const t = inferType(obj);
      if (t === 'container') return Array.isArray(obj.value) ? obj.value.slice() : [];
      if (t === 'choice') return Array.isArray(obj.selected) ? obj.selected.slice() : [];
      if (t === 'select') return obj.value ? [obj.value] : [];
      return [];
    };

    const setSelected = (el: DialogScriptValue, value: DialogScriptValue) => {
      const obj = find(el);
      const t = inferType(obj);
      if (t === 'container') {
        obj.setValue(asArray(value).map(String));
        storeDependentSelectionForCurrentSource(String(obj.name));
      } else if (t === 'choice') {
        const selected = new Set(asArray(value).map((x) => String(x).trim()).filter(Boolean));
        const base = Array.isArray(obj.value) ? obj.value : [];
        const orderingMode = String(obj.ordering == null ? 'no' : obj.ordering).trim().toLowerCase();
        const allowDesc = orderingMode !== 'no' && orderingMode !== 'false' && orderingMode !== '';
        const next = base.map((item: DialogScriptValue) => {
          if (!item || typeof item !== 'object') return item;
          const text = String(item.text || '').trim();
          if (!text) return item;
          if (!selected.has(text) && !selected.has(`${text}:asc`) && !selected.has(`${text}:desc`)) {
            return { text, state: 'off' };
          }
          if (selected.has(`${text}:desc`) && allowDesc) return { text, state: 'desc' };
          return { text, state: 'asc' };
        });
        if (typeof obj.setValue === 'function') {
          obj.setValue(next);
        }
        storeDependentSelectionForCurrentSource(String(obj.name));
      } else if (t === 'select') {
        const val = asArray(value)[0];
        obj.setValue(val ? String(val) : '');
      }
    };

    const check = (...els: DialogScriptValue[]) => {
      els.forEach((el) => {
        const obj = find(el);
        if (typeof obj.check === 'function') obj.check();
        else if (typeof obj.select === 'function') obj.select();
      });
    };

    const uncheck = (...els: DialogScriptValue[]) => {
      els.forEach((el) => {
        const obj = find(el);
        if (typeof obj.uncheck === 'function') obj.uncheck();
        else if (typeof obj.deselect === 'function') obj.deselect();
      });
    };

    const show = (el: DialogScriptValue, on = true) => {
      const obj = find(el);
      if (on) { if (typeof obj.show === 'function') obj.show(); }
      else { if (typeof obj.hide === 'function') obj.hide(); }
    };

    const hide = (el: DialogScriptValue, on = true) => show(el, !on);

    const enable = (el: DialogScriptValue, on = true) => {
      const obj = find(el);
      if (on) { if (typeof obj.enable === 'function') obj.enable(); }
      else { if (typeof obj.disable === 'function') obj.disable(); }
    };

    const disable = (el: DialogScriptValue, on = true) => enable(el, !on);

    const addValue = (el: DialogScriptValue, value: DialogScriptValue) => {
      const obj = find(el);
      if (inferType(obj) !== 'container') return;
      const existing = Array.isArray(obj.__scriptItems) ? obj.__scriptItems.slice() : [];
      const additions = toItems(asArray(value));
      additions.forEach((it: DialogScriptValue) => { if (!existing.includes(it)) existing.push(it); });
      setContainerItems(obj, existing);
    };

    const clearValue = (el: DialogScriptValue, value: DialogScriptValue) => {
      const obj = find(el);
      if (inferType(obj) === 'container') {
        const existing = Array.isArray(obj.__scriptItems) ? obj.__scriptItems.slice() : [];
        const remove = new Set(toItems(asArray(value)));
        const next = existing.filter((x: DialogScriptValue) => !remove.has(x));
        setContainerItems(obj, next);
        const selected = (Array.isArray(obj.value) ? obj.value : []).filter((x: DialogScriptValue) => !remove.has(x));
        obj.setValue(selected);
      } else if (typeof obj.setValue === 'function') {
        obj.setValue('');
      }
    };

    const clearContent = (...els: DialogScriptValue[]) => {
      els.forEach((el) => {
        const obj = find(el);
        const t = inferType(obj);
        if (t === 'container') {
          setContainerItems(obj, []);
          obj.setValue([]);
        } else if (t === 'plot') {
          if (typeof obj.clear === 'function') obj.clear();
          else if (obj.host) obj.host.innerHTML = '';
        } else if (typeof obj.setValue === 'function') {
          obj.setValue('');
        }
      });
    };

    const searchIn = (input: DialogScriptValue, ...containers: DialogScriptValue[]) => {
      const inputName = coerceName(input);
      const inputObj = find(inputName);
      const inputType = inferType(inputObj);
      if (inputType !== 'value') {
        throw new SyntaxError(`searchIn() expects an Input as the first argument; ${inputName} is ${inputType}`);
      }
      if (!containers.length) {
        throw new SyntaxError('searchIn() expects at least one container');
      }

      const applyQuery = () => {
        const query = String(getValue(inputName) ?? '').trim();
        containers.forEach((container) => {
          const containerName = coerceName(container);
          const containerObj = find(containerName);
          const containerType = inferType(containerObj);
          if (containerType !== 'container') {
            throw new SyntaxError(`searchIn() supports only Container targets; ${containerName} is ${containerType}`);
          }
          containerObj.searchQuery = query;
          applyContainerSearchFilter(containerObj);
        });
      };

      onInput(inputName, applyQuery);
      onChange(inputName, applyQuery);
      applyQuery();
    };

    const enableSearch = (...containers: DialogScriptValue[]) => {
      if (!containers.length) {
        throw new SyntaxError('enableSearch() expects at least one container');
      }

      containers.forEach((container) => {
        const containerName = coerceName(container);
        const containerObj = find(containerName);
        const containerType = inferType(containerObj);
        if (containerType !== 'container') {
          throw new SyntaxError(`enableSearch() supports only Container targets; ${containerName} is ${containerType}`);
        }
        containerObj.autoSearchEnabled = true;
      });
    };

    const getElementNode = (el: DialogScriptValue) => {
      const obj = find(el);
      if (obj.kind === 'plot' && obj.host) return obj.host;
      if (obj.element?.cover?.node) return obj.element.cover.node;
      if (obj.host) return obj.host;
      return null;
    };

    const renderPlot = (el: DialogScriptValue, renderer: DialogScriptValue) => {
      const obj = find(el);
      if (inferType(obj) !== 'plot') {
        throw new Error('renderPlot() expects a Plot element');
      }
      if (typeof obj.render === 'function') {
        obj.render(renderer);
        return;
      }
      if (typeof renderer === 'function' && obj.host) {
        renderer(obj.host, obj);
      }
    };

    const setLabel = (el: DialogScriptValue, label: DialogScriptValue) => {
      const obj = find(el);
      if (obj.element && obj.element.txt && typeof obj.element.txt.attr === 'function') {
        obj.element.txt.attr({ text: String(label) });
      }
    };

    const normalizeCommandText = (command: DialogScriptValue) => {
      return String(command || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    };

    const updateSyntax = (command: DialogScriptValue) => {
      const normalized = normalizeCommandText(command);
      try {
        objects.command = normalized;
      } catch {}
      coms.sendTo('main', dialogRuntimeEventChannels.commandUpdate, normalized);
    };

    const run = async (command: DialogScriptValue, options: DialogScriptValue) => {
      const normalized = normalizeCommandText(command);
      const dependencyOverride = (() => {
        if (Array.isArray(options)) return parseDependencies(options);
        if (options && typeof options === 'object' && Object.prototype.hasOwnProperty.call(options, 'dependencies')) {
          return parseDependencies(options.dependencies);
        }
        return null;
      })();
      coms.sendTo('main', dialogRuntimeEventChannels.commandUpdate, normalized);
      const result = await coms.invoke(dialogRuntimeIpcChannels.runVisibleCommand, {
        command: normalized,
        dependencies: dependencyOverride !== null ? dependencyOverride : dialogDependencies.slice(),
        dialogID: String(objects?.dialogID || '')
      });
      if (result?.ok && objects?.dialogID) {
        coms.sendTo('main', dialogRuntimeEventChannels.closeWindow, { dialogID: String(objects.dialogID) });
      }
      return result;
    };

    const closeDialog = () => {
      if (!objects?.dialogID) return;
      coms.sendTo('main', dialogRuntimeEventChannels.closeWindow, { dialogID: String(objects.dialogID) });
    };

    const sendToScriptEditor = (command: DialogScriptValue) => {
      const normalized = normalizeCommandText(command);
      if (!normalized.trim()) return;
      coms.sendTo('main', dialogRuntimeEventChannels.commandUpdate, normalized);
      coms.sendTo('main', 'scriptEditor:insertCode', { code: normalized });
    };

    const resetDialog = () => {
      objects.changeDialogState(objects.dialogDefaultData, false);
      objects.dialogCurrentData = {};
      resetSelectionMemory();
      coms.sendTo('main', dialogRuntimeEventChannels.stateUpdate, { name: objects.dialogID, changes: objects.dialogCurrentData });
    };

    const rememberSelectionBy = (source: DialogScriptValue, ...dependents: DialogScriptValue[]) => {
      const sourceName = coerceName(source);
      const sourceObj = find(sourceName);
      const sourceType = inferType(sourceObj);
      if (!new Set(['container', 'choice', 'select', 'value', 'checkbox', 'radio']).has(sourceType)) {
        throw new SyntaxError(`rememberSelectionBy() does not support source element type ${sourceType}`);
      }
      if (!dependents.length) {
        throw new SyntaxError('rememberSelectionBy() expects at least one dependent element');
      }

      let binding = selectionMemoryBindings.get(sourceName);
      if (!binding) {
        binding = { source: sourceName, dependents: new Set(), lastKey: readSourceMemoryKey(sourceName) };
        selectionMemoryBindings.set(sourceName, binding);
        onChange(sourceName, () => {
          const current = selectionMemoryBindings.get(sourceName);
          if (!current) return;
          if (current.lastKey) {
            current.dependents.forEach((dependent: DialogScriptValue) => {
              storeDependentSelectionForKey(dependent, current.lastKey);
            });
          }
          current.lastKey = readSourceMemoryKey(sourceName);
        });
      }

      dependents.forEach((dependent) => {
        const dependentName = coerceName(dependent);
        const dependentObj = find(dependentName);
        const dependentType = inferType(dependentObj);
        if (dependentType !== 'container' && dependentType !== 'choice') {
          throw new SyntaxError(`rememberSelectionBy() supports only Container and Choice dependents; ${dependentName} is ${dependentType}`);
        }
        const existingSource = selectionMemoryByDependent.get(dependentName);
        if (existingSource && existingSource !== sourceName) {
          throw new SyntaxError(`Dependent element "${dependentName}" is already bound to source "${existingSource}"`);
        }
        if (!binding.dependents.has(dependentName)) {
          binding.dependents.add(dependentName);
          selectionMemoryByDependent.set(dependentName, sourceName);
          onChange(dependentName, () => storeDependentSelectionForCurrentSource(dependentName));
        }
      });
    };

    registerExternalCall('rememberVariableSelections', async (parameters: DialogScriptValue) => {
      const payload = parameters && typeof parameters === 'object'
        ? parameters as Record<string, unknown>
        : {};
      const source = payload.source;
      const dependents = Array.isArray(payload.dependents) ? payload.dependents : [];
      rememberSelectionBy(source, ...dependents);
      return null;
    });

    const listObjects = (type: DialogScriptValue) => {
      const normalized = String(type || '').trim().toLowerCase();
      const source = objectSources.get(normalized);
      if (!source) return [];
      return makeSourceArray(normalized, source.listNames());
    };

    const getObjects = async (type: DialogScriptValue) => {
      const normalized = String(type || '').trim().toLowerCase();
      const source = objectSources.get(normalized);
      if (!source || typeof source.getObjects !== 'function') return [];
      try {
        const out = await source.getObjects();
        return Array.isArray(out) ? out : [];
      } catch (error) {
        console.error('[customJS getObjects error]', normalized, error);
        return [];
      }
    };

    const DATASET_ITEM_TYPES = ['numeric', 'factor', 'calibrated', 'binary', 'character', 'categorical', 'date'] as const;

    const listVariableEntries = (dataset: DialogScriptValue) => {
      let ds = dataset;
      if (Array.isArray(ds)) ds = ds[0];
      ds = String(ds || '').trim();
      if (!ds || !objects.dataframes || !objects.dataframes[ds]) return [];

      const df = objects.dataframes[ds] || {};
      const cols = Array.isArray(df.colnames) ? df.colnames.map((x: DialogScriptValue) => String(x ?? '').trim()).filter(Boolean) : [];
      if (cols.length === 0) return [];

      return cols.map((name: DialogScriptValue, index: DialogScriptValue) => {
        const entry: Record<string, unknown> = { name };
        DATASET_ITEM_TYPES.forEach((flagName) => {
          const flags = Array.isArray(df[flagName]) ? df[flagName] : [];
          if (typeof flags[index] === 'boolean') entry[flagName] = flags[index] === true;
        });
        // Make this usable as a string in simple dialog scripts (e.g. join/concat)
        // without forcing dialog authors to map .name everywhere.
        try {
          Object.defineProperty(entry, 'toString', {
            value(this: { name?: unknown }) { return String(this.name || ''); },
            enumerable: false
          });
        } catch {}
        return entry;
      });
    };

    const listColumns = (dataset: DialogScriptValue) => listVariableEntries(dataset);

    const getErrorHost = (name: DialogScriptValue) => {
      try {
        const obj = find(name);
        if (obj && obj.host instanceof HTMLElement) return obj.host;
      } catch {}
      return null;
    };

    const applyErrorState = (name: DialogScriptValue) => {
      const host = getErrorHost(name);
      if (!(host instanceof HTMLElement)) return;
      const messages = validationMessages.get(name) || [];
      const text = messages.length ? String(messages[0]) : '';
      host.classList.remove('error-in-field', 'error-in-radio');
      if (!text) {
        host.removeAttribute('data-error-tooltip');
        host.removeAttribute('title');
        return;
      }
      const kind = isRadioGroup(name) || inferType(find(name)) === 'radio' ? 'error-in-radio' : 'error-in-field';
      host.classList.add(kind);
      host.setAttribute('data-error-tooltip', text);
      host.setAttribute('title', text);
    };

    const getVariableValues = async (dataset: DialogScriptValue, variable: DialogScriptValue) => {
      let ds = dataset;
      let vr = variable;
      if (Array.isArray(ds)) ds = ds[0];
      if (Array.isArray(vr)) vr = vr[0];
      ds = String(ds || '').trim();
      vr = String(vr || '').trim();
      if (!ds || !vr) return null;
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke(dialogRuntimeIpcChannels.getVariableValues, { name: ds, variableName: vr });
      } catch (error) {
        console.error('[customJS getVariableValues error]', error);
        return null;
      }
    };

    const openImportFile = async () => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke('importFromFile:openFile');
      } catch (error) {
        console.error('[customJS openImportFile error]', error);
        return null;
      }
    };

    const getImportPreview = async (payload: DialogScriptValue) => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke('importFromFile:getPreview', payload || {});
      } catch (error) {
        console.error('[customJS getImportPreview error]', error);
        return null;
      }
    };

    const getWorkingDirectory = async () => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke(dialogRuntimeIpcChannels.getWorkingDirectory);
      } catch (error) {
        console.error('[customJS getWorkingDirectory error]', error);
        return null;
      }
    };

    const firstTypeToken = (value: DialogScriptValue) => String(value || '')
      .split(/[\/,]/)
      .map((entry) => entry.trim().toLowerCase())
      .find(Boolean) || '';

    const toDialogVariableEntry = (item: DialogScriptValue) => {
      if (!item || typeof item !== 'object') return null;
      const record = item;
      const name = String(record.name || record.text || '').trim();
      if (!name) return null;
      const typeToken = firstTypeToken(record.type);
      const measure = String(record.measure || '').trim().toLowerCase();
      const categories = Array.isArray(record.categories) ? record.categories : [];
      const categoryCount = categories.length;
      const isMeasuredNumeric = measure === 'interval' || measure === 'ratio' || measure === 'scale';
      const isIntrinsicNumeric = typeToken === 'numeric' || typeToken === 'double' || typeToken === 'integer' || isMeasuredNumeric;
      const isOrdinalNumeric = measure === 'ordinal' && categoryCount >= 7;
      const isNominalCategorical = measure === 'nominal' && categoryCount > 0;
      const isNumeric = (!isNominalCategorical && isIntrinsicNumeric) || isOrdinalNumeric;
      const isCharacter = typeToken === 'character';
      const isDate = typeToken === 'date' || typeToken === 'posixct' || typeToken === 'posixlt';
      const isFactor = typeToken === 'factor' || typeToken === 'ordered';
      const isCategorical = isFactor || measure === 'nominal' || measure === 'ordinal';
      const isBinary = typeToken === 'logical' || categories.length === 2;
      const isCalibrated = record.calibrated === true;
      return {
        ...record,
        name,
        numeric: isNumeric || isCalibrated,
        factor: isFactor || isCategorical,
        calibrated: isCalibrated,
        binary: isBinary,
        character: isCharacter,
        categorical: isCategorical,
        date: isDate
      };
    };

    const hasDatasetTypeFlags = (datasetEntry: DialogScriptValue) => {
      if (!datasetEntry || typeof datasetEntry !== 'object') return false;
      return DATASET_ITEM_TYPES.some((flagName) => {
        const values = datasetEntry[flagName];
        return Array.isArray(values) && values.some((value) => typeof value === 'boolean');
      });
    };

    const getDatasetVariables = async (dataset: DialogScriptValue) => {
      let ds = dataset;
      if (Array.isArray(ds)) ds = ds[0];
      ds = String(ds || '').trim();
      if (!ds) return null;
      const cached = objects.dataframes && objects.dataframes[ds];
      if (cached && Array.isArray(cached.colnames) && hasDatasetTypeFlags(cached)) {
        const names = cached.colnames.map((item: DialogScriptValue) => String(item ?? '').trim()).filter(Boolean);
        return names.map((name: DialogScriptValue, index: DialogScriptValue) => {
          const entry: Record<string, unknown> = { name };
          DATASET_ITEM_TYPES.forEach((flagName) => {
            const flags = Array.isArray(cached[flagName]) ? cached[flagName] : [];
            if (typeof flags[index] === 'boolean') entry[flagName] = flags[index] === true;
          });
          return entry;
        });
      }
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        const out = await coms.invoke('datasetViewer:getVariables', { name: ds });
        return Array.isArray(out)
          ? out.map((item) => toDialogVariableEntry(item)).filter(Boolean)
          : null;
      } catch (error) {
        console.error('[customJS getDatasetVariables error]', error);
        return null;
      }
    };

    const getDatasetEditorState = async () => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke('datasetEditor:getActiveState');
      } catch (error) {
        console.error('[customJS getDatasetEditorState error]', error);
        return null;
      }
    };

    const getActiveDataset = async () => {
      try {
        if (!coms || typeof coms.invoke !== 'function') return getCachedActiveDataset();
        const out = await coms.invoke('activeDataset:get');
        return setCachedActiveDataset(out);
      } catch {
        return getCachedActiveDataset();
      }
    };

    const setActiveDataset = async (name: DialogScriptValue) => {
      const next = String(name || '').trim();
      setCachedActiveDataset(next);
      try {
        if (!coms || typeof coms.invoke !== 'function') return next;
        const out = await coms.invoke('activeDataset:set', {
          name: next,
          datasetNames: availableDatasetNames()
        });
        return setCachedActiveDataset(out);
      } catch {
        return next;
      }
    };

    const clearActiveDataset = async () => {
      setCachedActiveDataset('');
      try {
        if (!coms || typeof coms.invoke !== 'function') return '';
        const out = await coms.invoke('activeDataset:clear');
        return setCachedActiveDataset(out);
      } catch {
        return '';
      }
    };

    const consumeGoToContext = async () => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke('datasetEditor:consumeGoToContext');
      } catch (error) {
        console.error('[customJS consumeGoToContext error]', error);
        return null;
      }
    };

    const gotoDatasetEditorCase = async (caseNumber: DialogScriptValue) => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke('datasetEditor:gotoCase', { caseNumber });
      } catch (error) {
        console.error('[customJS gotoDatasetEditorCase error]', error);
        return false;
      }
    };

    const gotoDatasetEditorVariable = async (variableName: DialogScriptValue) => {
      try {
        if (!coms || typeof coms.invoke !== 'function') throw new TypeError('coms.invoke is not a function');
        return await coms.invoke('datasetEditor:gotoVariable', { variableName });
      } catch (error) {
        console.error('[customJS gotoDatasetEditorVariable error]', error);
        return false;
      }
    };

    const addError = (el: DialogScriptValue, message: DialogScriptValue) => {
      const key = coerceName(el);
      const text = translateMessage(message);
      if (!text) return;
      const existing = validationMessages.get(key) || [];
      if (!existing.includes(text)) existing.push(text);
      validationMessages.set(key, existing);
      applyErrorState(key);
    };

    const clearError = (...args: DialogScriptValue[]) => {
      if (!args.length) {
        throw new SyntaxError('clearError() expects at least one element');
      }

      let names: DialogScriptValue[] = [];
      let message: string | undefined;

      if (Array.isArray(args[0])) {
        names = args[0];
        if (args.length > 1 && args[1] != null) {
          const msg = String(args[1] ?? '');
          if (msg) message = msg;
        }
      } else if (args.length === 2) {
        const maybeMsg = args[1];
        let secondIsElement = false;
        try {
          find(maybeMsg);
          secondIsElement = true;
        } catch {}
        if (typeof maybeMsg === 'string' && !secondIsElement) {
          names = [args[0]];
          const msg = String(maybeMsg ?? '');
          if (msg) message = msg;
        } else {
          names = args;
        }
      } else {
        names = args;
      }

      if (!names.length) {
        throw new SyntaxError('clearError() expects at least one element');
      }

      names.forEach((nameLike) => {
        const key = coerceName(nameLike);
        if (!validationMessages.has(key)) {
          applyErrorState(key);
          return;
        }
        if (message) {
          const next = (validationMessages.get(key) || []).filter((err: DialogScriptValue) => err !== message);
          if (next.length) validationMessages.set(key, next);
          else validationMessages.delete(key);
        } else {
          validationMessages.delete(key);
        }
        applyErrorState(key);
      });
    };

    const triggerChange = (el: DialogScriptValue) => emit(String(el), 'change');
    const triggerClick = (el: DialogScriptValue) => emit(String(el), 'click');
    const on = (el: DialogScriptValue, eventName: DialogScriptValue, handler: DialogScriptValue) => {
      const key = String(el);
      register(key, eventName, handler);
    };

    const onChange = (el: DialogScriptValue, handler: DialogScriptValue) => on(el, 'change', handler);
    const onClick = (el: DialogScriptValue, handler: DialogScriptValue) => on(el, 'click', handler);
    const onInput = (el: DialogScriptValue, handler: DialogScriptValue) => on(el, 'input', handler);

    const attachRawClickListeners = () => {
      Object.keys(objects.objList || {}).forEach((name) => {
        const obj = objects.objList[name];
        if (!obj || !obj.element || registeredRawClicks.has(name)) return;
        registeredRawClicks.add(name);
        let wired = false;
        const orderedKeys = ['cover', 'txt', ...Object.keys(obj.element)];
        for (let i = 0; i < orderedKeys.length; i++) {
          const k = String(orderedKeys[i] || '');
          const shape = obj.element[k];
          if (shape && typeof shape.click === 'function') {
            try {
              shape.click(() => emit(name, 'click'));
              wired = true;
              break;
            } catch (_err) {}
          }
        }
        if (!wired) return;
      });
    };

    objects.events.on('iSpeak', (data: DialogScriptValue) => {
      if (!data || !data.name) return;
      const name = String(data.name);
      const status = String(data.status || '');

      if (status === 'input') {
        emit(name, 'input');
      }
      if (status === 'value' || status === 'check' || status === 'uncheck' || status === 'select' || status === 'deselect') {
        if (status === 'value') syncActiveDatasetFromControl(name);
        emit(name, 'change');
      }
      if (status === 'check' || status === 'uncheck' || status === 'select' || status === 'deselect') {
        emit(name, 'click');
      }

      const obj = objects.objList[name];
      if (obj && obj.group && (status === 'select' || status === 'deselect')) {
        emit(String(obj.group), 'change');
      }
    });

    const workspaceDataUpdatedHandlers = new Set<() => void>();

    objects.events.on('workspaceDataUpdated', () => {
      containerDataBindings.forEach((source, name) => {
        const obj = objects.objList && objects.objList[name];
        if (!obj) return;
        syncBoundContainer(obj, source);
      });
      workspaceDataUpdatedHandlers.forEach((handler) => {
        try {
          handler();
        } catch (error) {
          console.error('[customJS workspaceDataUpdated handler error]', error);
        }
      });
    });

    try {
      coms.on('activeDataset:changed', (payload: DialogScriptValue) => {
        const next = setCachedActiveDataset(payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>).name
          : payload);
        activeDatasetChangedHandlers.forEach((handler) => {
          try {
            handler(next);
          } catch (error) {
            console.error('[customJS activeDatasetChanged handler error]', error);
          }
        });
      });
    } catch {}

    attachRawClickListeners();

    const isChecked = (el: DialogScriptValue) => {
      const obj = find(el);
      return !!(obj.checked || obj.selected);
    };

    const api: ProfileCustomJSApi = {
      showMessage: (msg: DialogScriptValue, detail: DialogScriptValue) => console.log('[Dialog message]', msg, detail || ''),
      getValue,
      setValue,
      callExternal: async (name: DialogScriptValue, parameters: DialogScriptValue) => {
        const callName = String(name ?? '').trim();
        if (!callName) {
          throw new SyntaxError('callExternal() expects a non-empty function name');
        }
        const handler = externalCalls.get(callName);
        if (typeof handler === 'function') {
          return await handler(parameters);
        }

        return await callMainExternal(callName, parameters);
      },
      isChecked,
      check,
      isUnchecked: (el: DialogScriptValue) => !isChecked(el),
      uncheck,
      getSelected,
      setSelected,
      show,
      hide,
      enable,
      disable,
      isVisible: (el: DialogScriptValue) => !!find(el).visible,
      isHidden: (el: DialogScriptValue) => !find(el).visible,
      isEnabled: (el: DialogScriptValue) => !!find(el).enabled,
      isDisabled: (el: DialogScriptValue) => !find(el).enabled,
      on,
      onChange,
      onClick,
      onInput,
      onWorkspaceDataUpdated: (fn: DialogScriptValue) => {
        if (typeof fn !== 'function') {
          throw new TypeError('onWorkspaceDataUpdated() expects a function');
        }
        workspaceDataUpdatedHandlers.add(fn);
        return () => {
          workspaceDataUpdatedHandlers.delete(fn);
        };
      },
      getActiveDataset,
      setActiveDataset,
      clearActiveDataset,
      onActiveDatasetChanged: (fn: DialogScriptValue) => {
        if (typeof fn !== 'function') {
          throw new TypeError('onActiveDatasetChanged() expects a function');
        }
        activeDatasetChangedHandlers.add(fn);
        return () => {
          activeDatasetChangedHandlers.delete(fn);
        };
      },
      setActiveDatasetSync: (el: DialogScriptValue, enabled = true) => {
        const name = coerceName(el);
        if (enabled === false) activeDatasetOptOut.add(name);
        else activeDatasetOptOut.delete(name);
      },
      searchIn,
      enableSearch,
      triggerChange,
      triggerClick,
      addValue,
      clearValue,
      clearContent,
      clearInput: (...els: DialogScriptValue[]) => clearContent(...els),
      setLabel,
      updateSyntax,
      run,
      closeDialog,
      sendToScriptEditor,
      resetDialog,
      registerExternalCall,
      registerObjectSource,
      listObjects,
      getObjects,
      listColumns,
      getVariableValues,
      openImportFile,
      getImportPreview,
      getWorkingDirectory,
      getDatasetVariables,
      getDatasetEditorState,
      consumeGoToContext,
      gotoDatasetEditorCase,
      gotoDatasetEditorVariable,
      addError,
      clearError,
      changeValue: () => {}
    };

    api.getElementNode = getElementNode;
    api.renderPlot = renderPlot;

    void extendApiFromProfile(api, { dialogSpec, objects, coms }).then(() => {
      const identifiers = new Set();
      Object.keys(objects.objList || {}).forEach((n) => identifiers.add(n));
      Object.keys(objects.radios || {}).forEach((n) => identifiers.add(n));

      const reservedWords = new Set([
        'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
        'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function',
        'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
        'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch',
        'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'
      ]);

      const bindingDecl = Array.from(identifiers)
        .map((n) => String(n))
        .filter((n) => /^[$A-Z_a-z][$\w]*$/.test(n) && !reservedWords.has(n))
        .map((n) => `const ${n} = ${JSON.stringify(n)};`)
        .join('\n');

      const apiDecl = Object.keys(api)
        .map((k) => `const ${k} = api.${k};`)
        .join('\n');

      try {
        const fn = new Function('api', `${bindingDecl}\n${apiDecl}\n${code}`);
        fn(api);
      } catch (err) {
        console.error('[customJS runtime error]', err);
      }
    });
  }
};

module.exports = customJSRuntime;
