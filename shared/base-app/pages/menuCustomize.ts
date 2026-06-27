export {};

type MenuNode = {
  id: string;
  name: string;
  labelKey?: string;
  type: 'system' | 'dialog' | 'submenu';
  position: number;
  subitems?: MenuNode[];
  runtimeProvider?: string;
  shortcut?: string;
  dependencies?: string;
  icon?: string;
  builtIn?: boolean;
  locked?: boolean;
};

let tree: MenuNode[] = [];
let selectedPath: number[] = [];
let dialogs: Array<{ id: string; name: string; type: string }> = [];
let defaultRuntimeProvider = '';
let expandedNodes = new Set<string>();
let draggingPathKey = '';
let expandHoverTimer: ReturnType<typeof setTimeout> | null = null;
let expandHoverPathKey = '';
let renamingPathKey = '';
let t = (key: string) => key;
let strings: Record<string, string> = {};

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
};

const normalizePositions = (items: MenuNode[]) => {
  const arr = Array.isArray(items) ? items : [];
  for (let i = 0; i < arr.length; i++) {
    arr[i].position = i;
    if (Array.isArray(arr[i].subitems)) normalizePositions(arr[i].subitems as MenuNode[]);
  }
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const pathKey = (path: number[]) => path.join('.');
const parsePathKey = (key: string): number[] => {
  if (!key) return [];
  return key.split('.').map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0);
};
const parentPathKeys = (path: number[]) => {
  const keys: string[] = [];
  for (let i = 1; i <= path.length; i += 1) keys.push(pathKey(path.slice(0, i)));
  return keys;
};
const shiftExpandedTopLevelOnInsertAt0 = () => {
  const next = new Set<string>();
  expandedNodes.forEach((key) => {
    const parts = String(key || '').split('.');
    if (!parts.length || parts[0] === '') return;
    const first = Number(parts[0]);
    if (!Number.isInteger(first) || first < 0) return;
    parts[0] = String(first + 1);
    next.add(parts.join('.'));
  });
  expandedNodes = next;
};
const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const isPrefixPath = (prefix: number[], full: number[]) => {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
};
const remapPathAfterSiblingRemoval = (removedPath: number[], targetPath: number[]): number[] => {
  if (!removedPath.length || !targetPath.length) return [...targetPath];
  const remParent = removedPath.slice(0, -1);
  const tarParent = targetPath.slice(0, -1);
  if (!samePath(remParent, tarParent)) return [...targetPath];
  const remIndex = removedPath[removedPath.length - 1];
  const tarIndex = targetPath[targetPath.length - 1];
  if (remIndex < tarIndex) {
    const next = [...targetPath];
    next[next.length - 1] = tarIndex - 1;
    return next;
  }
  return [...targetPath];
};

const getNodeByPath = (path: number[]): MenuNode | null => {
  let cur: any = tree;
  for (let i = 0; i < path.length; i++) {
    const idx = Number(path[i]);
    if (!Array.isArray(cur) || idx < 0 || idx >= cur.length) return null;
    const node = cur[idx];
    if (i === path.length - 1) return node;
    cur = node.subitems || [];
  }
  return null;
};

const getParentArrayByPath = (path: number[]): MenuNode[] => {
  if (path.length <= 1) return tree;
  const parentNode = getNodeByPath(path.slice(0, -1));
  if (!parentNode) return tree;
  if (!Array.isArray(parentNode.subitems)) parentNode.subitems = [];
  return parentNode.subitems as MenuNode[];
};
const getArrayByParentPath = (parentPath: number[]): MenuNode[] => {
  if (!parentPath.length) return tree;
  const parentNode = getNodeByPath(parentPath);
  if (!parentNode) return tree;
  if (!Array.isArray(parentNode.subitems)) parentNode.subitems = [];
  return parentNode.subitems as MenuNode[];
};

const selectedNode = () => getNodeByPath(selectedPath);
const isLockedNode = (node: MenuNode | null | undefined): boolean => Boolean(node?.locked);
const updateSelectedTreeLabel = () => {
  const key = pathKey(selectedPath);
  const node = selectedNode();
  if (!key || !node) return;
  const label = document.querySelector(`.tree__item[data-path="${key}"] .tree__label`) as HTMLElement | null;
  if (!label) return;
  label.textContent = node.type === 'system' && node.id === 'separator'
    ? '────────'
    : `${node.name || '(unnamed)'}`;
};

