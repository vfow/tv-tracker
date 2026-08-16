const assert = require("assert");
const fs = require("fs");
const path = require("path");

const template = fs.readFileSync(path.join(__dirname,"..","templates","index.html"),"utf8");
const css = fs.readFileSync(path.join(__dirname,"..","static","css","tailwind.css"),"utf8");

assert.ok(
    template.includes('rel="preload"') && template.includes("league-gothic.regular.woff2"),
    "League Gothic WOFF2 should remain preloaded"
);

assert.ok(
    template.includes('class="tw-font-league"'),
    "Primary navigation should keep the explicit League Gothic utility"
);

assert.ok(
    css.includes("league-gothic.regular.woff2") || css.includes("League Gothic"),
    "Compiled CSS should retain the League Gothic font declaration"
);

console.log("Startup font delivery regression tests passed.");
