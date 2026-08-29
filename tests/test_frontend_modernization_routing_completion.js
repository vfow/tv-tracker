const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const app = read('static/js/app.js');
const ui = read('static/js/ui.js');
const router = read('static/js/app-router.js');

assert(
  app.includes('window.TVTrackerRouter.setPathRoute(cleanRoute,replace === true)'),
  'app.js route writes must delegate to the canonical router with replace intent preserved'
);
assert(!app.includes('history.pushState'), 'app.js must not directly call history.pushState');
assert(!app.includes('history.replaceState'), 'app.js must not directly call history.replaceState');

assert(
  ui.includes('window.TVTrackerRouter.setPathRoute(route,true)'),
  'ui.js search navigation must delegate to the canonical router'
);
assert(!ui.includes('history.pushState'), 'ui.js must not directly call history.pushState');
assert(!ui.includes('history.replaceState'), 'ui.js must not directly call history.replaceState');

const sourceFiles = [];
function collect(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.(js|ts|vue)$/.test(entry.name)) sourceFiles.push(full);
  }
}
collect(path.join(ROOT, 'static/js'));
collect(path.join(ROOT, 'frontend/src'));

const directHistory = /(?:\b(?:window|global)\.)?history\s*(?:\.\s*(?:pushState|replaceState)\s*\(|\[[^\]]+\]\s*\()/;
const owners = sourceFiles
  .filter(file => directHistory.test(fs.readFileSync(file, 'utf8')))
  .map(file => path.relative(ROOT, file).split(path.sep).join('/'))
  .sort();

assert.deepStrictEqual(
  owners,
  ['static/js/app-router.js'],
  'app-router.js must be the sole direct browser-history writer'
);
assert(router.includes('history.pushState'), 'canonical router must retain pushState ownership');
assert(router.includes('history.replaceState'), 'canonical router must retain replaceState ownership');

console.log('Frontend modernization Routing completion contracts passed.');