const newMenuName = () => {
  let n = 1;
  while (true) {
    const base = t('New menu');
    const candidate = n === 1 ? base : `${base} ${n}`;
    const exists = tree.some((x) => String(x.name || '').toLowerCase() === String(candidate).toLowerCase());
    if (!exists) return String(candidate);
    n += 1;
  }
};

const dialogTitleById = (id: string): string => {
  const dialogId = String(id || '').trim();
  if (!dialogId) return '';
  const one = dialogs.find((d) => String(d.id || '') === dialogId);
  return String(one?.name || dialogId);
};

const startInlineRename = (path: number[], labelEl: HTMLElement) => {
  const node = getNodeByPath(path);
  if (!node) return;
  if (node.type === 'system' && node.id === 'separator') return;
  if (isLockedNode(node)) return;
  const key = pathKey(path);
  if (renamingPathKey && renamingPathKey !== key) return;
  renamingPathKey = key;

  const currentName = String(node.name || '');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'tree-inline-rename';
  input.style.width = '100%';
  input.style.font = 'inherit';
  input.style.padding = '0 2px';
  input.style.margin = '0';
  input.style.border = '1px solid #7aa7d8';
  input.style.background = '#fff';

  const finish = (commit: boolean) => {
    if (!renamingPathKey) return;
    renamingPathKey = '';
    const next = String(input.value || '').trim();
    if (commit && next) node.name = next;
    renderTree();
    syncPropsFromSelection();
  };

  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));

  labelEl.textContent = '';
  labelEl.appendChild(input);
  input.focus();
  input.select();
};

