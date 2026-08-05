const assert = require('assert');

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
assert(app.includes('function syncNextEpisodeFromTMDB'));


const router = fs.readFileSync('static/js/v2-router.js','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const login = fs.readFileSync('templates/login.html','utf8');
const tmdb = fs.readFileSync('static/js/tmdb.js','utf8');
const ui = fs.readFileSync('static/js/ui.js','utf8');
const db = fs.readFileSync('static/js/db.js','utf8');

assert(router.includes('/app/watchlist'));
assert(router.includes('/app/show/'));
assert(!router.includes('#/app'));
assert(template.includes('show-detail-page'));
assert(template.includes('episode-detail-page'));
assert(template.includes('v2-router.js'));
assert(!template.includes('static-adapter.js'));
assert(login.includes('Registration coming soon'));
assert(!login.includes('name="next"'));
assert(tmdb.includes('The key is held by Flask'));
assert(!ui.includes('TVTrackerStaticAdapter'));
assert(!db.includes('login?next='));
assert(db.includes('const SYNC_CHANGE_PAGE_LIMIT = 50;'));
assert(db.includes('baseRevision:Number(SERVER_REVISION || 0)'));
assert(db.includes('let requestRevision = Number(operation.baseRevision || 0);'));
assert(db.includes('operation.baseRevision = Number(SERVER_REVISION || 0);'));
assert(app.includes('history.pushState'));
assert(app.includes('/static/assets/icons/arrow-narrow-left.svg'));

console.log('Frontend V2 integration checks passed');
