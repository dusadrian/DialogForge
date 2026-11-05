let name1 = '';
let name2 = '';
let common = [];
let variables = [];

// R needs quoted names, and c(...) only when there is more than one.
const variableNames = (names) => {
    const text = names.map(name => JSON.stringify(name)).join(', ');
    return names.length === 1 ? text : 'c(' + text + ')';
};

const datasetReference = (container, prefix) => {
    const reference = getReference(container);
    const excluded = getSelected(c_excluded)
        .filter(variable => variable.startsWith(prefix))
        .map(variable => variable.slice(4));
    if (excluded.length === 0) return reference;
    return reference + '[setdiff(names(' + reference + '), ' + variableNames(excluded) + ')]';
};

const buildCommand = () => {
    const keys = getSelected(c_keys);
    let target = name1;
    if (isChecked(new_dataset)) target = getValue(newdataset).trim();

    if (!name1 || !name2 || name1 === name2 || !target) return '';
    if (isChecked(new_dataset) && listObjects('datasets').includes(target)) return '';

    if (isChecked(by_order)) {
        // Indexing beyond the last row fills the shorter dataset with NA.
        const rows = 'rows <- seq_len(max(nrow(' + getReference(dataset1)
            + '), nrow(' + getReference(dataset2) + ')))';
        return rows + '\n' + target + ' <- ' + call('cbind', [
            datasetReference(dataset1, '(1) ') + '[rows, , drop = FALSE]',
            datasetReference(dataset2, '(2) ') + '[rows, , drop = FALSE]'
        ]);
    }
    if (keys.length === 0) return '';

    // Only the chosen keys need to be named in the command.
    const by = variableNames(keys);
    const args = [datasetReference(dataset1, '(1) '), datasetReference(dataset2, '(2) '), 'by = ' + by];
    let lookup = '';

    if (isChecked(lookup1)) {
        lookup = getReference(dataset1);
        args.push('all.y = TRUE');
    } else if (isChecked(lookup2)) {
        lookup = getReference(dataset2);
        args.push('all.x = TRUE');
    }

    const command = target + ' <- ' + call('merge', args);
    if (!lookup) return command;
    // Stop before merging if the lookup has repeated keys.
    return 'stopifnot(!anyDuplicated(' + lookup + '[' + by + ']))\n' + command;
};

const showCommand = () => {
    const useKeys = isChecked(by_keys);
    enable(c_keys, useKeys);
    enable(label_keys, useKeys);
    enable(lookup1, useKeys);
    enable(lookup2, useKeys);
    enable(label_lookup1, useKeys);
    enable(label_lookup2, useKeys);
    show(newdataset, isChecked(new_dataset));
    clearError(newdataset);
    updateSyntax(buildCommand());
};

const showVariables = () => {
    const keys = isChecked(by_keys) ? getSelected(c_keys) : [];
    const excluded = getSelected(c_excluded);
    setValue(c_keys, common.map(name => ({
        name,
        enabled: !excluded.includes('(1) ' + name) && !excluded.includes('(2) ' + name)
    })));
    setSelected(c_keys, keys.filter(name => common.includes(name)));
    setValue(c_excluded, variables.map(name => ({
        name,
        enabled: !keys.includes(name.slice(4))
    })));
    setSelected(c_excluded, excluded.filter(name => variables.includes(name)));
    showCommand();
};

const selectDatasets = () => {
    const selected1 = getSelected(dataset1)[0] || '';
    const selected2 = getSelected(dataset2)[0] || '';
    if (selected1 !== name1 || selected2 !== name2) {
        setSelected(c_keys, []);
        setSelected(c_excluded, []);
    }
    name1 = selected1;
    name2 = selected2;
    common = [];
    variables = [];
    clearError(dataset1, dataset2, c_keys);

    if (name1 && name2 && name1 !== name2) {
        const variables1 = listColumns(name1).map(variable => variable.name || variable);
        const variables2 = listColumns(name2).map(variable => variable.name || variable);
        common = variables1.filter(variable => variables2.includes(variable));
        variables = variables1.map(variable => '(1) ' + variable)
            .concat(variables2.map(variable => '(2) ' + variable));
    }
    showVariables();
};

onChange(dataset1, selectDatasets);
onChange(dataset2, selectDatasets);
onChange(c_keys, () => {
    clearError(c_keys);
    showVariables();
});
onChange(c_excluded, showVariables);
onChange(by_keys, showVariables);
onChange(by_order, showVariables);

onChange(lookup1, () => {
    if (isChecked(lookup1)) uncheck(lookup2);
    clearError(c_keys);
    showCommand();
});
onChange(lookup2, () => {
    if (isChecked(lookup2)) uncheck(lookup1);
    clearError(c_keys);
    showCommand();
});
onChange(new_dataset, showCommand);
onInput(newdataset, showCommand);

onClick(b_reset, () => {
    resetDialog();
    triggerChange(dataset1);
    triggerChange(dataset2);
});

onClick(b_run, async () => {
    selectDatasets();
    if (!name1) {
        addError(dataset1, 'Select dataset 1');
        return;
    }
    if (!name2) {
        addError(dataset2, 'Select dataset 2');
        return;
    }
    if (name1 === name2) {
        addError(dataset2, 'Select a different dataset');
        return;
    }
    if (isChecked(by_keys) && common.length === 0) {
        addError(c_keys, 'No common variables');
        return;
    }
    if (isChecked(by_keys) && getSelected(c_keys).length === 0) {
        addError(c_keys, 'Select at least one key variable');
        return;
    }

    let target = name1;
    if (isChecked(new_dataset)) {
        target = getValue(newdataset).trim();
        if (!target) {
            addError(newdataset, 'New dataset needs a name');
            return;
        }
        if (listObjects('datasets').includes(target)) {
            addError(newdataset, 'A dataset with this name already exists');
            return;
        }
    }

    const result = await run(buildCommand());
    if (result && !result.ok && String(result.error).includes('anyDuplicated')) {
        addError(c_keys, 'Lookup keys must be unique');
    } else if (result && !result.ok) {
        showMessage('Merge failed', result.error, 'error');
    }
    if (result && result.ok) {
        await callExternal('refreshDatasetEditor', { datasetName: target });
    }
});

bindObjects({ dialog: 'addvariables', datasets: dataset1, autoSelect: false, excludeSelected: dataset2 });
bindObjects({ dialog: 'addvariables', datasets: dataset2, autoSelect: false, excludeSelected: dataset1 });
enableSearch(dataset1, dataset2, c_keys, c_excluded);
selectDatasets();