const renderTree = () => {
  const wrap = byId<HTMLDivElement>('treeWrap');
  wrap.innerHTML = '';
  wrap.setAttribute('role', 'tree');
  wrap.tabIndex = 0;
  wrap.ondragover = (event: DragEvent) => {
    if (!draggingPathKey) return;
    event.preventDefault();
  };
  const clearDropIndicators = () => {
    wrap.querySelectorAll('.tree__row.is-drop-target, .tree__row.drop-before, .tree__row.drop-after, .tree__row.drop-inside')
      .forEach((el) => el.classList.remove('is-drop-target', 'drop-before', 'drop-after', 'drop-inside'));
  };

  const visiblePaths: number[][] = [];

  const renderItems = (items: MenuNode[], basePath: number[], host: HTMLElement) => {
    items.forEach((node, idx) => {
      const path = [...basePath, idx];
      const key = pathKey(path);
      visiblePaths.push(path);

      const li = document.createElement('li');
      li.className = 'tree__item';
      li.setAttribute('role', 'treeitem');
      li.dataset.path = key;

      const hasChildren = node.type === 'submenu';
      const isExpanded = hasChildren && expandedNodes.has(key);
      if (hasChildren) li.setAttribute('aria-expanded', String(isExpanded));
      if (key === pathKey(selectedPath)) {
        li.classList.add('is-selected');
        li.setAttribute('aria-selected', 'true');
      }

      const row = document.createElement('div');
      row.className = 'tree__row';
      row.dataset.path = key;
      row.draggable = true;
      row.onclick = () => {
        const oldKey = pathKey(selectedPath);
        selectedPath = path;
        parentPathKeys(path.slice(0, -1)).forEach((k) => expandedNodes.add(k));
        const nextKey = pathKey(path);
        if (oldKey !== nextKey) {
          const prevEl = wrap.querySelector(`.tree__item[data-path="${oldKey}"]`) as HTMLElement | null;
          const nextEl = wrap.querySelector(`.tree__item[data-path="${nextKey}"]`) as HTMLElement | null;
          if (prevEl) {
            prevEl.classList.remove('is-selected');
            prevEl.removeAttribute('aria-selected');
          }
          if (nextEl) {
            nextEl.classList.add('is-selected');
            nextEl.setAttribute('aria-selected', 'true');
          }
        }
        syncPropsFromSelection();
      };

      const disclosure = document.createElement('span');
      disclosure.className = `tree__disclosure${hasChildren ? '' : ' is-leaf'}`;
      disclosure.title = hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : '';
      disclosure.onclick = (event) => {
        event.stopPropagation();
        if (!hasChildren) return;
        if (expandedNodes.has(key)) expandedNodes.delete(key);
        else expandedNodes.add(key);
        renderTree();
      };

      const label = document.createElement('span');
      label.className = 'tree__label';
      label.textContent = node.type === 'system' && node.id === 'separator'
        ? '────────'
        : `${node.name || '(unnamed)'}`;
      label.ondblclick = (event) => {
        event.stopPropagation();
        startInlineRename(path, label);
      };

      const dragHandle = document.createElement('span');
      dragHandle.className = 'tree__drag-handle';
      dragHandle.textContent = '⋮⋮';
      dragHandle.title = 'Drag to reorder';
      dragHandle.draggable = true;
      dragHandle.onclick = (event) => event.stopPropagation();
      dragHandle.ondblclick = (event) => event.stopPropagation();

      row.appendChild(disclosure);
      row.appendChild(label);
      row.appendChild(dragHandle);
      li.appendChild(row);

      const onDragStart = (event: DragEvent) => {
        draggingPathKey = key;
        li.classList.add('is-dragging');
        try {
          event.dataTransfer?.setData('text/plain', key);
          event.dataTransfer!.effectAllowed = 'move';
        } catch {}
        try { console.log('[menu-dnd] dragstart', { key }); } catch {}
      };
      const onDragEnd = () => {
        draggingPathKey = '';
        li.classList.remove('is-dragging');
        clearDropIndicators();
        if (expandHoverTimer) {
          clearTimeout(expandHoverTimer);
          expandHoverTimer = null;
        }
        expandHoverPathKey = '';
      };
      row.ondragstart = onDragStart;
      dragHandle.ondragstart = onDragStart;
      row.ondragend = onDragEnd;
      dragHandle.ondragend = onDragEnd;
      const applyDropIndicator = (event: DragEvent) => {
        if (!draggingPathKey) return;
        event.preventDefault();
        clearDropIndicators();
        row.classList.add('is-drop-target');
        const rect = row.getBoundingClientRect();
        const y = event.clientY - rect.top;
        let zone: 'before' | 'inside' | 'after' = 'after';
        if (hasChildren && y > rect.height * 0.30 && y < rect.height * 0.70) zone = 'inside';
        else zone = y < rect.height / 2 ? 'before' : 'after';
        row.dataset.dropPos = zone;
        row.classList.add(zone === 'inside' ? 'drop-inside' : (zone === 'before' ? 'drop-before' : 'drop-after'));
        if (zone === 'inside' && hasChildren && !expandedNodes.has(key)) {
          if (expandHoverPathKey !== key) {
            if (expandHoverTimer) clearTimeout(expandHoverTimer);
            expandHoverPathKey = key;
            expandHoverTimer = setTimeout(() => {
              expandedNodes.add(key);
              renderTree();
            }, 450);
          }
        } else if (expandHoverPathKey && expandHoverPathKey !== key) {
          if (expandHoverTimer) clearTimeout(expandHoverTimer);
          expandHoverTimer = null;
          expandHoverPathKey = '';
        }
      };
      row.ondragover = applyDropIndicator;
      row.ondragleave = () => {
        row.classList.remove('is-drop-target', 'drop-before', 'drop-after', 'drop-inside');
      };
      const handleDrop = (event: DragEvent) => {
        event.preventDefault();
        clearDropIndicators();
        if (expandHoverTimer) {
          clearTimeout(expandHoverTimer);
          expandHoverTimer = null;
        }
        expandHoverPathKey = '';
        const src = parsePathKey((event.dataTransfer?.getData('text/plain') || draggingPathKey || '').trim());
        const dst = parsePathKey(key);
        try { console.log('[menu-dnd] drop', { src, dst, key, draggingPathKey }); } catch {}
        if (!src.length || !dst.length) return;
        if (samePath(src, dst)) return;
        if (isPrefixPath(src, dst)) return;
        const dropPos = (row.dataset.dropPos || 'after') as 'before' | 'inside' | 'after';

        const srcParent = src.slice(0, -1);
        const srcArr = getArrayByParentPath(srcParent);
        const srcIndex = src[src.length - 1];
        if (srcIndex < 0 || srcIndex >= srcArr.length) return;
        const moved = srcArr.splice(srcIndex, 1)[0];
        if (!moved) return;
        const dstRemapped = remapPathAfterSiblingRemoval(src, dst);

        let nextSelectedPath: number[] = [];
        if (dropPos === 'inside' && node.type === 'submenu') {
          const dstArr = getArrayByParentPath(dstRemapped);
          let insertAt = dstArr.length;
          const clamped = Math.max(0, Math.min(dstArr.length, insertAt));
          dstArr.splice(clamped, 0, moved);
          expandedNodes.add(pathKey(dstRemapped));
          nextSelectedPath = [...dstRemapped, clamped];
        } else {
          const dstParent = dstRemapped.slice(0, -1);
          const dstArr = getArrayByParentPath(dstParent);
          const dstIndex = dstRemapped[dstRemapped.length - 1];
          const insertAt = dropPos === 'before' ? dstIndex : (dstIndex + 1);
          const clamped = Math.max(0, Math.min(dstArr.length, insertAt));
          dstArr.splice(clamped, 0, moved);
          nextSelectedPath = [...dstParent, clamped];
        }

        normalizePositions(tree);
        selectedPath = nextSelectedPath;
        parentPathKeys(selectedPath.slice(0, -1)).forEach((k) => expandedNodes.add(k));
        renderTree();
        syncPropsFromSelection();
      };
      row.ondrop = handleDrop;

      if (hasChildren && isExpanded) {
        const children = document.createElement('ul');
        children.className = 'tree__group';
        li.appendChild(children);
        renderItems(Array.isArray(node.subitems) ? node.subitems : [], path, children);
      }
      host.appendChild(li);
    });
  };

  const root = document.createElement('ul');
  root.className = 'tree';
  renderItems(tree, [], root);
  wrap.appendChild(root);

  wrap.onkeydown = (event: KeyboardEvent) => {
    if (!visiblePaths.length) return;
    const current = pathKey(selectedPath);
    let index = visiblePaths.findIndex((p) => pathKey(p) === current);
    if (index < 0) index = 0;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      index = Math.min(visiblePaths.length - 1, index + 1);
      selectedPath = [...visiblePaths[index]];
      renderTree();
      syncPropsFromSelection();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      index = Math.max(0, index - 1);
      selectedPath = [...visiblePaths[index]];
      renderTree();
      syncPropsFromSelection();
      return;
    }
    const node = getNodeByPath(selectedPath);
    if (!node) return;
    const key = pathKey(selectedPath);
    if (event.key === 'ArrowRight' && node.type === 'submenu') {
      event.preventDefault();
      if (!expandedNodes.has(key)) {
        expandedNodes.add(key);
        renderTree();
      } else if (Array.isArray(node.subitems) && node.subitems.length) {
        selectedPath = [...selectedPath, 0];
        renderTree();
        syncPropsFromSelection();
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (node.type === 'submenu' && expandedNodes.has(key)) {
        expandedNodes.delete(key);
        renderTree();
        return;
      }
      if (selectedPath.length > 1) {
        selectedPath = selectedPath.slice(0, -1);
        renderTree();
        syncPropsFromSelection();
      }
    }
  };
};

