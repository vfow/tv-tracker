const assert = require("assert");
const fs = require("fs");
const path = require("path");

const template = fs.readFileSync(path.join(__dirname,"..","templates","index.html"),"utf8");

assert.ok(
    template.includes('rel="preload"') && template.includes("league-gothic.regular.ttf"),
    "League Gothic should still be preloaded"
);

assert.ok(
    !/html:not\(\.tt-display-font-ready\)[\s\S]{0,400}visibility\s*:\s*hidden/i.test(template),
    "Display navigation must not be hidden while League Gothic loads"
);

assert.ok(
    template.includes('"Arial Narrow"') && template.includes('"Liberation Sans Narrow"'),
    "Startup display navigation should use a condensed visible fallback"
);

assert.ok(
    template.includes("document.fonts.load") && template.includes("tt-display-font-ready"),
    "League Gothic readiness should still switch the fallback to the real display font"
);

console.log("Startup font visibility regression tests passed.");
