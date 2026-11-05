import { coms } from './coms';
import { dialogRuntimeEventChannels } from '../../dialogRuntimeIpc';
import { createDialogRenderer } from '@dialogcreator/renderer';
import type { PreviewDialog, PreviewUI, ContainerItemDescriptor } from '@dialogcreator/renderer';
import type { RuntimeDialogSchema, RuntimeElementSpec } from './dialog.types';
import type { DialogRuntimeControlBuilderRuntime } from './dialogBackendControlRuntime';
import { createRuntimeControl, makeNodeFacade } from './dialogControlPrimitives';
import { createDialogControlLifecycle } from './dialogControlLifecycle';
import { createDialogPlotHostAdapter } from './dialogPlotHostAdapter';
import { asBoolean, asText, asStringArray, ensureNumber } from '../library/utils';

// Translate runtime services and persisted state to the renderer's public UI.
// Control markup, interaction, sizing and presentation belong to DialogCreator.
export function createCanonicalControlAdapter(root: HTMLElement, runtime: DialogRuntimeControlBuilderRuntime) {
    const lifecycle = createDialogControlLifecycle(runtime);
    let renderer: ReturnType<typeof createDialogRenderer> | null = null;

    const render = function(dialogSpec: RuntimeDialogSchema): void {
        renderer?.dispose();
        const specs = Object.values(dialogSpec.elements);
        const source = dialogSpec.rendererDocument;
        const idsByName = new Map(specs.map((spec) => [
            asText(spec.name), String(spec.sourceElementId || spec.parentId || spec.name)
        ]));
        const elements = source ? source.elements : specs.map((spec) => {
            const type = asText(spec.type);
            const element: Record<string, unknown> = {
                ...spec,
                id: idsByName.get(asText(spec.name)),
                nameid: asText(spec.name),
                group: asText(spec.radioGroup || spec.group),
                type: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
                value: type.toLowerCase() === 'label' ? spec.text : spec.value,
                __baseValue: spec.baseText,
                __itemLabels: spec.itemLabels,
                handlepos: ensureNumber(spec.value, 0.5) * 100,
                elementIds: spec.sourceMemberIds || asStringArray(spec.elementIds).map((name) => idsByName.get(name) || name)
            };
            if (['counter', 'checkbox', 'radio', 'label'].includes(type.toLowerCase())) {
                delete element.width;
                delete element.height;
            }
            return element;
        });
        const document: PreviewDialog = {
            id: String(source?.id || ''),
            properties: { ...dialogSpec.properties },
            syntax: { command: '', defaultElements: [] },
            elements,
            customJS: ''
        };
        renderer = createDialogRenderer(root, {
            log: (message) => coms.sendTo('main', dialogRuntimeEventChannels.log, message),
            showMessage: (type, message, detail) => coms.sendTo('main', dialogRuntimeEventChannels.showMessage, type, message, detail)
        }, {
            executeActions: false,
            languageSwitcher: false,
            controls: {
                Plot: () => {
                    const surface = window.document.createElement('div');
                    surface.className = 'dm-plot-surface';
                    return surface;
                }
            }
        });
        renderer.render(document);
        const canvas = renderer.canvas;
        if (asBoolean(dialogSpec.properties.resizable)) {
            root.style.width = '100%';
            root.style.height = '100%';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        }
        const ui = renderer.ui;
        runtime.rendererUI = ui;
        const plotBuilders = createDialogPlotHostAdapter(canvas, runtime, lifecycle);

        for (const spec of specs) {
            const name = asText(spec.name);
            const type = asText(spec.type).toLowerCase();
            const host = Array.from(canvas.querySelectorAll<HTMLElement>('[data-nameid]'))
                .find((node) => node.dataset.nameid === name && (node.classList.contains('element-wrapper') || node.classList.contains('element-group')));
            if (!host) {
                throw new Error(`Canonical renderer did not create ${type} ${name}.`);
            }
            if (type === 'plot') {
                plotBuilders.buildPlot(spec, host);
            } else {
                adaptControl(ui, host, spec);
            }
        }
    };

    const adaptControl = function(ui: PreviewUI, host: HTMLElement, spec: RuntimeElementSpec): void {
        const name = asText(spec.name);
        const type = asText(spec.type).toLowerCase();
        const content = host.firstElementChild as HTMLElement | null;
        const control = createRuntimeControl(name, {
            kind: type,
            host,
            group: type === 'radio' ? asText(spec.radioGroup || spec.group) : undefined,
            variableType: asText(spec.variableType, 'any'),
            parentContainer: asText(spec.parentContainer),
            dataSource: asText(spec.dataSource, 'custom'),
            dataValue: asText(spec.dataValue),
            dataList: [] as string[],
            selectionMode: asText(spec.selection, 'multiple'),
            sortable: type === 'choice' ? asBoolean(spec.sortable) : undefined,
            ordering: type === 'choice' ? spec.ordering : undefined,
            selection: asText(spec.selection),
            autoSearchEnabled: false,
            searchQuery: '',
            __scriptItems: [] as string[],
            setValue: (_value: unknown): void => {},
            setOptions: (_values: unknown): void => {},
            makeDataSetList: (_data: Record<string, unknown>): void => {},
            makeVarialeSetList: (_payload: { selected?: string[]; data?: Record<string, Record<string, unknown>> }): void => {},
            applySearchFilter: (): void => {},
            updateOptionsFromR: (_data: Record<string, unknown>): void => {},
            element: { cover: makeNodeFacade(host), txt: makeNodeFacade(content, { text: true }) }
        });
        lifecycle.registerCommonState(control, spec);
        lifecycle.wireConditions(control, spec);
        const position = { left: host.style.left, top: host.style.top };
        lifecycle.applyPosition(host, spec);
        host.style.left = position.left;
        host.style.top = position.top;
        // applyPosition stores resize metadata; the renderer owns actual layout.
        host.dataset.controlName = name;
        host.dataset.controlType = type;

        const emit = function(status: string): void {
            if (!control.initialize) {
                runtime.events.emit('iSpeak', { name, status });
            }
        };
        const selected = (): unknown => ui.getSelected(name);
        const readValue = (): unknown => {
            if (type === 'container') {
                return selected();
            }
            if (type === 'slider') {
                return Number(host.dataset.handlepos || 50) / 100;
            }
            return ui.getValue(name);
        };
        const setValue = function(value: unknown): void {
            if (type === 'container') {
                ui.setSelected(name, asStringArray(value));
            }
            else {
                ui.setValue(name, value);
            }
            emit('value');
        };
        control.setValue = setValue;
        Object.defineProperty(control, 'value', { get: readValue, configurable: true });
        Object.defineProperty(control, 'visible', { get: () => ui.isVisible(name), set: () => {}, configurable: true });
        Object.defineProperty(control, 'enabled', { get: () => ui.isEnabled(name), set: () => {}, configurable: true });
        control.show = () => { ui.show(name); emit('show'); };
        control.hide = () => { ui.hide(name); emit('hide'); };
        control.enable = () => { ui.enable(name); emit('enable'); };
        control.disable = () => { ui.disable(name); emit('disable'); };
        if (type === 'checkbox') {
            Object.defineProperty(control, 'checked', { get: () => ui.isChecked(name), configurable: true });
            control.check = () => { ui.check(name); emit('check'); };
            control.uncheck = () => { ui.uncheck(name); emit('uncheck'); };
            runtime.dialogDefaultData[name].checked = ui.isChecked(name);
        }
        if (type === 'radio') {
            Object.defineProperty(control, 'selected', { get: () => ui.isChecked(name), configurable: true });
            control.native = host.querySelector<HTMLInputElement>('input[type="radio"]') || undefined;
            control.custom = host.querySelector<HTMLElement>('.custom-radio') || undefined;
            control.select = () => { ui.check(name); emit('select'); };
            control.deselect = () => { ui.uncheck(name); emit('deselect'); };
            runtime.dialogDefaultData[name].selected = ui.isChecked(name);
            const group = asText(spec.radioGroup || spec.group);
            runtime.radios[group] ||= {};
            runtime.radios[group][name] = true;
        }
        if (type === 'choice') {
            Object.defineProperty(control, 'selected', { get: selected, configurable: true });
        }
        if (type === 'container' || type === 'select') {
            control.setOptions = function(values: unknown): void {
                const previous = selected();
                const entries = Array.isArray(values) ? values : [];
                ui.setValue(name, entries);
                control.dataList = entries.map((value) => typeof value === 'object' && value ? String((value as ContainerItemDescriptor).name) : String(value));
                control.__scriptItems = control.dataList.slice();
                if (type === 'container') {
                    ui.setSelected(name, asStringArray(previous).filter((value) => control.dataList.includes(value)));
                }
                runtime.retryPendingRestore();
            };
            control.makeDataSetList = (data) => control.setOptions(Object.keys(data || {}));
            control.makeVarialeSetList = function(payload): void {
                const entries: ContainerItemDescriptor[] = [];
                for (const dataset of payload.selected || []) {
                    const data = payload.data?.[dataset] || {};
                    const columns = Array.isArray(data.colnames) ? data.colnames : [];
                    const flags = Array.isArray(data[control.variableType]) ? data[control.variableType] as unknown[] : [];
                    columns.forEach((column, index) => entries.push({ name: String(column), enabled: flags[index] !== false }));
                }
                control.setOptions(entries);
            };
            control.updateOptionsFromR = function(data): void {
                const values = control.dataValue === 'all' ? Object.values(data).flat() : data[control.dataValue];
                control.setOptions(values);
            };
            control.applySearchFilter = () => { ui.enableSearch(name); };
            control.dataList = type === 'select'
                ? Array.from(host.querySelectorAll('option')).map((option) => option.value)
                : asStringArray(ui.getValue(name));
            control.__scriptItems = control.dataList.slice();
        }
        if (type === 'label' || type === 'button') {
            control.element.txt.attr = function(payload): string {
                if (typeof payload === 'string') {
                    return String(type === 'label' ? ui.getValue(name) : content?.textContent || '');
                }
                if (payload && typeof payload === 'object' && 'text' in payload) {
                    const text = String(payload.text);
                    if (type === 'label') { ui.setValue(name, text); }
                    else { ui.setLabel(name, text); }
                }
                return '';
            };
        }
        if (type === 'group') {
            control.memberNames = asStringArray(spec.elementIds);
        }
        runtime.dialogDefaultData[name].value = readValue();
        host.addEventListener('change', () => emit(type === 'radio' ? 'select' : type === 'checkbox' ? (ui.isChecked(name) ? 'check' : 'uncheck') : 'value'));
        host.addEventListener('input', () => emit('input'));
        if (type === 'button') {
            host.addEventListener('click', () => {
                if (control.enabled) {
                    runtime.events.emit('iSpeakButton', { name, type: asText(spec.onClick, 'run') });
                }
            });
        }
        control.initialize = false;
        runtime.objList[name] = control;
    };

    return { render, dispose: (): void => { renderer?.dispose(); renderer = null; } };
}
