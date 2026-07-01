let previewRoot = null;
let lastSuggestedObjectName = '';
let workingDirectory = '';
let homeDirectory = '';
const ENCODING_VALUE_BY_LABEL = {
  'UTF-8': 'utf8',
  'UTF-8-BOM': 'UTF-8-BOM',
  'Latin 1 (ISO-8859-1)': 'latin1',
  'Legacy Windows-1252': 'windows-1252',
  'Multi-byte': 'bytes',
  'As specified in the file': 'default',
  'None': ''
};
const TEXT_EXTENSIONS = ['csv', 'txt', 'tsv', 'tab', 'dat'];
const DDIWR_BINARY_EXTENSIONS = ['sav', 'zsav', 'por', 'dta', 'sas7bdat', 'xpt', 'xls', 'xlsx'];
const RDS_EXTENSIONS = ['rds'];
const SUPPORTED_EXTENSIONS = [...TEXT_EXTENSIONS, ...DDIWR_BINARY_EXTENSIONS, ...RDS_EXTENSIONS];
const UNKNOWN_FILE_TYPE_ERROR = 'Unknown file type';
const filePath = () => String(getValue(input1) || '').trim();
const rFilePath = (value) => String(value || '').replace(/\\/g, '/');
const trimTrailingSlash = (value) => rFilePath(value).replace(/\/+$/g, '');
const isWindowsDrivePath = (value) => /^[A-Za-z]:\//.test(value);
const pathEqualsOrStartsWith = (file, dir) => {
  const cleanFile = rFilePath(file);
  const cleanDir = trimTrailingSlash(dir);
  if (!cleanFile || !cleanDir) return false;
  const left = isWindowsDrivePath(cleanFile) ? cleanFile.toLowerCase() : cleanFile;
  const right = isWindowsDrivePath(cleanDir) ? cleanDir.toLowerCase() : cleanDir;
  return left === right || left.startsWith(right + '/');
};
const relativePathFrom = (file, dir) => {
  const cleanFile = rFilePath(file);
  const cleanDir = trimTrailingSlash(dir);
  if (!pathEqualsOrStartsWith(cleanFile, cleanDir)) return '';
  if (cleanFile.length === cleanDir.length) return '';
  return cleanFile.slice(cleanDir.length + 1);
};
const commandFilePath = (value) => {
  const file = rFilePath(value);
  const cwdRelative = relativePathFrom(file, workingDirectory);
  if (cwdRelative) return cwdRelative;
  const homeRelative = relativePathFrom(file, homeDirectory);
  if (homeRelative) return '~/' + homeRelative;
  return file;
};
const refreshWorkingDirectory = async () => {
  try {
    const out = await getWorkingDirectory();
    const nextPath = typeof out === 'string' ? out : String(out && out.path || '');
    const nextHome = typeof out === 'object' && out ? String(out.home || '') : '';
    if (nextPath) workingDirectory = rFilePath(nextPath);
    if (nextHome) homeDirectory = rFilePath(nextHome);
  } catch {}
};
const formatCall = (name, args) => {
  const callArgs = Array.isArray(args) ? args : [];
  if (callArgs.length === 1) return name + '(' + callArgs[0] + ')';
  return name + '(\n    ' + callArgs.join(',\n    ') + '\n)';
};
const commandDependencies = (command) => /\bconvert\s*\(/.test(String(command || '')) ? ['DDIwR'] : [];
const normalizeDatasetName = (value) => {
  let out = String(value || '').trim().replace(/[^A-Za-z0-9._]/g, '_');
  if (!out) return '';
  out = out.replace(/^[^A-Za-z]+/, '');
  if (!out) return 'dataset';
  if (!/^[A-Za-z]/.test(out)) out = 'd' + out;
  return out;
};
const suggestedDatasetNameFromPath = () => {
  const path = filePath();
  if (!path) return '';
  const parts = path.split(/[\\/]/g);
  const fileName = String(parts[parts.length - 1] || '').trim();
  if (!fileName) return '';
  return normalizeDatasetName(fileName.replace(/\.[^.]*$/, '') || fileName);
};
const datasetName = () => normalizeDatasetName(String(getValue(input2) || '').trim()) || suggestedDatasetNameFromPath() || 'dataset';
const syncSuggestedDatasetName = () => {
  const suggested = suggestedDatasetNameFromPath();
  const current = String(getValue(input2) || '').trim();
  if (!suggested) {
    if (!current) lastSuggestedObjectName = '';
    return;
  }
  if (!current || current === lastSuggestedObjectName) {
    setValue(input2, suggested);
  }
  lastSuggestedObjectName = suggested;
};
const selectedExtension = () => {
  const path = filePath();
  const match = path.match(/\.([^.\\/]+)$/);
  return match ? String(match[1] || '').toLowerCase() : '';
};
const isRdsType = () => RDS_EXTENSIONS.includes(selectedExtension());
const hasKnownFileType = () => {
  const ext = selectedExtension();
  if (!filePath()) return true;
  return SUPPORTED_EXTENSIONS.includes(ext);
};
const shouldUseConvert = () => DDIWR_BINARY_EXTENSIONS.includes(selectedExtension());
const syncFileTypeError = () => {
  if (!filePath()) {
    clearError(input1);
    return true;
  }
  if (hasKnownFileType()) {
    clearError(input1);
    return true;
  }
  addError(input1, UNKNOWN_FILE_TYPE_ERROR);
  return false;
};
const selectedSep = () => {
  if (isChecked(radio1)) return 'comma';
  if (isChecked(radio2)) return 'space';
  if (isChecked(radio3)) return 'tab';
  if (isChecked(radio4)) return String(getValue(input3) || '').trim();
  return 'comma';
};
const selectedDec = () => isChecked(radio6) ? 'comma' : 'dot';
const selectedNa = () => {
  const raw = String(getValue(select1) || 'NA').trim();
  return raw || 'NA';
};
const selectedQuote = () => {
  const raw = String(getValue(select2) || 'Double').trim();
  return raw || 'Double';
};
const selectedComment = () => {
  const raw = String(getValue(select3) || '#').trim();
  return raw || '#';
};
const selectedEncoding = () => {
  const label = String(getValue(select4) || 'None').trim() || 'None';
  return ENCODING_VALUE_BY_LABEL[label] !== undefined ? ENCODING_VALUE_BY_LABEL[label] : label;
};
const isBinaryType = () => isChecked(radio8);
const syncDetectedType = (applyDetected = true) => {
  if (applyDetected) {
    if (shouldUseConvert()) check(radio8);
    else check(radio7);
  }
  enable(radio7);
  enable(radio8);
};
const syncTypeControls = (applyDetected = true) => {
  syncDetectedType(applyDetected);
  const structured = isBinaryType() || isRdsType();
  const binaryDisabled = [checkbox1, checkbox2, checkbox3, radio1, radio2, radio3, radio4, radio5, radio6, select1, select2, select3, input3];
  binaryDisabled.forEach((el) => {
    if (structured) disable(el);
    else enable(el);
  });
  if (!structured) syncCustomSeparatorInput();
};
const syncCustomSeparatorInput = () => {
  if (isChecked(radio4)) {
    enable(input3);
    return;
  }
  disable(input3);
};
const previewPayload = () => {
  if (isRdsType()) {
    return {
      command: 'readRDS',
      file: filePath(),
      nrows: 8,
      binary: false,
      header: true,
      rowNames: 0,
      sep: '',
      quote: '"',
      dec: '.',
      'na.strings': 'NA',
      skip: 0,
      'strip.white': false,
      'comment.char': '',
      fileEncoding: ''
    };
  }
  const sep = selectedSep();
  let command = 'read.table';
  let previewSep = sep;
  if (sep === 'comma') {
    command = 'read.csv';
    previewSep = ',';
  }
  else if (sep === 'tab') {
    command = 'read.delim';
    previewSep = '\t';
  }
  else if (sep === 'space') {
    previewSep = ' ';
  }
  return {
    command,
    file: filePath(),
    nrows: 8,
    binary: isBinaryType(),
    header: isChecked(checkbox1),
    rowNames: isChecked(checkbox2) ? 1 : 0,
    sep: previewSep,
    quote: selectedQuote() === 'Single' ? "'" : selectedQuote() === 'None' ? '' : '"',
    dec: selectedDec() === 'comma' ? ',' : '.',
    'na.strings': selectedNa(),
    skip: 0,
    'strip.white': isChecked(checkbox3),
    'comment.char': selectedComment() === 'Disabled' ? '' : selectedComment(),
    fileEncoding: selectedEncoding()
  };
};
const buildCommand = () => {
  if (!syncFileTypeError()) return '';
  const payload = previewPayload();
  if (!payload.file) return '';
  const escapedFile = JSON.stringify(commandFilePath(payload.file));
  if (isRdsType()) {
    return datasetName() + ' <- ' + formatCall('readRDS', [escapedFile]);
  }
  if (isBinaryType()) {
    const args = [escapedFile];
    if (payload.fileEncoding !== '' && payload.fileEncoding !== 'default') {
      args.push('encoding = ' + JSON.stringify(payload.fileEncoding));
    }
    return datasetName() + ' <- ' + formatCall('convert', args);
  }
  const args = [escapedFile];
  if (payload.command === 'read.table' && payload.header) args.push('header = TRUE');
  if (payload.command !== 'read.table' && !payload.header) args.push('header = FALSE');
  if (payload.rowNames === 1) args.push('row.names = 1');
  if (payload.command === 'read.table' && payload.sep !== '') args.push('sep = ' + JSON.stringify(payload.sep));
  if (payload.quote !== '"') args.push('quote = ' + JSON.stringify(payload.quote));
  if (payload.dec !== '.') args.push('dec = ' + JSON.stringify(payload.dec));
  if (payload['na.strings'] !== 'NA') args.push('na.strings = ' + JSON.stringify(payload['na.strings']));
  if (payload['strip.white']) args.push('strip.white = TRUE');
  if (payload['comment.char'] !== '#') args.push('comment.char = ' + JSON.stringify(payload['comment.char']));
  if (payload.fileEncoding === 'default') args.push('fileEncoding = NULL');
  else if (payload.fileEncoding !== '') args.push('fileEncoding = ' + JSON.stringify(payload.fileEncoding));
  return datasetName() + ' <- ' + formatCall(payload.command, args);
};
const ensurePreviewRoot = () => {
  if (previewRoot && previewRoot.isConnected) return previewRoot;
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '15px';
  host.style.top = '205px';
  host.style.width = '537px';
  host.style.height = '155px';
  host.style.border = '1px solid #b8b8b8';
  host.style.borderRadius = '4px';
  host.style.background = '#ffffff';
  host.style.overflow = 'auto';
  host.style.fontSize = '12px';
  host.style.zIndex = '1';
  document.body.appendChild(host);
  previewRoot = host;
  return host;
};
const renderPreview = (payload) => {
  const root = ensurePreviewRoot();
  root.innerHTML = '';
  const errorMessage = String(payload && payload.error || '').trim();
  if (errorMessage) {
    const message = document.createElement('div');
    message.style.padding = '8px';
    message.style.color = '#444444';
    message.textContent = errorMessage;
    root.appendChild(message);
    return;
  }
  const headers = Array.isArray(payload && payload.colnames) ? payload.colnames.map((x) => String(x)) : [];
  const columns = Array.isArray(payload && payload.vdata) ? payload.vdata : [];
  const maxCols = Math.min(8, headers.length || columns.length || 0);
  if (!maxCols) return;
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.tableLayout = 'fixed';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (let c = 0; c < maxCols; c += 1) {
    const th = document.createElement('th');
    th.textContent = headers[c] || '';
    th.style.textAlign = 'left';
    th.style.padding = '4px 6px';
    th.style.borderBottom = '1px solid #d6d6d6';
    th.style.borderRight = c === maxCols - 1 ? '' : '1px solid #cfcfcf';
    th.style.background = '#ededed';
    th.style.whiteSpace = 'nowrap';
    th.style.overflow = 'hidden';
    th.style.textOverflow = 'ellipsis';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (let r = 0; r < 8; r += 1) {
    const row = document.createElement('tr');
    let hasAny = false;
    for (let c = 0; c < maxCols; c += 1) {
      const td = document.createElement('td');
      const column = Array.isArray(columns[c]) ? columns[c] : [];
      const value = column[r] !== void 0 ? String(column[r]) : '';
      if (value) hasAny = true;
      td.textContent = value;
      td.style.padding = '4px 6px';
      td.style.borderBottom = '1px solid #ececec';
      td.style.borderRight = c === maxCols - 1 ? '' : '1px solid #e0e0e0';
      td.style.whiteSpace = 'nowrap';
      td.style.overflow = 'hidden';
      td.style.textOverflow = 'ellipsis';
      row.appendChild(td);
    }
    if (!hasAny) break;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  root.appendChild(table);
};
const refreshPreview = async () => {
  syncTypeControls();
  const knownType = syncFileTypeError();
  await refreshWorkingDirectory();
  const command = buildCommand();
  updateSyntax(command);
  if (!knownType) {
    renderPreview({ error: UNKNOWN_FILE_TYPE_ERROR });
    return;
  }
  if (!filePath()) {
    renderPreview(null);
    return;
  }
  renderPreview({ error: 'Loading preview...' });
  const out = await getImportPreview(previewPayload());
  renderPreview(out);
};
check(radio1);
check(radio5);
check(radio7);
syncTypeControls();
setValue(select4, 'None');
onClick(browse, async () => {
  const picked = await openImportFile();
  const nextPath = picked && picked.ok ? String(picked.filePath || '') : '';
  if (!nextPath) {
    if (picked && picked.message) addError(input1, String(picked.message));
    return;
  }
  clearError(input1);
  setValue(input1, nextPath);
  syncSuggestedDatasetName();
  await refreshPreview();
});
onChange(input1, () => {
  syncSuggestedDatasetName();
  refreshPreview();
});
onChange(input2, () => updateSyntax(buildCommand()));
onChange(select4, refreshPreview);
onChange(select1, refreshPreview);
onChange(select2, refreshPreview);
onChange(select3, refreshPreview);
onChange(checkbox1, refreshPreview);
onChange(checkbox2, refreshPreview);
onChange(checkbox3, refreshPreview);
onChange(input3, refreshPreview);
onChange(separator_group, () => {
  syncCustomSeparatorInput();
  refreshPreview();
});
onChange(type_group, () => {
  syncTypeControls(false);
  updateSyntax(buildCommand());
});
onChange(decimal_group, refreshPreview);
onClick(b_import, async () => {
  await refreshWorkingDirectory();
  const command = buildCommand();
  if (!filePath()) {
    addError(input1, 'No file selected');
    return;
  }
  if (!syncFileTypeError()) return;
  clearError(input1);
  await run(command, commandDependencies(command));
});
refreshPreview();
