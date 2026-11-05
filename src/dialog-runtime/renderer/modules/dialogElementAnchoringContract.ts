import {
    planElementAnchors,
    readElementAnchor,
    type ElementAnchorElement,
    type ElementAnchorIssue
} from '../../core/elementAnchoring';
import type { DialogCreatorElement } from './dialog.types';


export interface DialogElementAnchorContract {
    elements: ElementAnchorElement[];
    metadataErrors: string[];
    issues: ElementAnchorIssue[];
}


export function inspectDialogElementAnchors(
    elements: readonly DialogCreatorElement[]
): DialogElementAnchorContract {
    const metadataErrors: string[] = [];
    const reservedIds = new Set<string>();
    for (const element of elements) {
        reservedIds.add(String(element.id ?? ''));
        if (typeof element.anchorTarget === 'string') {
            reservedIds.add(element.anchorTarget.trim());
        }
    }

    const descriptions = elements.map((element, index): ElementAnchorElement => {
        const sourceId = String(element.id ?? '');
        let id = sourceId;
        if (!id.trim()) {
            id = `__dialog_forge_legacy_${index}`;
            while (reservedIds.has(id)) {
                id = '_' + id;
            }
            reservedIds.add(id);
        }

        const description: ElementAnchorElement = {
            id,
            type: String(element.type || ''),
            name: String(element.nameid || sourceId || `#${index}`),
            parentId: ''
        };
        try {
            description.anchor = readElementAnchor(element);
            if (description.anchor) {
                if (!sourceId.trim()) {
                    throw new Error('An attached element must have an id.');
                }
                const type = description.type.trim().toLowerCase();
                if (!type || type === 'group') {
                    throw new Error('Only non-group elements can use relative positioning.');
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            description.anchorError = message;
            metadataErrors.push(`${description.name}: ${message}`);
        }
        return description;
    });

    const parents = new Map<string, string>();
    elements.forEach((element, index) => {
        if (String(element.type || '').trim().toLowerCase() !== 'group') {
            return;
        }
        const members = Array.isArray(element.elementIds)
            ? element.elementIds
            : String(element.elementIds || '').split(',');
        for (const member of members) {
            parents.set(String(member).trim(), descriptions[index].id);
        }
    });
    descriptions.forEach((description, index) => {
        description.parentId = parents.get(String(elements[index].id ?? '')) || '';
    });

    const plan = planElementAnchors(descriptions);
    return { elements: descriptions, metadataErrors, issues: plan.issues };
}