const syncPropsFromSelection = () => {
  const node = selectedNode();
  const labelEl = byId<HTMLInputElement>('propLabel');
  const dialogFileEl = byId<HTMLInputElement>('propDialogFile');
  const shortcutEl = byId<HTMLInputElement>('propShortcut');
  const depsEl = byId<HTMLInputElement>('propDependencies');
  const iconEl = byId<HTMLInputElement>('propIcon');
  const browseEl = byId<HTMLButtonElement>('browseDialog');
  const removeBtn = byId<HTMLButtonElement>('removeNode');

  if (!node) {
    labelEl.value = '';
    dialogFileEl.value = '';
    byId<HTMLInputElement>('propRuntimeProvider').value = '';
    shortcutEl.value = '';
    depsEl.value = '';
    iconEl.value = '';
    browseEl.disabled = true;
    removeBtn.disabled = true;
    return;
  }

  const locked = isLockedNode(node);
  labelEl.value = String(node.name || '');
  dialogFileEl.value = node.type === 'dialog' && node.id
    ? `${String(node.id || '').trim()}.json`
    : '';
  shortcutEl.value = String(node.shortcut || '');
  depsEl.value = String(node.dependencies || '');
  iconEl.value = String(node.icon || '');

  browseEl.disabled = locked || node.type !== 'dialog';
  depsEl.disabled = locked || node.type !== 'dialog';
  const runtimeProviderEl = byId<HTMLInputElement>('propRuntimeProvider');
  runtimeProviderEl.disabled = locked || node.type !== 'dialog';
  runtimeProviderEl.value = node.type === 'dialog'
    ? String(node.runtimeProvider || defaultRuntimeProvider || '')
    : '';
  shortcutEl.disabled = locked || node.type === 'submenu';
  labelEl.disabled = locked;
  iconEl.disabled = locked;
  removeBtn.disabled = locked;
};

