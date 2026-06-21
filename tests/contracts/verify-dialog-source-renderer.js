"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createSourceDialogControlPlans, createSourceDialogControlPlansFromModel, renderSourceDialogControls } = require("../../shared/base-app/features/dialog-host/dialogSourceRenderer");
assert.deepStrictEqual(createSourceDialogControlPlans([
    {
        id: "label-id",
        type: "Label",
        name: "label1",
        value: "Dataset:",
        valign: "bottom",
        left: 12,
        top: 18,
        width: 100
    },
    {
        id: "input-id",
        type: "Input",
        name: "input1",
        left: 120,
        top: 14,
        width: 160,
        height: 22
    },
    {
        id: "format-id",
        type: "Select",
        name: "format",
        value: "csv",
        dataValue: "csv,tsv,text,rds",
        left: 12,
        top: 42
    },
    {
        type: "Plot",
        name: "plot1",
        left: -4,
        top: 60
    }
]).map((plan) => {
    return {
        id: plan.id,
        type: plan.type,
        name: plan.name,
        text: plan.text,
        left: plan.left,
        top: plan.top,
        width: plan.width,
        height: plan.height,
        tag: plan.tag,
        checked: plan.checked,
        selected: plan.selected,
        visible: plan.visible,
        enabled: plan.enabled,
        options: plan.options,
        valign: plan.valign,
        plotPayload: plan.plotPayload
    };
}), [
    {
        id: "label-id",
        type: "Label",
        name: "label1",
        text: "Dataset:",
        left: 12,
        top: 18,
        width: 100,
        height: 22,
        tag: "label",
        checked: false,
        selected: [],
        visible: true,
        enabled: true,
        options: [],
        valign: "bottom",
        plotPayload: null
    },
    {
        id: "input-id",
        type: "Input",
        name: "input1",
        text: "input1",
        left: 120,
        top: 14,
        width: 160,
        height: 22,
        tag: "input",
        checked: false,
        selected: [],
        visible: true,
        enabled: true,
        options: [],
        valign: "top",
        plotPayload: null
    },
    {
        id: "format-id",
        type: "Select",
        name: "format",
        text: "csv",
        left: 12,
        top: 42,
        width: 160,
        height: 24,
        tag: "select",
        checked: false,
        selected: ["csv"],
        visible: true,
        enabled: true,
        options: ["csv", "tsv", "text", "rds"],
        valign: "top",
        plotPayload: null
    },
    {
        id: "plot1",
        type: "Plot",
        name: "plot1",
        text: "plot1",
        left: 0,
        top: 60,
        width: 300,
        height: 220,
        tag: "plot",
        checked: false,
        selected: [],
        visible: true,
        enabled: true,
        options: [],
        valign: "top",
        plotPayload: null
    }
]);
assert.deepStrictEqual(createSourceDialogControlPlans([
    {
        id: "container-id",
        type: "Container",
        name: "c_variables",
        selection: "multiple",
        width: 140,
        height: 80
    },
    {
        id: "radio-id",
        type: "Radio",
        name: "r_yes",
        group: "group1",
        isSelected: true
    },
    {
        id: "counter-id",
        type: "Counter",
        name: "cnt_nth",
        startval: 2,
        minval: 1,
        maxval: 6,
        isEnabled: false,
        isVisible: false
    }
]).map((plan) => {
    return {
        name: plan.name,
        tag: plan.tag,
        checked: plan.checked,
        visible: plan.visible,
        enabled: plan.enabled,
        multiple: plan.multiple,
        group: plan.group,
        inputType: plan.inputType,
        min: plan.min,
        max: plan.max
    };
}), [
    {
        name: "c_variables",
        tag: "select",
        checked: false,
        visible: true,
        enabled: true,
        multiple: true,
        group: "",
        inputType: "text",
        min: 0,
        max: 100
    },
    {
        name: "r_yes",
        tag: "radio",
        checked: true,
        visible: true,
        enabled: true,
        multiple: false,
        group: "group1",
        inputType: "text",
        min: 0,
        max: 100
    },
    {
        name: "cnt_nth",
        tag: "input",
        checked: false,
        visible: false,
        enabled: false,
        multiple: false,
        group: "",
        inputType: "number",
        min: 1,
        max: 6
    }
]);
assert.deepStrictEqual(createSourceDialogControlPlansFromModel([
    {
        id: "select-id",
        type: "Select",
        name: "select1",
        value: "tt1",
        dataValue: "tt1,tt2"
    },
    {
        id: "check-id",
        type: "Checkbox",
        name: "custom"
    }
], {
    controls: {
        select1: {
            selected: ["tt2"]
        },
        custom: {
            checked: true,
            visible: false,
            enabled: false,
            errors: ["Required"]
        }
    }
}).map((plan) => {
    return {
        name: plan.name,
        text: plan.text,
        options: plan.options,
        selected: plan.selected,
        checked: plan.checked,
        visible: plan.visible,
        enabled: plan.enabled,
        errors: plan.errors
    };
}), [
    {
        name: "select1",
        text: "tt1",
        options: ["tt1", "tt2"],
        selected: ["tt2"],
        checked: false,
        visible: true,
        enabled: true,
        errors: []
    },
    {
        name: "custom",
        text: "custom",
        options: [],
        selected: [],
        checked: true,
        visible: false,
        enabled: false,
        errors: ["Required"]
    }
]);
assert.deepStrictEqual(createSourceDialogControlPlansFromModel([
    {
        id: "format-id",
        type: "Select",
        name: "format",
        value: "csv",
        dataValue: "csv,tsv,text,rds"
    }
], {
    controls: {
        format: {
            value: "tsv"
        }
    }
}).map((plan) => {
    return {
        name: plan.name,
        text: plan.text,
        options: plan.options,
        selected: plan.selected
    };
}), [
    {
        name: "format",
        text: "tsv",
        options: ["csv", "tsv", "text", "rds"],
        selected: ["tsv"]
    }
]);
const createFakeElement = function (tagName) {
    const element = {
        tagName,
        children: [],
        classNames: [],
        dataset: {},
        style: {},
        title: "",
        textContent: "",
        appendChild: function (child) {
            this.children.push(child);
        },
        addEventListener: function () {
            return undefined;
        }
    };
    element.classList = {
        add: function (name) {
            element.classNames.push(name);
        }
    };
    return element;
};
const fakeDocument = {
    createElement: function (tagName) {
        return createFakeElement(tagName);
    }
};
const renderedPayloads = [];
const renderHost = fakeDocument.createElement("div");
renderSourceDialogControls(fakeDocument, renderHost, [
    {
        id: "plot-id",
        type: "Plot",
        name: "plot_qca",
        value: "Fallback plot",
        left: 10,
        top: 20,
        width: 320,
        height: 240
    }
], {
    controls: {
        plot_qca: {
            plotPayload: {
                points: [
                    { x: 0, y: 1 }
                ]
            }
        }
    }
}, {
    renderPlotPayload: function (host, payload) {
        renderedPayloads.push(payload);
        host.textContent = "product plot rendered";
        return true;
    }
});
const plotSurface = renderHost.children[0];
const plotNode = plotSurface.children[0];
assert.deepStrictEqual(renderedPayloads, [
    {
        points: [
            { x: 0, y: 1 }
        ]
    }
]);
assert.strictEqual(plotNode.textContent, "product plot rendered");
assert.strictEqual(plotNode.dataset.controlName, "plot_qca");
assert.strictEqual(plotNode.dataset.controlType, "Plot");

renderHost.children.length = 0;
renderSourceDialogControls(fakeDocument, renderHost, [
    {
        id: "label-valign-id",
        type: "Label",
        name: "label_top",
        value: "Aligned label",
        valign: "bottom",
        left: 20,
        top: 30,
        width: 140,
        height: 40
    }
]);

const labelSurface = renderHost.children[0];
const labelNode = labelSurface.children[0];
assert.strictEqual(labelNode.style.display, "flex");
assert.strictEqual(labelNode.style.alignItems, "flex-end");
assert.strictEqual(plotNode.style.width, "320px");
assert.strictEqual(plotNode.style.height, "240px");
console.log("Dialog source renderer planning verified.");
