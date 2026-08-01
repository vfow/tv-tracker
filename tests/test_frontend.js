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
assert(app.includes('function ensureRomanizedTitleForShow'));
assert(app.includes('function loadMoreSearchResults'));
assert(app.includes('function loadMoreDiscoverHubSection'));
const ui = fs.readFileSync('static/js/ui.js','utf8');
assert(ui.includes('modal-title-subtitle'));
assert(ui.includes('View More'));
const tmdb = fs.readFileSync('static/js/tmdb.js','utf8');
assert(tmdb.includes('/alternative_titles'));

console.log('Frontend TMDB-only checks passed');