const applyProps = () => {
  const node = selectedNode();
  if (!node) return;
  const labelEl = byId<HTMLInputElement>('propLabel');
  const runtimeProviderEl = byId<HTMLInputElement>('propRuntimeProvider');
  const shortcutEl = byId<HTMLInputElement>('propShortcut');
  const depsEl = byId<HTMLInputElement>('propDependencies');
  const iconEl = byId<HTMLInputElement>('propIcon');

  if (isLockedNode(node)) return;
  if (!(node.type === 'system' && node.id === 'separator')) {
    node.name = String(labelEl.value || '').trim() || node.name || t('Unnamed');
  }
  if (node.type === 'dialog') {
    node.id = String(node.id || '').trim();
    node.runtimeProvider = String(runtimeProviderEl.value || '').trim() || undefined;
    node.dependencies = String(depsEl.value || '').trim();
  } else {
    delete node.runtimeProvider;
    delete node.dependencies;
  }
  node.shortcut = String(shortcutEl.value || '').trim();
  node.icon = String(iconEl.value || '').trim();
};

const applyPropsLive = (options?: { rerender?: boolean }) => {
  const nodeBefore = selectedNode();
  const oldPath = pathKey(selectedPath);
  applyProps();
  const nodeAfter = selectedNode();
  if (!nodeAfter) return;

  if (options?.rerender) {
    renderTree();
    syncPropsFromSelection();
    return;
  }

  if (oldPath === pathKey(selectedPath)) updateSelectedTreeLabel();
};

const addTopMenu = () => {
  const node: MenuNode = {
    id: `top-${Date.now()}`,
    name: newMenuName(),
    type: 'submenu',
    position: 0,
    subitems: []
  };
  shiftExpandedTopLevelOnInsertAt0();
  tree.unshift(node);
  normalizePositions(tree);
  selectedPath = [0];
  expandedNodes.add(pathKey(selectedPath));
  renderTree();
  syncPropsFromSelection();
};

const addChildNode = (child: MenuNode) => {
  if (!selectedPath.length) {
    if (child.type !== 'submenu') {
      window.alert(t('Please add/select a target menu first.'));
      return;
    }
    tree.push(child);
    normalizePositions(tree);
    selectedPath = [tree.length - 1];
    renderTree();
    syncPropsFromSelection();
    return;
  }
  const node = selectedNode();
  if (!node) return;
  if (node.type === 'submenu') {
    if (isLockedNode(node) && !selectedPath.length) {
      window.alert(t('This menu item is built in and cannot be changed here.'));
      return;
    }
    if (!Array.isArray(node.subitems)) node.subitems = [];
    node.subitems.push(child);
    normalizePositions(tree);
    selectedPath = [...selectedPath, (node.subitems.length - 1)];
    expandedNodes.add(pathKey(selectedPath.slice(0, -1)));
    renderTree();
    syncPropsFromSelection();
    return;
  }

  // Insert as sibling after selected non-container item.
  const parent = getParentArrayByPath(selectedPath);
  const at = Number(selectedPath[selectedPath.length - 1] || 0);
  parent.splice(at + 1, 0, child);
  normalizePositions(tree);
  selectedPath[selectedPath.length - 1] = at + 1;
  renderTree();
  syncPropsFromSelection();
};

