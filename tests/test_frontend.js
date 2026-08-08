const assert = require('assert');
const vm = require('vm');

function dateOnlyRelease(dateString){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))){
    return null;
  }
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
}

const release = dateOnlyRelease('2026-07-31');
assert(release instanceof Date);
assert.strictEqual(release.getFullYear(), 2026);
assert.strictEqual(release.getMonth(), 7);
assert.strictEqual(release.getDate(), 1);

const fs = require('fs');
const app = fs.readFileSync('static/js/app.js','utf8');
assert(!app.includes('api.' + 'tv' + 'maze.com'));
assert(app.includes('function cleanLegacyMetadata'));
assert(app.includes('person:{label'));
assert(app.includes('function syncNextEpisodeFromTMDB'));


const router = fs.readFileSync('static/js/app-router.js','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const login = fs.readFileSync('templates/login.html','utf8');
const tmdb = fs.readFileSync('static/js/tmdb.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const db = fs.readFileSync('static/js/db.js','utf8');

assert(router.includes('/app/list/'));
assert(router.includes('/app/show/'));
assert(router.includes('(person|actor|creator|director|writer|producer|editor|composer|cinematographer)'));
assert(!router.includes('#/app'));
assert(template.includes('show-detail-page'));
assert(template.includes('episode-detail-page'));
assert(template.includes('app-router.js'));
assert(!template.includes('static-adapter.js'));
assert(login.includes('Registration coming soon'));
assert(!login.includes('name="next"'));
assert(tmdb.includes('The key is held by Flask'));
assert(!ui.includes('TVTrackerStaticAdapter'));
assert(ui.includes('function safeExternalURL'));
assert(ui.includes('data-person-role="person"'));
assert(ui.includes('const homepageURL = show ? safeExternalURL(show.homepage) : "";'));
assert(!ui.includes('href="${escapeHTML(show.homepage)}"'));

const safeExternalURLSource = ui.slice(
  ui.indexOf('function safeExternalURL'),
  ui.indexOf('function getCheckSuccessAnimationTarget')
);
const securityContext = {URL};
vm.createContext(securityContext);
vm.runInContext(safeExternalURLSource, securityContext);
assert.strictEqual(securityContext.safeExternalURL('https://example.com/path'), 'https://example.com/path');
assert.strictEqual(securityContext.safeExternalURL('http://example.com/'), 'http://example.com/');
assert.strictEqual(securityContext.safeExternalURL('javascript:alert(1)'), '');
assert.strictEqual(securityContext.safeExternalURL('//example.com/path'), '');

assert(!db.includes('login?next='));
assert(db.includes('const SYNC_CHANGE_PAGE_LIMIT = 50;'));
assert(db.includes('baseRevision:Number(SERVER_REVISION || 0)'));
assert(db.includes('let requestRevision = Number(operation.baseRevision || 0);'));
assert(db.includes('operation.baseRevision = Number(SERVER_REVISION || 0);'));
assert(app.includes('history.pushState'));
assert(app.includes('/static/assets/icons/arrow-narrow-left.svg'));

console.log('Frontend integration checks passed');
