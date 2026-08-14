const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname,"..");
const html = fs.readFileSync(path.join(root,"templates","index.html"),"utf8");
const compiledCss = fs.readFileSync(path.join(root,"static","css","tailwind.css"),"utf8");
const sourceCss = fs.readFileSync(path.join(root,"static","css","tailwind-input.css"),"utf8");

assert.ok(html.includes("league-gothic.regular.ttf"),"League Gothic should remain preloaded");
assert.ok(!html.includes("tt-display-font-ready"),"startup font-ready JS/CSS hack should be removed");
assert.ok(!html.includes("Arial Narrow"),"temporary condensed fallback should be removed");

const displayNavLinks = [
    ...html.matchAll(/<a\s+([^>]*?)data-page="(?:shows|discover|profile|settings)"[^>]*>/g),
    ...html.matchAll(/<a\s+([^>]*?)data-tab="(?:watchlist|upcoming|history)"[^>]*>/g)
];

assert.strictEqual(displayNavLinks.length,11,"expected 8 primary/mobile links and 3 top-tab links");
for(const match of displayNavLinks){
    assert.match(match[0],/class="[^"]*\btw-font-league\b[^"]*"/,`display nav link is missing tw-font-league: ${match[0]}`);
}

assert.ok(
    compiledCss.includes(".tw-font-league{font-family:League Gothic,Arial,sans-serif}"),
    "compiled Tailwind CSS must expose the League Gothic utility used by nav anchors"
);

assert.ok(
    sourceCss.includes(".sidebar .sidebar-nav :is(button,a)") &&
    sourceCss.includes(".top-tabs :is(button,a)") &&
    sourceCss.includes(".mobile-bottom-nav :is(button,a)"),
    "Tailwind source should continue supporting semantic nav links"
);

console.log("Navigation font delivery regression tests passed.");