const removeSelected = () => {
  if (!selectedPath.length) return;
  const node = selectedNode();
  if (isLockedNode(node)) {
    window.alert(t('This menu item is built in and cannot be removed.'));
    return;
  }
  const parent = getParentArrayByPath(selectedPath);
  const at = Number(selectedPath[selectedPath.length - 1] || 0);
  if (at < 0 || at >= parent.length) return;
  parent.splice(at, 1);
  normalizePositions(tree);
  if (!parent.length) {
    selectedPath = selectedPath.slice(0, -1);
  } else {
    selectedPath[selectedPath.length - 1] = Math.max(0, at - 1);
  }
  renderTree();
  syncPropsFromSelection();
};

const moveSelected = (delta: number) => {
  if (!selectedPath.length) return;
  const parent = getParentArrayByPath(selectedPath);
  const at = Number(selectedPath[selectedPath.length - 1] || 0);
  const next = at + delta;
  if (next < 0 || next >= parent.length) return;
  const item = parent[at];
  parent.splice(at, 1);
  parent.splice(next, 0, item);
  normalizePositions(tree);
  selectedPath[selectedPath.length - 1] = next;
  renderTree();
  syncPropsFromSelection();
};

const normalizeIncomingMenuNode = (value: any, fallbackId: string): MenuNode => {
  const inferredType = String(value?.type || (Array.isArray(value?.subitems) ? 'submenu' : (String(value?.submenu || '').trim() ? 'dialog' : 'system')));
  const rawName = String(value?.name || value?.label || value?.id || value?.submenu || '').trim();
  const cleanName = String(rawName || fallbackId).replace(/[&_]/g, '').trim();
  const nextId = String(value?.id || '').trim() || cleanName || fallbackId;
  const rawSubitems = Array.isArray(value?.subitems) ? value.subitems : [];
  const builtIn = Boolean(value?.builtIn);
  const locked = Boolean(value?.locked);
  return {
    id: nextId,
    name: cleanName,
    labelKey: String(value?.labelKey || '').trim(),
    type: inferredType === 'dialog' || inferredType === 'system' || inferredType === 'submenu' ? inferredType : 'system',
    position: Number.isFinite(Number(value?.position)) ? Number(value.position) : 0,
    runtimeProvider: String(value?.runtimeProvider || '').trim() || undefined,
    shortcut: String(value?.shortcut || '').trim() || undefined,
    dependencies: String(value?.dependencies || '').trim() || undefined,
    icon: String(value?.icon || '').trim() || undefined,
    builtIn,
    locked,
    subitems: rawSubitems.map((child: any, index: number) => normalizeIncomingMenuNode(child, `${nextId}-${index}`))
  };
};

const toSerializableMenu = (items: MenuNode[]): any[] => {
  const mapItem = (n: MenuNode, idx: number) => {
    const out: any = {
      id: String(n.id || ''),
      name: String(n.name || ''),
      labelKey: String(n.labelKey || ''),
      type: n.type,
      position: idx
    };
    if (n.builtIn) out.builtIn = true;
    if (n.locked) out.locked = true;
    if (n.type === 'dialog') {
      const runtimeProvider = String(n.runtimeProvider || '').trim();
      if (runtimeProvider && runtimeProvider !== defaultRuntimeProvider) {
        out.runtimeProvider = runtimeProvider;
      }
    }
    if (n.shortcut) out.shortcut = String(n.shortcut);
    if (n.icon) out.icon = String(n.icon);
    if (n.dependencies) out.dependencies = String(n.dependencies);
    if (n.type === 'submenu') {
      out.subitems = toSerializableMenu(Array.isArray(n.subitems) ? n.subitems : []);
    }
    return out;
  };
  return (Array.isArray(items) ? items : []).map((n, i) => mapItem(n, i));
};

