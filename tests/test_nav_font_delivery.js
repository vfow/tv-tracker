const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname,"..");
const html = fs.readFileSync(path.join(root,"templates","index.html"),"utf8");
const compiledCss = fs.readFileSync(path.join(root,"static","css","tailwind.css"),"utf8");
const sourceCss = fs.readFileSync(path.join(root,"static","css","tailwind-input.css"),"utf8");

const leagueFontPath = path.join(root,"static","assets","league-gothic.regular.woff2");
const leagueFontVersion = crypto.createHash("sha256")
    .update(fs.readFileSync(leagueFontPath))
    .digest("hex")
    .slice(0,12);
const leagueFontCssUrl = `../assets/league-gothic.regular.woff2?v=${leagueFontVersion}`;

assert.ok(
    html.includes("filename='assets/league-gothic.regular.woff2'") && html.includes('type="font/woff2"'),
    "League Gothic WOFF2 should be preloaded with the matching MIME type"
);
assert.ok(
    sourceCss.includes(`src:url("${leagueFontCssUrl}") format("woff2")`),
    "source CSS must use the same content version as the preload"
);
assert.ok(
    compiledCss.includes(`league-gothic.regular.woff2?v=${leagueFontVersion}`),
    "compiled CSS must preserve the versioned WOFF2 URL"
);
assert.ok(!html.includes("league-gothic.regular.ttf"));
assert.ok(!sourceCss.includes("league-gothic.regular.ttf"));
assert.ok(!compiledCss.includes("league-gothic.regular.ttf"));
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
