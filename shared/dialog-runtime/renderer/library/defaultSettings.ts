const defaultSettings = {

    fontSize: '13px',
    fontFamily: 'Arial',

    // dialog properties
    dialog: { name: 'NewDialog', title: 'New dialog', width: 640, height: 480, dependencies: ''},

    // available dialog elements
    availableElements: ['Button', 'Checkbox', 'Choice', 'Container', 'Counter', 'Group', 'Input', 'Label', 'Plot', 'Radio', 'Select', 'Separator', 'Slider'],

    // elements -----------------------------------------------------------

    button: { parentId: '', type: 'Button', name: 'button1', label: "My Button", icon: 'none', iconSize: 0, width: 100, height: 22, left: '15', top: '15', isVisible: 'true', isEnabled: 'true', onClick: 'run', elementIds: [], conditions: ''},

    checkbox: { parentId: '', type: 'Checkbox', name: 'checkbox1', label: 'My checkbox', left: '10', top: '10', size: 14, fill: 'true', color: '#70a470', borderColor: '#8c8c8c', disabledColor: '#dedede', isChecked: 'false', isEnabled: 'true', isVisible: 'true', elementIds: [], conditions: ''},

    container: { parentId: '', type: 'Container', name: 'container1', objViewClass: 'variable', variableType: '', parentContainer: '', width: 150, height: 200, selection: 'single', itemOrder: 'false', pinontop: 'false', backgroundColor: '#ffffff', fontColor: '#000000', activeBackgroundColor: '#589658', activeFontColor: '#ffffff', disabledColor: '#d8d8d8', borderColor: '#b8b8b8', left: '15', top: '15', isVisible: 'true', isEnabled: 'true', elementIds: [], conditions: ''},

    counter: { parentId: '', type: 'Counter', name: 'counter1', minval: 1, startval: 1, maxval: 5, width: 25, left: '15', top: '15', space: 4, color: '#558855', borderColor: '#8c8c8c', updownsize: 8, isVisible: 'true', isEnabled: 'true', elementIds: [], conditions: ''},

    input: { parentId: '', type: 'Input', name: 'input1', 'width': 120, height: 22, left: '15', top: '15', borderColor: '#8c8c8c', disabledColor: '#dedede', isVisible: 'true', isEnabled: 'true', value: '', elementIds: [], conditions: ''},

    label: { parentId: '', type: 'Label', name: 'label1', text: 'My label', icon: 'none', iconSize: 0, left: '10', top: '10', fontSize: 13, maxWidth: 200, lineClamp: 1, align: 'left', valign: 'top', rotate: 0, fontWeight: '400', fontColor: '#000000', isVisible: 'true', elementIds: [], conditions: ''},

    plot: { parentId: '', type: 'Plot', name: 'plot1', width: 250, height: 220, left: '15', top: '15', backgroundColor: '#ffffff', borderColor: '#c9c9c9', isVisible: 'true', isEnabled: 'true', elementIds: [], conditions: ''},

    radio: { parentId: '', type: 'Radio', name: 'radio1', radioGroup: 'radiogroup1', label: 'My radiobox', left: '10', top: '10', size: 14, color: '#5b855b', disabledColor: '#dedede', isSelected: 'false', isEnabled: 'true', isVisible: 'true', elementIds: [], conditions: ''},

    select: { parentId: '', type: 'Select', name: 'select1', 'width': 120, label: "My Select", left: '15', top: '15', arrowColor: '#777777', disabledColor: '#dedede', isVisible: 'true', isEnabled: 'true', dataSource: 'custom', dataValue: '', elementIds: [], conditions: ''},

    choice: { parentId: '', type: 'Choice', name: 'choice1', left: '15', top: '15', width: 150, height: 120, items: '', backgroundColor: '#ffffff', fontColor: '#000000', sortable: 'true', ordering: 'no', selection: 'multiple', orientation: 'vertical', align: 'left', activeBackgroundColor: '#e6f1e6', activeFontColor: '#ffffff', borderColor: '#b8b8b8', isVisible: 'true', isEnabled: 'true', elementIds: [], conditions: ''},

    separator: { parentId: '', type: 'Separator', name: 'separator1', direction: 'x', left: '10', top: '10', width: 300, height: 1, length: 300, color: '#000000', isVisible: 'true', elementIds: [], conditions: ''},

    slider: { parentId: '', type: 'Slider', name: 'slider1', left: '15', top: '15', value: 0.5, length: 200, width: 200, height: 8, direction: 'horizontal', color: '#000000', handleshape: 'triangle', handleColor: '#558855', handlesize: 8, isVisible: 'true', isEnabled: 'true', elementIds: [], conditions: ''},

    // metadata-only grouping of child element names
    group: { parentId: '', type: 'Group', name: 'group1', isVisible: 'true', isEnabled: 'true', elementIds: [], conditions: ''}

} as const;

export default defaultSettings;