const saveMenu = () => {
  applyProps();
  const invalidRuntimeProvider = (() => {
    const stack: MenuNode[] = [...tree];

    while (stack.length > 0) {
      const node = stack.shift();

      if (!node) {
        continue;
      }

      if (node.type === 'dialog') {
        const runtimeProvider = String(node.runtimeProvider || '').trim();
        if (
          runtimeProvider &&
          defaultRuntimeProvider &&
          runtimeProvider !== defaultRuntimeProvider
        ) {
          return node;
        }
      }

      if (node.type === 'dialog' && !String(node.runtimeProvider || '').trim()) {
        return node;
      }

      if (Array.isArray(node.subitems) && node.subitems.length > 0) {
        stack.unshift(...node.subitems);
      }
    }

    return null;
  })();

  if (invalidRuntimeProvider) {
    window.alert(
      t('Runtime Provider must match the product runtime provider for dialog items.')
        + ` ${String(invalidRuntimeProvider.name || invalidRuntimeProvider.id || t('Unnamed'))}`
    );
    return;
  }

  const missingRuntimeProvider = (() => {
    const stack: MenuNode[] = [...tree];

    while (stack.length > 0) {
      const node = stack.shift();

      if (!node) {
        continue;
      }

      if (node.type === 'dialog' && !String(node.runtimeProvider || '').trim() && !defaultRuntimeProvider) {
        return node;
      }

      if (Array.isArray(node.subitems) && node.subitems.length > 0) {
        stack.unshift(...node.subitems);
      }
    }

    return null;
  })();

  if (missingRuntimeProvider) {
    window.alert(
      t('Runtime Provider is required for dialog items when the product has no default runtime provider.')
        + ` ${String(missingRuntimeProvider.name || missingRuntimeProvider.id || t('Unnamed'))}`
    );
    return;
  }

  const payload = toSerializableMenu(tree).map((x, i) => ({
    id: String(x.id || `top-${i}`),
    name: String(x.name || ''),
    labelKey: String(x.labelKey || ''),
    type: 'submenu',
    position: i,
    subitems: Array.isArray(x.subitems) ? x.subitems : []
  }));
  window.dialogForge.menuCustomization.save({
    menu: payload,
    runtimeProvider: defaultRuntimeProvider
  });
};

const applyLocalizedTexts = () => {
  try { document.title = t('Customize the menu'); } catch {}
  byId<HTMLDivElement>('paneHeadStructure').textContent = t('Menu Structure');
  byId<HTMLDivElement>('paneHeadProperties').textContent = t('Properties');
  byId<HTMLDivElement>('hintRenameNode').textContent = t('Double-click a node to rename it.');
  byId<HTMLLabelElement>('labelPropLabel').textContent = t('Label');
  byId<HTMLLabelElement>('labelPropDialogFile').textContent = t('Dialog Package');
  byId<HTMLLabelElement>('labelPropRuntimeProvider').textContent = t('Runtime Provider');
  byId<HTMLLabelElement>('labelPropShortcut').textContent = t('Shortcut');
  byId<HTMLLabelElement>('labelPropDependencies').textContent = t('Dependencies (packages)');
  byId<HTMLLabelElement>('labelPropIcon').textContent = t('Icon (optional path)');

  byId<HTMLInputElement>('propDialogFile').placeholder = t('No file selected');
  byId<HTMLInputElement>('propRuntimeProvider').placeholder = t('blank');
  byId<HTMLInputElement>('propShortcut').placeholder = t('e.g. CmdOrCtrl+Shift+R');
  byId<HTMLInputElement>('propDependencies').placeholder = t('pkg1, pkg2');

  const setBtn = (id: string, label: string) => {
    const btn = byId<HTMLButtonElement>(id);
    btn.title = t(label);
    btn.setAttribute('aria-label', t(label));
  };
  setBtn('addTopMenu', 'Add Menu');
  setBtn('addDialogItem', 'Add Dialog Item');
  setBtn('addSeparator', 'Add Separator');
  setBtn('removeNode', 'Remove');
  setBtn('moveUp', 'Move Up');
  setBtn('moveDown', 'Move Down');

  byId<HTMLSpanElement>('srAddMenu').textContent = t('Add Menu');
  byId<HTMLSpanElement>('srAddDialogItem').textContent = t('Add Dialog Item');
  byId<HTMLSpanElement>('srAddSeparator').textContent = t('Add Separator');
  byId<HTMLSpanElement>('srRemove').textContent = t('Remove');
  byId<HTMLSpanElement>('srMoveUp').textContent = t('Move Up');
  byId<HTMLSpanElement>('srMoveDown').textContent = t('Move Down');

  byId<HTMLButtonElement>('browseDialog').textContent = t('Browse...');
  byId<HTMLButtonElement>('saveMenu').textContent = t('Save');
  byId<HTMLButtonElement>('cancelMenu').textContent = t('Cancel');
};

