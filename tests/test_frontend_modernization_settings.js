const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const settings = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const streaming = fs.readFileSync(path.join(ROOT,"frontend/src/settings/SettingsStreaming.vue"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"static/css/settings-v2.css"),"utf8");

assert(!settings.includes('settings-v2-region-menu'),"route/state Settings facade must not retain Streaming presentation ownership");
assert(streaming.includes('aria-controls="settings-vue-region-menu"'));
assert(streaming.includes(':aria-activedescendant="activeOptionId"'));
for(const key of ["ArrowDown","ArrowUp","Home","End","Enter","Escape","Tab"]){
    assert(streaming.includes(`'${key}'`),`${key} must be handled by the Vue streaming combobox`);
}
assert(streaming.includes('role="option"'));
assert(streaming.includes(':aria-selected="item.code === chosen ? \'true\' : \'false\'"'));
assert(streaming.includes("const activeOptionId = computed"),"active descendant must be derived from the keyboard-active option");
assert(streaming.includes("document.removeEventListener('click', onDocumentClick)"),"Vue owner must clean up the outside-click listener");
assert.strictEqual(
    (streaming.match(/document\.addEventListener\('click', onDocumentClick\)/g)||[]).length,
    1,
    "Streaming Vue owner must have one outside-click registration"
);
assert(streaming.includes("onBeforeUnmount"),"Vue owner must remove document listeners before unmount completes");
assert(css.includes(".settings-v2-region-option.is-active"),"keyboard-active option must be visibly highlighted");

console.log("Frontend modernization Settings interaction tests passed.");
