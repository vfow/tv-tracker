const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname,"..");
const settings = fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"static/css/settings-v2.css"),"utf8");

assert(settings.includes('aria-controls="settings-v2-region-menu"'));
assert(settings.includes('aria-activedescendant=""'));
for(const key of ["ArrowDown","ArrowUp","Home","End","Enter","Escape","Tab"]){
    assert(settings.includes(`event.key === "${key}"`),`${key} must be handled by the streaming combobox`);
}
assert(settings.includes('role="option" aria-selected="${active ? "true" : "false"}"'));
assert(settings.includes('input.setAttribute("aria-activedescendant",optionId(visibleCountries[activeIndex]))'));
assert(settings.includes('global.document.removeEventListener("click",streamingOutsideClickHandler)'));
assert(settings.includes('streamingOutsideClickHandler = event=>'));
assert.strictEqual(
    (settings.match(/global\.document\.addEventListener\("click",streamingOutsideClickHandler\)/g)||[]).length,
    1,
    "Settings must have one owned outside-click registration"
);
assert(settings.includes("cleanupStreamingBinding();\n        container.innerHTML"),"re-render must remove the previous document listener first");
assert(css.includes(".settings-v2-region-option.is-active"),"keyboard-active option must be visibly highlighted");

console.log("Frontend modernization Settings interaction tests passed.");
