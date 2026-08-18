"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadPolicy(profile = {}) {
  const window = {
    DATA: { profile },
    sessionStorage: {
      length: 0,
      key(){ return null; },
      removeItem(){}
    }
  };
  window.window = window;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "static", "js", "adult-filter.js"), "utf8"),
    { window },
    { filename: "adult-filter.js" }
  );
  return { window, policy: window.TVTrackerAdultPolicy };
}

{
  const { policy } = loadPolicy({});
  assert.strictEqual(policy.enabled(), true, "Adult Filter must default ON");
  assert.strictEqual(policy.includeAdultParam("movie"), "false");
  assert.strictEqual(policy.includeAdultParam("tv"), "false");
}

{
  const { policy } = loadPolicy({ adult_filter: false });
  assert.strictEqual(policy.enabled(), false);
  assert.strictEqual(policy.includeAdultParam("movie"), "true");
  assert.strictEqual(policy.includeAdultParam("tv"), "true");
}

{
  const visible = { id: 1, adult: false };
  const hidden = { id: 2, adult: true };
  const source = [visible, hidden];
  const { policy } = loadPolicy({ adult_filter: true });
  const filtered = policy.filterItems(source);

  assert.deepStrictEqual(Array.from(filtered, item => item.id), [1]);
  assert.strictEqual(source.length, 2, "Filtering must hide adult titles, never delete tracker/cache data");
  assert.strictEqual(source[1], hidden, "Filtering must not rewrite the hidden record");
}

{
  const payload = { page: 1, results: [{ id: 1, adult: true }, { id: 2, adult: false }] };
  const { policy } = loadPolicy({ adult_filter: true });
  const filtered = policy.filterPayload(payload);

  assert.notStrictEqual(filtered, payload, "Filtered TMDB result payload should be a shallow copy");
  assert.deepStrictEqual(Array.from(filtered.results, item => item.id), [2]);
  assert.strictEqual(payload.results.length, 2, "Original TMDB payload must remain intact");
}

console.log("Phase 4 adult policy contracts passed.");