window.dialogForge.menuCustomization.onLoaded((args: unknown) => {
  const payloadArgs = args as any;
  strings = payloadArgs?.strings && typeof payloadArgs.strings === "object"
    ? payloadArgs.strings
    : {};
  t = (key: string) => String(strings[key] || key);
  applyLocalizedTexts();
  defaultRuntimeProvider = String(
    payloadArgs?.defaultRuntimeProvider
    || payloadArgs?.runtimeProvider
    || ''
  ).trim();

  dialogs = Array.isArray(payloadArgs?.newItemList)
    ? payloadArgs.newItemList.filter((x: any) => String(x?.type || '') === 'dialog')
    : [];

  const incoming = Array.isArray(payloadArgs?.currentMenu)
    ? payloadArgs.currentMenu
    : [];
  tree = clone(incoming).map((x: any, index: number) => normalizeIncomingMenuNode(x, `top-${index}`));
  if (!tree.length) {
    tree = [{
      id: 'top-file',
      name: 'File',
      type: 'submenu',
      position: 0,
      subitems: []
    }];
  }
  normalizePositions(tree);
  selectedPath = [0];
  expandedNodes = new Set(tree.map((_, i) => String(i)));
  renderTree();
  syncPropsFromSelection();
});

window.dialogForge.menuCustomization.onBrowsed((args: unknown) => {
  const payloadArgs = args as any;
  const id = String(payloadArgs?.id || '').trim();
  if (!id) return;
  const name = String(payloadArgs?.name || id).trim() || id;
  const exists = dialogs.some((d) => String(d.id || '') === id);
  if (!exists) dialogs.push({ id, name, type: 'dialog' as const });
  else dialogs = dialogs.map((d) => String(d.id || '') === id ? { ...d, name } : d);
  dialogs.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const node = selectedNode();
  if (node && node.type === 'dialog') {
    node.id = id;
    node.name = dialogTitleById(id);
    byId<HTMLInputElement>('propDialogFile').value = `${id}.dc.zip`;
    byId<HTMLInputElement>('propLabel').value = node.name;
    renderTree();
    syncPropsFromSelection();
  }
});

window.dialogForge.menuCustomization.onSaved((args: unknown) => {
  const payloadArgs = args as any;
  if (payloadArgs?.ok) {
    window.close();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  applyLocalizedTexts();

  byId<HTMLButtonElement>('addTopMenu').onclick = () => addTopMenu();
  byId<HTMLButtonElement>('addDialogItem').onclick = () => addChildNode({
    id: '',
    name: t('New dialog'),
    type: 'dialog',
    position: 0
  });
  byId<HTMLButtonElement>('addSeparator').onclick = () => addChildNode({
    id: 'separator',
    name: '',
    type: 'system',
    position: 0
  });
  byId<HTMLButtonElement>('removeNode').onclick = () => removeSelected();
  byId<HTMLButtonElement>('moveUp').onclick = () => moveSelected(-1);
  byId<HTMLButtonElement>('moveDown').onclick = () => moveSelected(1);
  byId<HTMLButtonElement>('browseDialog').onclick = () => {
    window.dialogForge.menuCustomization.browseDialog();
  };

  const labelEl = byId<HTMLInputElement>('propLabel');
  const runtimeProviderEl = byId<HTMLInputElement>('propRuntimeProvider');
  const shortcutEl = byId<HTMLInputElement>('propShortcut');
  const depsEl = byId<HTMLInputElement>('propDependencies');
  const iconEl = byId<HTMLInputElement>('propIcon');

  labelEl.addEventListener('input', () => applyPropsLive());
  runtimeProviderEl.addEventListener('input', () => applyPropsLive());
  shortcutEl.addEventListener('input', () => applyPropsLive());
  depsEl.addEventListener('input', () => applyPropsLive());
  iconEl.addEventListener('input', () => applyPropsLive());

  byId<HTMLButtonElement>('saveMenu').onclick = () => saveMenu();
  byId<HTMLButtonElement>('cancelMenu').onclick = () => window.close();
});
