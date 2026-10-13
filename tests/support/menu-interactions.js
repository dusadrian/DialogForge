"use strict";


const openMenuItem = async function(page, label) {
    const item = page.locator("#webMenuBar .web-menu-item").filter({
        hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[›>]?$`)
    });
    const ancestors = await item.evaluate((button) => {
        const labels = [];
        let parent = button.parentElement;
        while (parent) {
            if (parent.classList.contains("web-menu-root")
                || parent.classList.contains("web-menu-submenu")) {
                const trigger = parent.querySelector(":scope > button");
                if (trigger !== button) {
                    labels.unshift(trigger.textContent.trim());
                }
            }
            parent = parent.parentElement;
        }
        return labels;
    });
    for (const [index, text] of ancestors.entries()) {
        const trigger = page.locator(index === 0
            ? "#webMenuBar .web-menu-button" : "#webMenuBar .web-menu-item"
        ).filter({ hasText: text });
        if (index === 0) {
            await trigger.click();
        }
        else {
            await trigger.hover();
        }
    }
    await item.click();
};


module.exports = { openMenuItem };
